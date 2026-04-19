# Changelog

## [1.0.0] - 2026-04-19

Initial release.

### Added

- Full HomeKit control for Tuya v3.4 Color Light bulbs (category `dj`): On/Off, Brightness, ColorTemperature (140-500 Mired), Hue, Saturation
- Correct mode switching: ColorTemperature sets `work_mode=white`, Hue/Saturation sets `work_mode=colour`
- `colour_data_v2` encoding/decoding (12-char HHHHSSSSVVVV hex, V fixed at 1000 to avoid double-brightness)
- `temp_value_v2` ↔ Mired transform (inverted linear, 0-1000 ↔ 500-140 Mired)
- Persistent TCP connection per bulb via tuyapi v7.7.1 (v3.4 protocol native)
- Configurable heartbeat (default 10s) and exponential backoff reconnect (1s→60s)
- HomeKit "No Response" after configurable consecutive failures (default 3)
- ARP-based MAC→IP resolution — survives DHCP lease rotation
- Multi-bulb group support: N physical bulbs as one HomeKit accessory, fan-out via `Promise.allSettled`, primary-device state mirroring
- `exposeIndividual` flag: optionally also register group members as separate accessories
- Homebridge Config UI X: bootstrap panel (one-time cloud key fetch), management panel (device list + group builder)
- CLI tool: `discover`, `fetch-keys`, `status`, `set`, `monitor`, `group-test`
- Child bridge support — plugin crash does not affect main Homebridge or other plugins
- One-time Tuya IoT Platform API bootstrap: auto-detects EU/US/CN/IN region, fetches all device keys, stores locally — no ongoing cloud dependency
