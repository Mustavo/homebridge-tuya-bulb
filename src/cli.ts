import { Command } from 'commander';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as net from 'net';
import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import TuyAPI from 'tuyapi';
import { fetchDevices } from './tuya/cloud';
import type { TuyaDevicesFile, TuyaDeviceConfig } from './types';

const execAsync = promisify(exec);
const program = new Command();
const DEVICES_PATH = path.join(process.env['UIX_STORAGE_PATH'] ?? `${process.env['HOME']}/.homebridge`, 'tuya-devices.json');
const TUYA_OUI = 'cc:8c:bf';

async function scanArp(): Promise<Array<{ ip: string; mac: string }>> {
  const { stdout } = await execAsync('arp -a');
  const results: Array<{ ip: string; mac: string }> = [];
  for (const line of stdout.split('\n')) {
    const macMatch = line.match(/([0-9a-f]{2}[:-]){5}[0-9a-f]{2}/i);
    const ipMatch = line.match(/\((\d+\.\d+\.\d+\.\d+)\)/);
    if (macMatch && ipMatch) {
      const mac = macMatch[0].toLowerCase().replace(/-/g, ':');
      if (mac.startsWith(TUYA_OUI)) {
        results.push({ ip: ipMatch[1], mac });
      }
    }
  }
  return results;
}

async function checkPort(ip: string, port: number, timeoutMs = 1000): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.createConnection({ host: ip, port });
    const timer = setTimeout(() => { s.destroy(); resolve(false); }, timeoutMs);
    s.on('connect', () => { clearTimeout(timer); s.destroy(); resolve(true); });
    s.on('error', () => { clearTimeout(timer); resolve(false); });
  });
}

function loadDevicesFile(): TuyaDevicesFile {
  if (!fs.existsSync(DEVICES_PATH)) return { devices: [], groups: [] };
  return JSON.parse(fs.readFileSync(DEVICES_PATH, 'utf8')) as TuyaDevicesFile;
}

program
  .name('tuya')
  .description('homebridge-tuya-bulb diagnostic CLI');

program
  .command('discover')
  .description('ARP scan for Tuya OUI devices and check port 6668')
  .action(async () => {
    console.log(`Scanning ARP cache for ${TUYA_OUI} devices...`);
    const found = await scanArp();
    if (found.length === 0) {
      console.log('No Tuya devices found. Ping your network first: ping -b 192.168.1.255');
      return;
    }
    for (const { ip, mac } of found) {
      const open = await checkPort(ip, 6668);
      console.log(`${ip}  ${mac}  port 6668: ${open ? 'OPEN' : 'closed'}`);
    }
  });

program
  .command('fetch-keys')
  .description('Fetch device keys from Tuya IoT Cloud API and save to tuya-devices.json')
  .action(async () => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const ask = (q: string): Promise<string> => new Promise((r) => rl.question(q, r));
    const clientId = await ask('Client ID: ');
    const clientSecret = await ask('Client Secret: ');
    const regionInput = await ask('Region [auto/eu/us/cn/in] (default: auto): ');
    rl.close();
    const region = regionInput.trim() || 'auto';
    console.log('Fetching devices...');
    const devices = await fetchDevices(clientId.trim(), clientSecret.trim(), region);
    const existing = loadDevicesFile();
    const data: TuyaDevicesFile = { devices, groups: existing.groups ?? [] };
    fs.writeFileSync(DEVICES_PATH, JSON.stringify(data, null, 2));
    console.log(`Saved ${devices.length} devices to ${DEVICES_PATH}`);
    devices.forEach((d) => console.log(`  ${d.name} (${d.id}) — ${d.online ? 'online' : 'offline'}`));
  });

