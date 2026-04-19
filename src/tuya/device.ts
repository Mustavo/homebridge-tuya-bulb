import { EventEmitter } from 'events';
import { exec } from 'child_process';
import { promisify } from 'util';
import TuyAPI from 'tuyapi';
import type { TuyaDeviceConfig, DeviceState, DPs } from '../types';
import {
  tuyaToBrightness,
  tempToMired,
  decodeColour,
  tuyaSatToHk,
} from './protocol';

const execAsync = promisify(exec);

export interface DeviceOptions {
  heartbeatInterval: number;
  reconnectAttempts: number;
}

export class TuyaDevice extends EventEmitter {
  private api: InstanceType<typeof TuyAPI> | null = null;
  private connected = false;
  private failCount = 0;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private currentState: DeviceState = {
    on: false,
    brightness: 100,
    colorTemperature: 370,
    hue: 0,
    saturation: 0,
    mode: 'white',
  };

  constructor(
    private readonly config: TuyaDeviceConfig,
    private readonly opts: DeviceOptions,
  ) {
    super();
  }

  private async resolveIp(): Promise<string> {
    if (!this.config.mac) {
      if (this.config.ip) return this.config.ip;
      throw new Error(`Device ${this.config.name}: no MAC or IP configured`);
    }
    const { stdout } = await execAsync('arp -a');
    const mac = this.config.mac.toLowerCase();
    for (const line of stdout.split('\n')) {
      if (line.toLowerCase().includes(mac)) {
        const m = line.match(/\((\d+\.\d+\.\d+\.\d+)\)/);
        if (m) return m[1];
      }
    }
    if (this.config.ip) return this.config.ip;
    throw new Error(`Device ${this.config.name}: MAC ${this.config.mac} not found in ARP cache`);
  }

  private parseDps(dps: Record<string | number, unknown>): void {
    const state = { ...this.currentState };
    if (typeof dps[20] === 'boolean') state.on = dps[20];
    if (typeof dps[21] === 'string') state.mode = dps[21] as DeviceState['mode'];
    if (typeof dps[22] === 'number') state.brightness = tuyaToBrightness(dps[22]);
    if (typeof dps[23] === 'number') state.colorTemperature = tempToMired(dps[23]);
    if (typeof dps[24] === 'string' && dps[24].length === 12) {
      const { h, s } = decodeColour(dps[24]);
      state.hue = h;
      state.saturation = tuyaSatToHk(s);
    }
    this.currentState = state;
    this.emit('state', state);
  }

  async connect(): Promise<void> {
    if (this.connected) return;
    const ip = await this.resolveIp();
    this.api = new TuyAPI({
      id: this.config.id,
      key: this.config.key,
      ip,
      version: '3.4' as unknown as number,
    });

    this.api.on('dp-refresh', (data: { dps: Record<string | number, unknown> }) => {
      this.parseDps(data.dps);
    });

    this.api.on('data', (data: { dps?: Record<string | number, unknown> }) => {
      if (data.dps) this.parseDps(data.dps);
    });

    this.api.on('disconnected', () => {
      this.connected = false;
      this.failCount = 0;
      if (this.heartbeatTimer) {
        clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = null;
      }
      this.scheduleReconnect();
    });

    this.api.on('error', (_err: Error) => {
      if (this.connected) {
        this.connected = false;
        if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }
        this.scheduleReconnect();
      }
    });

    try {
      await this.api.connect();
      this.connected = true;
      this.failCount = 0;
      this.startHeartbeat();
      const status = await this.api.get({ schema: true } as Parameters<typeof this.api.get>[0]);
      if (status && (status as { dps?: Record<string | number, unknown> }).dps) {
        this.parseDps((status as { dps: Record<string | number, unknown> }).dps);
      }
    } catch (err) {
      this.failCount++;
      if (this.failCount >= this.opts.reconnectAttempts) {
        this.emit('unreachable', err);
      } else {
        this.scheduleReconnect();
      }
      throw err;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    const delay = Math.min(1000 * Math.pow(2, this.failCount), 60000);
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      try {
        await this.connect();
      } catch {
        /* handled in connect() */
      }
    }, delay);
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(async () => {
      if (!this.connected || !this.api) return;
      try {
        await this.api.get({} as Parameters<typeof this.api.get>[0]);
      } catch {
        /* disconnected event will fire */
      }
    }, this.opts.heartbeatInterval * 1000);
  }

  async set(dps: DPs): Promise<void> {
    if (!this.api || !this.connected) throw new Error(`Device ${this.config.name} not connected`);
    await this.api.set({ dps } as unknown as Parameters<typeof this.api.set>[0]);
  }

  getState(): DeviceState {
    return { ...this.currentState };
  }

  isConnected(): boolean {
    return this.connected;
  }

  getName(): string {
    return this.config.name;
  }

  disconnect(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.api) {
      this.api.disconnect();
      this.api = null;
    }
    this.connected = false;
  }
}
