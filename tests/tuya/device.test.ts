jest.mock('tuyapi');
jest.mock('child_process');

import { EventEmitter } from 'events';
import TuyAPI from 'tuyapi';
import { exec } from 'child_process';
import { TuyaDevice } from '../../src/tuya/device';
import type { TuyaDeviceConfig } from '../../src/types';

const MockTuyAPI = TuyAPI as jest.MockedClass<typeof TuyAPI>;
const mockExec = exec as jest.MockedFunction<typeof exec>;

function makeMockTuyAPI(): jest.Mocked<InstanceType<typeof TuyAPI>> {
  const emitter = new EventEmitter();
  const mock = Object.assign(emitter, {
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn(),
    get: jest.fn().mockResolvedValue({ dps: { 20: true, 22: 500, 21: 'white', 23: 500, 24: '000003e803e8' } }),
    set: jest.fn().mockResolvedValue(undefined),
    find: jest.fn().mockResolvedValue(undefined),
  });
  return mock as unknown as jest.Mocked<InstanceType<typeof TuyAPI>>;
}

const config: TuyaDeviceConfig = {
  id: 'dev1',
  key: 'testkey123456789',
  name: 'Hall16',
  ip: '192.168.1.30',
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('TuyaDevice', () => {
  it('emits state event when tuyapi emits dp-refresh', async () => {
    const mockApi = makeMockTuyAPI();
    MockTuyAPI.mockImplementation(() => mockApi);

    const device = new TuyaDevice(config, { heartbeatInterval: 10, reconnectAttempts: 3 });
    const stateEvents: unknown[] = [];
    device.on('state', (s) => stateEvents.push(s));

    await device.connect();

    mockApi.emit('dp-refresh', { dps: { 20: false, 22: 300, 21: 'white', 23: 200, 24: '000003e803e8' } });

    expect(stateEvents.length).toBeGreaterThanOrEqual(1);
    const last = stateEvents[stateEvents.length - 1] as { on: boolean; brightness: number };
    expect(last.on).toBe(false);
    expect(last.brightness).toBe(30);
  });

  it('calls set on tuyapi with correct DPs', async () => {
    const mockApi = makeMockTuyAPI();
    MockTuyAPI.mockImplementation(() => mockApi);

    const device = new TuyaDevice(config, { heartbeatInterval: 10, reconnectAttempts: 3 });
    await device.connect();

    await device.set({ 20: true, 22: 800 });
    expect(mockApi.set).toHaveBeenCalledWith({ dps: { 20: true, 22: 800 } });
  });

  it('emits unreachable after reconnectAttempts consecutive failures', async () => {
    const mockApi = makeMockTuyAPI();
    mockApi.connect.mockRejectedValue(new Error('connection refused'));
    MockTuyAPI.mockImplementation(() => mockApi);

    const device = new TuyaDevice(config, { heartbeatInterval: 10, reconnectAttempts: 3 });
    const events: string[] = [];
    device.on('unreachable', () => events.push('unreachable'));

    device.connect().catch(() => {});
    await jest.runAllTimersAsync();
    expect(events).toContain('unreachable');
  });
});
