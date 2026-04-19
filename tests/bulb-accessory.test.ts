import { EventEmitter } from 'events';
import type { TuyaDevice } from '../src/tuya/device';
import type { DeviceState } from '../src/types';

function makeDevice(initialState: Partial<DeviceState> = {}): jest.Mocked<TuyaDevice> {
  const emitter = new EventEmitter();
  const state: DeviceState = {
    on: true, brightness: 100, colorTemperature: 370, hue: 0, saturation: 0, mode: 'white',
    ...initialState,
  };
  return Object.assign(emitter, {
    getState: jest.fn(() => ({ ...state })),
    set: jest.fn().mockResolvedValue(undefined),
    isConnected: jest.fn(() => true),
    getName: jest.fn(() => 'Hall16'),
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn(),
  }) as unknown as jest.Mocked<TuyaDevice>;
}

interface MockCharacteristic {
  onGet: jest.Mock;
  onSet: jest.Mock;
  updateValue: jest.Mock;
  setProps: jest.Mock;
  _handlers: { get?: () => unknown; set?: (v: unknown) => Promise<void> | void };
}

function makeCharacteristic(): MockCharacteristic {
  const handlers: { get?: () => unknown; set?: (v: unknown) => Promise<void> | void } = {};
  const mock: MockCharacteristic = {
    onGet: jest.fn((fn: () => unknown) => { handlers.get = fn; return mock; }),
    onSet: jest.fn((fn: (v: unknown) => Promise<void> | void) => { handlers.set = fn; return mock; }),
    updateValue: jest.fn(),
    setProps: jest.fn().mockReturnThis(),
    _handlers: handlers,
  };
  return mock;
}

function makePlatform() {
  const chars: Record<string, ReturnType<typeof makeCharacteristic>> = {
    On: makeCharacteristic(), Brightness: makeCharacteristic(),
    ColorTemperature: makeCharacteristic(), Hue: makeCharacteristic(), Saturation: makeCharacteristic(),
  };
  const service = {
    getCharacteristic: jest.fn((key: string) => chars[key] ?? makeCharacteristic()),
    setCharacteristic: jest.fn().mockReturnThis(),
  };
  return {
    Service: { Lightbulb: 'Lightbulb' },
    Characteristic: {
      On: 'On', Brightness: 'Brightness',
      ColorTemperature: 'ColorTemperature', Hue: 'Hue', Saturation: 'Saturation',
    },
    log: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
    _service: service,
    _chars: chars,
  };
}

function makeAccessory(platform: ReturnType<typeof makePlatform>) {
  return {
    displayName: 'Hall16', UUID: 'uuid-1', context: {},
    getService: jest.fn(() => null),
    addService: jest.fn(() => platform._service),
  };
}

import { BulbAccessory } from '../src/bulb-accessory';
import type { TuyaBulbPlatform } from '../src/platform';

describe('BulbAccessory', () => {
  it('registers all five HomeKit characteristics', () => {
    const platform = makePlatform();
    const accessory = makeAccessory(platform);
    const device = makeDevice();
    new BulbAccessory(
      platform as unknown as TuyaBulbPlatform,
      accessory as unknown as import('homebridge').PlatformAccessory,
      device,
    );
    expect(platform._service.getCharacteristic).toHaveBeenCalledWith('On');
    expect(platform._service.getCharacteristic).toHaveBeenCalledWith('Brightness');
    expect(platform._service.getCharacteristic).toHaveBeenCalledWith('ColorTemperature');
    expect(platform._service.getCharacteristic).toHaveBeenCalledWith('Hue');
    expect(platform._service.getCharacteristic).toHaveBeenCalledWith('Saturation');
  });

  it('On GET returns device state', () => {
    const platform = makePlatform();
    const accessory = makeAccessory(platform);
    const device = makeDevice({ on: false });
    new BulbAccessory(
      platform as unknown as TuyaBulbPlatform,
      accessory as unknown as import('homebridge').PlatformAccessory,
      device,
    );
    expect(platform._chars['On']._handlers.get?.()).toBe(false);
  });

  it('On SET calls device.set with DP 20', async () => {
    const platform = makePlatform();
    const accessory = makeAccessory(platform);
    const device = makeDevice();
    new BulbAccessory(
      platform as unknown as TuyaBulbPlatform,
      accessory as unknown as import('homebridge').PlatformAccessory,
      device,
    );
    await platform._chars['On']._handlers.set?.(false);
    expect(device.set).toHaveBeenCalledWith({ 20: false });
  });

  it('ColorTemperature SET sends work_mode=white first, then DP23', async () => {
    const platform = makePlatform();
    const accessory = makeAccessory(platform);
    const device = makeDevice();
    new BulbAccessory(
      platform as unknown as TuyaBulbPlatform,
      accessory as unknown as import('homebridge').PlatformAccessory,
      device,
    );
    await platform._chars['ColorTemperature']._handlers.set?.(320);
    expect(device.set).toHaveBeenNthCalledWith(1, { 21: 'white' });
    expect(device.set).toHaveBeenNthCalledWith(2, { 23: expect.any(Number) });
  });

  it('Hue SET sends work_mode=colour first, then DP24 12-char hex', async () => {
    const platform = makePlatform();
    const accessory = makeAccessory(platform);
    const device = makeDevice({ hue: 120, saturation: 80 });
    new BulbAccessory(
      platform as unknown as TuyaBulbPlatform,
      accessory as unknown as import('homebridge').PlatformAccessory,
      device,
    );
    await platform._chars['Hue']._handlers.set?.(200);
    expect(device.set).toHaveBeenNthCalledWith(1, { 21: 'colour' });
    expect(device.set).toHaveBeenNthCalledWith(2, { 24: expect.stringMatching(/^[0-9a-f]{12}$/) });
  });

  it('state event from device updates all five characteristics', () => {
    const platform = makePlatform();
    const accessory = makeAccessory(platform);
    const device = makeDevice();
    new BulbAccessory(
      platform as unknown as TuyaBulbPlatform,
      accessory as unknown as import('homebridge').PlatformAccessory,
      device,
    );
    device.emit('state', {
      on: false, brightness: 50, colorTemperature: 400, hue: 180, saturation: 60, mode: 'white',
    } as DeviceState);
    expect(platform._chars['On'].updateValue).toHaveBeenCalledWith(false);
    expect(platform._chars['Brightness'].updateValue).toHaveBeenCalledWith(50);
    expect(platform._chars['ColorTemperature'].updateValue).toHaveBeenCalledWith(400);
    expect(platform._chars['Hue'].updateValue).toHaveBeenCalledWith(180);
    expect(platform._chars['Saturation'].updateValue).toHaveBeenCalledWith(60);
  });

  it('V field in colour hex is always 1000 (03e8)', async () => {
    const platform = makePlatform();
    const accessory = makeAccessory(platform);
    const device = makeDevice({ hue: 120, saturation: 50 });
    new BulbAccessory(
      platform as unknown as TuyaBulbPlatform,
      accessory as unknown as import('homebridge').PlatformAccessory,
      device,
    );
    await platform._chars['Hue']._handlers.set?.(180);
    const setCall = device.set.mock.calls.find((c) => c[0][24] !== undefined);
    expect(setCall).toBeDefined();
    const hex = setCall![0][24] as string;
    // Last 4 chars = V field, should be 03e8 = 1000
    expect(hex.slice(8)).toBe('03e8');
  });
});
