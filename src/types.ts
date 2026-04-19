export interface TuyaDeviceConfig {
  id: string;
  key: string;
  name: string;
  mac?: string;
  ip?: string;
}

export interface TuyaGroup {
  name: string;
  primary: string;
  members: string[]; // device IDs matching TuyaDeviceConfig.id
  exposeIndividual: boolean;
}

export interface TuyaDevicesFile {
  devices: TuyaDeviceConfig[];
  groups?: TuyaGroup[];
}

export interface DeviceState {
  on: boolean;
  /** 0-100 (HomeKit percentage) */
  brightness: number;
  /** 140-500 mireds (HomeKit range) */
  colorTemperature: number;
  /** 0-360 degrees */
  hue: number;
  /** 0-100 (HomeKit percentage) */
  saturation: number;
  mode: 'white' | 'colour' | 'scene' | 'music';
}

export type DPs = Record<number, boolean | number | string>;
