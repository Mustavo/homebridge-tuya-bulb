jest.mock('../src/tuya/device');
jest.mock('fs');

import * as fs from 'fs';
import { TuyaBulbPlatform, PLUGIN_NAME, PLATFORM_NAME } from '../src/platform';
import { TuyaDevice } from '../src/tuya/device';
import type { Logging, PlatformConfig, API } from 'homebridge';

const mockFs = fs as jest.Mocked<typeof fs>;
const MockTuyaDevice = TuyaDevice as jest.MockedClass<typeof TuyaDevice>;

function makeMockApi() {
  const listeners: Record<string, () => void> = {};
  return {
    hap: {
      Service: { Lightbulb: 'Lightbulb' },
      Characteristic: {
        On: 'On', Brightness: 'Brightness',
        ColorTemperature: 'ColorTemperature', Hue: 'Hue', Saturation: 'Saturation',
      },
      uuid: { generate: jest.fn((s: string) => `uuid-${s}`) },
    },
    on: jest.fn((event: string, fn: () => void) => { listeners[event] = fn; }),
    registerPlatformAccessories: jest.fn(),
    unregisterPlatformAccessories: jest.fn(),
    platformAccessory: jest.fn().mockImplementation((name: string, uuid: string) => ({
      UUID: uuid,
      displayName: name,
      context: {},
      getService: jest.fn(() => null),
      addService: jest.fn().mockReturnValue({
        getCharacteristic: jest.fn().mockReturnValue({
          onGet: jest.fn().mockReturnThis(),
          onSet: jest.fn().mockReturnThis(),
          updateValue: jest.fn(),
          setProps: jest.fn().mockReturnThis(),
        }),
        setCharacteristic: jest.fn().mockReturnThis(),
      }),
    })),
    _listeners: listeners,
  };
}

const makeLog = () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
});
const makeConfig = (overrides = {}): PlatformConfig => ({
  platform: 'TuyaBulb', name: 'Tuya Bulbs', heartbeatInterval: 10, reconnectAttempts: 3, ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  MockTuyaDevice.mockImplementation(() => ({
    on: jest.fn(),
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn(),
    getState: jest.fn(() => ({ on: true, brightness: 100, colorTemperature: 370, hue: 0, saturation: 0, mode: 'white' as const })),
    set: jest.fn(),
    isConnected: jest.fn(() => false),
    getName: jest.fn(() => 'Mock'),
    emit: jest.fn(),
    removeListener: jest.fn(),
  } as unknown as TuyaDevice));
});

describe('PLUGIN_NAME and PLATFORM_NAME', () => {
  it('exports correct plugin identifiers', () => {
    expect(PLUGIN_NAME).toBe('homebridge-tuya-bulb');
    expect(PLATFORM_NAME).toBe('TuyaBulb');
  });
});

describe('TuyaBulbPlatform', () => {
  it('constructs without throwing', () => {
    const api = makeMockApi();
    expect(() => new TuyaBulbPlatform(makeLog() as unknown as Logging, makeConfig(), api as unknown as API)).not.toThrow();
  });

  it('registers no accessories when tuya-devices.json is missing', () => {
    mockFs.existsSync.mockReturnValue(false);
    const api = makeMockApi();
    new TuyaBulbPlatform(makeLog() as unknown as Logging, makeConfig(), api as unknown as API);
    api._listeners['didFinishLaunching']?.();
    expect(api.registerPlatformAccessories).not.toHaveBeenCalled();
  });

  it('registers BulbAccessory for each ungrouped device', () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(JSON.stringify({
      devices: [
        { id: 'dev1', key: 'key1', name: 'Hall16', ip: '192.168.1.30' },
        { id: 'dev2', key: 'key2', name: 'Hall18', ip: '192.168.1.40' },
      ],
      groups: [],
    }));
    const api = makeMockApi();
    new TuyaBulbPlatform(makeLog() as unknown as Logging, makeConfig(), api as unknown as API);
    api._listeners['didFinishLaunching']?.();
    expect(api.registerPlatformAccessories).toHaveBeenCalledTimes(2);
  });
});
