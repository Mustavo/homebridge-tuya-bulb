const { HomebridgePluginUiServer } = require('@homebridge/plugin-ui-utils');
const path = require('path');
const fs = require('fs');

class TuyaBulbUiServer extends HomebridgePluginUiServer {
  constructor() {
    super();
    this.onRequest('/fetch-devices', this.fetchDevices.bind(this));
    this.onRequest('/get-devices', this.getDevices.bind(this));
    this.onRequest('/save-devices', this.saveDevices.bind(this));
    this.ready();
  }

  get devicesPath() {
    if (!this.homebridgeStoragePath) throw new Error('homebridgeStoragePath not set');
    return path.join(this.homebridgeStoragePath, 'tuya-devices.json');
  }

  async fetchDevices({ clientId, clientSecret, region }) {
    const { fetchDevices } = require('../dist/tuya/cloud');
    try {
      const devices = await fetchDevices(clientId, clientSecret, region || 'auto');
      const data = { devices, groups: [] };
      fs.writeFileSync(this.devicesPath, JSON.stringify(data, null, 2));
      return { success: true, count: devices.length, devices };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async getDevices() {
    try {
      const raw = fs.readFileSync(this.devicesPath, 'utf8');
      return { success: true, ...JSON.parse(raw) };
    } catch {
      return { success: true, devices: [], groups: [] };
    }
  }

  async saveDevices({ devices, groups }) {
    if (!Array.isArray(devices) || !Array.isArray(groups)) {
      return { success: false, error: 'Invalid payload: devices and groups must be arrays' };
    }
    fs.writeFileSync(this.devicesPath, JSON.stringify({ devices, groups }, null, 2));
    return { success: true };
  }
}

new TuyaBulbUiServer();