program
  .command('status <ip>')
  .description('Dump live DP state for device at <ip> (requires device in tuya-devices.json)')
  .action(async (ip: string) => {
    const { devices } = loadDevicesFile();
    const config = devices.find((d: TuyaDeviceConfig) => d.ip === ip);
    if (!config) { console.error(`No device found with ip ${ip} in tuya-devices.json`); process.exit(1); }
    const api = new TuyAPI({ id: config.id, key: config.key, ip, version: '3.4' as unknown as number });
    await api.connect();
    const status = await api.get({ schema: true } as Parameters<typeof api.get>[0]);
    console.log(JSON.stringify(status, null, 2));
    api.disconnect();
  });

program
  .command('set <ip> <dp> <value>')
  .description('Set a DP directly. value: true/false for bool, number for int, string for string')
  .action(async (ip: string, dpStr: string, valueStr: string) => {
    const { devices } = loadDevicesFile();
    const config = devices.find((d: TuyaDeviceConfig) => d.ip === ip);
    if (!config) { console.error(`No device found with ip ${ip} in tuya-devices.json`); process.exit(1); }
    let value: boolean | number | string = valueStr;
    if (valueStr === 'true') value = true;
    else if (valueStr === 'false') value = false;
    else if (!isNaN(Number(valueStr))) value = Number(valueStr);
    const api = new TuyAPI({ id: config.id, key: config.key, ip, version: '3.4' as unknown as number });
    await api.connect();
    await api.set({ dps: { [parseInt(dpStr)]: value } } as unknown as Parameters<typeof api.set>[0]);
    console.log(`DP${dpStr} = ${JSON.stringify(value)} sent`);
    api.disconnect();
  });

program
  .command('monitor <ip>')
  .description('Stream live state events from device (Ctrl-C to stop)')
  .action(async (ip: string) => {
    const { devices } = loadDevicesFile();
    const config = devices.find((d: TuyaDeviceConfig) => d.ip === ip);
    if (!config) { console.error(`No device found with ip ${ip} in tuya-devices.json`); process.exit(1); }
    const api = new TuyAPI({ id: config.id, key: config.key, ip, version: '3.4' as unknown as number });
    api.on('data', (d: unknown) => console.log(new Date().toISOString(), JSON.stringify(d)));
    api.on('dp-refresh', (d: unknown) => console.log(new Date().toISOString(), JSON.stringify(d)));
    api.on('disconnected', () => { console.log('Disconnected'); process.exit(0); });
    await api.connect();
    console.log(`Monitoring ${ip} — Ctrl-C to stop`);
  });

program
  .command('group-test <name>')
  .description('Fan out current primary state to all group members')
  .action(async (name: string) => {
    const file = loadDevicesFile();
    const group = file.groups?.find((g) => g.name === name);
    if (!group) { console.error(`Group "${name}" not found`); process.exit(1); }
    const primary = file.devices.find((d) => d.id === group.primary);
    if (!primary || !primary.ip) { console.error('Primary device has no IP configured'); process.exit(1); }
    const pApi = new TuyAPI({ id: primary.id, key: primary.key, ip: primary.ip, version: '3.4' as unknown as number });
    await pApi.connect();
    const status = await pApi.get({ schema: true } as Parameters<typeof pApi.get>[0]) as { dps: Record<number, unknown> };
    pApi.disconnect();
    console.log(`Primary ${primary.name} state:`, status.dps);
    for (const memberId of group.members) {
      if (memberId === primary.id) continue;
      const member = file.devices.find((d) => d.id === memberId);
      if (!member?.ip) { console.warn(`Member ${memberId}: no IP, skipping`); continue; }
      const mApi = new TuyAPI({ id: member.id, key: member.key, ip: member.ip, version: '3.4' as unknown as number });
      try {
        await mApi.connect();
        await mApi.set({ dps: status.dps } as unknown as Parameters<typeof mApi.set>[0]);
        console.log(`  ${member.name}: synced`);
        mApi.disconnect();
      } catch (e) {
        console.warn(`  ${member.name}: failed — ${String(e)}`);
      }
    }
  });

program.parse(process.argv);
