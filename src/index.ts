import type { API } from 'homebridge';
import { TuyaBulbPlatform, PLUGIN_NAME, PLATFORM_NAME } from './platform';

export = (api: API): void => {
  api.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, TuyaBulbPlatform);
};
