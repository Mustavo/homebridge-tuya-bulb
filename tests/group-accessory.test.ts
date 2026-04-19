import { EventEmitter } from 'events';
import type { TuyaDevice } from '../src/tuya/device';
import type { DeviceState } from '../src/types';

function makeDevice(name: string, initialState: Partial<DeviceState> = {}): jest.Mocked<TuyaDevice> {
  const emitter = new EventEmitter();
  const state: DeviceState = {
    on: true, brightness: 100, colorTemperature: 370, hue: 0, saturation: 0, mode: 'white',
    ...initialState,
  };
  return Object.assign(emitter, {
    getState: jest.fn(() => ({ ...state })),
    set: jest.fn().mockResolvedValue(undefined),
    isConnected: jest.fn(() => true),
    getName: jest.fn(() => name),
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
    displayName: 'Living Room Pendant', UUID: 'uuid-group-1', context: {},
    getService: jest.fn(() => null),
    addService: jest.fn(() => platform._service),
  };
}

import { GroupAccessory } from '../src/group-accessory';
import type { TuyaBulbPlatform } from '../src/platform';

describe('GroupAccessory', () => {
  it('fans out On SET to all member devices', async () => {
    const platform = makePlatform();
    const accessory = makeAccessory(platform);
    const dev1 = makeDevice('Bulb1');
    const dev2 = makeDevice('Bulb2');
    const dev3 = makeDevice('Bulb3');
    new GroupAccessory(
      platform as unknown as TuyaBulbPlatform,
      accessory as unknown as import('homebridge').PlatformAccessory,
      [dev1, dev2, dev3],
      dev1,
      'Living Room Pendant',
    );
    await platform._chars['On']._handlers.set?.(false);
    expect(dev1.set).toHaveBeenCalledWith({ 20: false });
    expect(dev2.set).toHaveBeenCalledWith({ 20: false });
    expect(dev3.set).toHaveBeenCalledWith({ 20: false });
  });

  it('state event from primary updates characteristics', () => {
    const platform = makePlatform();
    const accessory = makeAccessory(platform);
    const primary = makeDevice('Primary');
    const secondary = makeDevice('Secondary');
    new GroupAccessory(
      platform as unknown as TuyaBulbPlatform,
      accessory as unknown as import('homebridge').PlatformAccessory,
      [primary, secondary],
      primary,
      'Living Room Pendant',
    );
    primary.emit('state', {
      on: false, brightness: 60, colorTemperature: 300, hue: 120, saturation: 50, mode: 'colour',
    } as DeviceState);
    expect(platform._chars['On'].updateValue).toHaveBeenCalledWith(false);
    expect(platform._chars['Brightness'].updateValue).toHaveBeenCalledWith(60);
    expect(platform._chars['ColorTemperature'].updateValue).toHaveBeenCalledWith(300);
  });

  it('state from non-primary device does NOT update characteristics', () => {
    const platform = makePlatform();
    const accessory = makeAccessory(platform);
    const primary = makeDevice('Primary');
    const secondary = makeDevice('Secondary');
    new GroupAccessory(
      platform as unknown as TuyaBulbPlatform,
      accessory as unknown as import('homebridge').PlatformAccessory,
      [primary, secondary],
      primary,
      'Living Room Pendant',
    );
    secondary.emit('state', {
      on: false, brightness: 10, colorTemperature: 300, hue: 0, saturation: 0, mode: 'white',
    } as DeviceState);
    expect(platform._chars['On'].updateValue).not.toHaveBeenCalled();
  });

  it('continues if one member set() fails (allSettled)', async () => {
    const platform = makePlatform();
    const accessory = makeAccessory(platform);
    const dev1 = makeDevice('Bulb1');
    const dev2 = makeDevice('Bulb2');
    dev1.set.mockRejectedValue(new Error('disconnected'));
    new GroupAccessory(
      platform as unknown as TuyaBulbPlatform,
      accessory as unknown as import('homebridge').PlatformAccessory,
      [dev1, dev2],
      dev2,
      'Living Room Pendant',
    );
    await expect(platform._chars['On']._handlers.set?.(true)).resolves.not.toThrow();
    expect(dev2.set).toHaveBeenCalledWith({ 20: true });
    expect(platform.log.warn).toHaveBeenCalledWith(expect.stringContaining('Bulb1'));
  });

  it('ColorTemperature SET fans out mode=white first, then DP23 to all members', async () => {
    const platform = makePlatform();
    const accessory = makeAccessory(platform);
    const dev1 = makeDevice('Bulb1');
    const dev2 = makeDevice('Bulb2');
    new GroupAccessory(
      platform as unknown as TuyaBulbPlatform,
      accessory as unknown as import('homebridge').PlatformAccessory,
      [dev1, dev2],
      dev1,
      'Living Room Pendant',
    );
    await platform._chars['ColorTemperature']._handlers.set?.(320);
    // Both devices should get mode=white first
    expect(dev1.set).toHaveBeenNthCalledWith(1, { 21: 'white' });
    expect(dev2.set).toHaveBeenNthCalledWith(1, { 21: 'white' });
    // Then the temp value
    expect(dev1.set).toHaveBeenNthCalledWith(2, { 23: expect.any(Number) });
    expect(dev2.set).toHaveBeenNthCalledWith(2, { 23: expect.any(Number) });
  });

  it('Hue SET sends mode=colour then DP24 hex to all members', async () => {
    const platform = makePlatform();
    const accessory = makeAccessory(platform);
    const dev1 = makeDevice('Bulb1');
    const dev2 = makeDevice('Bulb2');
    new GroupAccessory(
      platform as unknown as import('../src/platform').TuyaBulbPlatform,
      accessory as unknown as import('homebridge').PlatformAccessory,
      [dev1, dev2],
      dev1,
      'Test Group',
    );
    await platform._chars['Hue']._handlers.set?.(180);
    expect(dev1.set).toHaveBeenCalledWith({ 21: 'colour' });
    expect(dev2.set).toHaveBeenCalledWith({ 21: 'colour' });
    // H=180, S=0 (initial localSat), V=1000 → hex 00b400000 3e8
    const expectedHex = (180).toString(16).padStart(4, '0') + '0000' + '03e8';
    expect(dev1.set).toHaveBeenCalledWith({ 24: expectedHex });
    expect(dev2.set).toHaveBeenCalledWith({ 24: expectedHex });
  });
});
