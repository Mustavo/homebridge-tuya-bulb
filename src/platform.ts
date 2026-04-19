import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type {
  API,
  DynamicPlatformPlugin,
  Logging,
  PlatformAccessory,
  PlatformConfig,
  Service,
  Characteristic,
} from 'homebridge';
import { TuyaDevice } from './tuya/device';
import { BulbAccessory } from './bulb-accessory';
import { GroupAccessory } from './group-accessory';
import type { TuyaDevicesFile, TuyaDeviceConfig, TuyaGroup } from './types';

export const PLUGIN_NAME = 'homebridge-tuya-bulb';
export const PLATFORM_NAME = 'TuyaBulb';

export class TuyaBulbPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;
  private readonly cachedAccessories: Map<string, PlatformAccessory> = new Map();
  private readonly devices: Map<string, TuyaDevice> = new Map();
  private readonly devicesPath: string;
  private readonly heartbeatInterval: number;
  private readonly reconnectAttempts: number;

  constructor(
    public readonly log: Logging,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.Service = this.api.hap.Service;
    this.Characteristic = this.api.hap.Characteristic;
    const storagePath = process.env['UIX_STORAGE_PATH'] ?? path.join(os.homedir(), '.homebridge');
    this.devicesPath = path.join(storagePath, 'tuya-devices.json');
    this.heartbeatInterval = (config['heartbeatInterval'] as number | undefined) ?? 10;
    this.reconnectAttempts = (config['reconnectAttempts'] as number | undefined) ?? 3;

    this.api.on('didFinishLaunching', () => { this.discoverDevices(); });
    this.api.on('shutdown', () => { this.shutdown(); });
  }

  configureAccessory(accessory: PlatformAccessory): void {
    this.cachedAccessories.set(accessory.UUID, accessory);
  }

  private loadDevicesFile(): TuyaDevicesFile | null {
    if (!fs.existsSync(this.devicesPath)) {
      this.log.warn('tuya-devices.json not found. Use the Config UI or CLI to fetch device keys first.');
      return null;
    }
    try {
      return JSON.parse(fs.readFileSync(this.devicesPath, 'utf8')) as TuyaDevicesFile;
    } catch (e) {
      this.log.error(`Failed to parse tuya-devices.json: ${String(e)}`);
      return null;
    }
  }

  private discoverDevices(): void {
    const file = this.loadDevicesFile();
    if (!file) return;

    const opts = { heartbeatInterval: this.heartbeatInterval, reconnectAttempts: this.reconnectAttempts };
    const groups = file.groups ?? [];
    const groupMemberIds = new Set(groups.flatMap((g) => g.members));

    for (const deviceConfig of file.devices) {
      const dev = new TuyaDevice(deviceConfig, opts);
      dev.on('unreachable', () => {
        this.log.warn(`${deviceConfig.name}: device unreachable after ${this.reconnectAttempts} attempts`);
      });
      this.devices.set(deviceConfig.id, dev);
      dev.connect().catch((e: Error) => this.log.error(`${deviceConfig.name}: initial connect failed: ${e.message}`));
    }

    for (const group of groups) {
      this.registerGroup(group);
    }

    for (const deviceConfig of file.devices) {
      const inGroup = groupMemberIds.has(deviceConfig.id);
      const exposedByGroup = inGroup && groups.some(
        (g) => g.members.includes(deviceConfig.id) && g.exposeIndividual,
      );
      if (!inGroup || exposedByGroup) {
        this.registerBulb(deviceConfig);
      }
    }
  }

  private registerBulb(deviceConfig: TuyaDeviceConfig): void {
    const uuid = this.api.hap.uuid.generate(`tuya-bulb-${deviceConfig.id}`);
    const existing = this.cachedAccessories.get(uuid);
    const device = this.devices.get(deviceConfig.id);
    if (!device) return;

    if (existing) {
      this.log.info(`Restoring cached accessory: ${deviceConfig.name}`);
      new BulbAccessory(this, existing, device);
    } else {
      this.log.info(`Registering new accessory: ${deviceConfig.name}`);
      const accessory = new this.api.platformAccessory(deviceConfig.name, uuid);
      accessory.context['deviceId'] = deviceConfig.id;
      new BulbAccessory(this, accessory, device);
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    }
  }

  private registerGroup(group: TuyaGroup): void {
    const uuid = this.api.hap.uuid.generate(`tuya-group-${group.name}`);
    const existing = this.cachedAccessories.get(uuid);
    const memberDevices = group.members
      .map((id) => this.devices.get(id))
      .filter((d): d is TuyaDevice => d !== undefined);
    const primaryDevice = this.devices.get(group.primary);
    if (!primaryDevice || memberDevices.length === 0) return;

    if (existing) {
      this.log.info(`Restoring cached group: ${group.name}`);
      new GroupAccessory(this, existing, memberDevices, primaryDevice, group.name);
    } else {
      this.log.info(`Registering new group: ${group.name}`);
      const accessory = new this.api.platformAccessory(group.name, uuid);
      accessory.context['groupName'] = group.name;
      new GroupAccessory(this, accessory, memberDevices, primaryDevice, group.name);
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    }
  }

  private shutdown(): void {
    for (const device of this.devices.values()) {
      device.disconnect();
    }
  }
}
