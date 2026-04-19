import type { PlatformAccessory, Service } from 'homebridge';
import type { TuyaBulbPlatform } from './platform';
import type { TuyaDevice } from './tuya/device';
import type { DeviceState } from './types';
import { miredToTemp, brightnessToTuya, hkSatToTuya, encodeColour } from './tuya/protocol';

export class BulbAccessory {
  private readonly service: Service;
  private localHue = 0;
  private localSat = 0;

  constructor(
    private readonly platform: TuyaBulbPlatform,
    private readonly accessory: PlatformAccessory,
    private readonly device: TuyaDevice,
  ) {
    this.service =
      (this.accessory.getService(this.platform.Service.Lightbulb) as Service | undefined) ??
      this.accessory.addService(this.platform.Service.Lightbulb);

    this.service
      .getCharacteristic(this.platform.Characteristic.On)
      .onGet(() => this.device.getState().on)
      .onSet(async (value: unknown) => {
        await this.device.set({ 20: value as boolean });
      });

    this.service
      .getCharacteristic(this.platform.Characteristic.Brightness)
      .onGet(() => this.device.getState().brightness)
      .onSet(async (value: unknown) => {
        await this.device.set({ 22: brightnessToTuya(value as number) });
      });

    this.service
      .getCharacteristic(this.platform.Characteristic.ColorTemperature)
      .onGet(() => this.device.getState().colorTemperature)
      .onSet(async (value: unknown) => {
        await this.device.set({ 21: 'white' });
        await this.device.set({ 23: miredToTemp(value as number) });
      });

    this.service
      .getCharacteristic(this.platform.Characteristic.Hue)
      .onGet(() => this.device.getState().hue)
      .onSet(async (value: unknown) => {
        this.localHue = value as number;
        const hex = encodeColour(this.localHue, hkSatToTuya(this.localSat), 1000);
        await this.device.set({ 21: 'colour' });
        await this.device.set({ 24: hex });
      });

    this.service
      .getCharacteristic(this.platform.Characteristic.Saturation)
      .onGet(() => this.device.getState().saturation)
      .onSet(async (value: unknown) => {
        this.localSat = value as number;
        const hex = encodeColour(this.localHue, hkSatToTuya(this.localSat), 1000);
        await this.device.set({ 21: 'colour' });
        await this.device.set({ 24: hex });
      });

    const initialState = this.device.getState();
    this.localHue = initialState.hue;
    this.localSat = initialState.saturation;

    this.device.on('state', (s: DeviceState) => this.updateCharacteristics(s));
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
