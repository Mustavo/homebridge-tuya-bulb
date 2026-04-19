import type { PlatformAccessory, Service } from 'homebridge';
import type { TuyaBulbPlatform } from './platform';
import type { TuyaDevice } from './tuya/device';
import type { DeviceState, DPs } from './types';
import { miredToTemp, brightnessToTuya, hkSatToTuya, encodeColour } from './tuya/protocol';

export class GroupAccessory {
  private readonly service: Service;
  private localHue = 0;
  private localSat = 0;

  constructor(
    private readonly platform: TuyaBulbPlatform,
    private readonly accessory: PlatformAccessory,
    private readonly members: TuyaDevice[],
    private readonly primary: TuyaDevice,
    private readonly groupName: string,
  ) {
    this.service =
      (this.accessory.getService(this.platform.Service.Lightbulb) as Service | undefined) ??
      this.accessory.addService(this.platform.Service.Lightbulb);

    const fanOut = async (dps: DPs): Promise<void> => {
      const results = await Promise.allSettled(this.members.map((m) => m.set(dps)));
      results.forEach((r, i) => {
        if (r.status === 'rejected') {
          this.platform.log.warn(
            `${this.groupName}: ${this.members[i]!.getName()} set failed: ${(r.reason as Error).message}`,
          );
        }
      });
    };

    this.service
      .getCharacteristic(this.platform.Characteristic.On)
      .onGet(() => this.primary.getState().on)
      .onSet(async (value: unknown) => { await fanOut({ 20: value as boolean }); });

    this.service
      .getCharacteristic(this.platform.Characteristic.Brightness)
      .onGet(() => this.primary.getState().brightness)
      .onSet(async (value: unknown) => { await fanOut({ 22: brightnessToTuya(value as number) }); });

    this.service
      .getCharacteristic(this.platform.Characteristic.ColorTemperature)
      .onGet(() => this.primary.getState().colorTemperature)
      .onSet(async (value: unknown) => {
        // mode-switch must arrive before value — serial fan-out is intentional
        await fanOut({ 21: 'white' });
        await fanOut({ 23: miredToTemp(value as number) });
      });

    this.service
      .getCharacteristic(this.platform.Characteristic.Hue)
      .onGet(() => this.primary.getState().hue)
      .onSet(async (value: unknown) => {
        this.localHue = value as number;
        const hex = encodeColour(this.localHue, hkSatToTuya(this.localSat), 1000);
        // mode-switch must arrive before value — serial fan-out is intentional
        await fanOut({ 21: 'colour' });
        await fanOut({ 24: hex });
      });

    this.service
      .getCharacteristic(this.platform.Characteristic.Saturation)
      .onGet(() => this.primary.getState().saturation)
      .onSet(async (value: unknown) => {
        this.localSat = value as number;
        const hex = encodeColour(this.localHue, hkSatToTuya(this.localSat), 1000);
        // mode-switch must arrive before value — serial fan-out is intentional
        await fanOut({ 21: 'colour' });
        await fanOut({ 24: hex });
      });

    const initialState = this.primary.getState();
    this.localHue = initialState.hue;
    this.localSat = initialState.saturation;

    this.primary.on('state', (s: DeviceState) => this.updateCharacteristics(s));
  }

  private updateCharacteristics(state: DeviceState): void {
    this.localHue = state.hue;
    this.localSat = state.saturation;
    this.service.getCharacteristic(this.platform.Characteristic.On).updateValue(state.on);
    this.service.getCharacteristic(this.platform.Characteristic.Brightness).updateValue(state.brightness);
    this.service.getCharacteristic(this.platform.Characteristic.ColorTemperature).updateValue(state.colorTemperature);
    this.service.getCharacteristic(this.platform.Characteristic.Hue).updateValue(state.hue);
    this.service.getCharacteristic(this.platform.Characteristic.Saturation).updateValue(state.saturation);
  }
}
