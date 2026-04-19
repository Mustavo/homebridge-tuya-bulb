# homebridge-tuya-bulb

[![npm](https://img.shields.io/npm/v/homebridge-tuya-bulb)](https://www.npmjs.com/package/homebridge-tuya-bulb)
[![npm downloads](https://img.shields.io/npm/dt/homebridge-tuya-bulb)](https://www.npmjs.com/package/homebridge-tuya-bulb)
[![Homebridge](https://img.shields.io/badge/homebridge-%3E%3D1.6.0-blueviolet)](https://homebridge.io)

Homebridge plugin for Tuya v3.4 Color Light bulbs (product category `dj`). Control your bulbs with Siri, the Apple Home app, or any HomeKit automation — on/off, brightness, colour temperature, and full RGB colour.

Communicates directly with your bulbs over the local network after a one-time key bootstrap. No ongoing cloud dependency, no subscription required.

## Features

- On/off, brightness (0-100%), colour temperature (warm to cool), full colour (hue + saturation)
- Correct mode switching: colour temperature and RGB colour don't interfere with each other
- Stable MAC address-based device identity — survives DHCP lease rotation
- Persistent TCP connection per bulb with configurable heartbeat and automatic reconnect
- HomeKit "No Response" shown accurately when a bulb is unreachable (no false positives)
- Multi-bulb group support: treat a multi-bulb fitting as a single HomeKit device
- One-time cloud key fetch via Homebridge Config UI or CLI — credentials never stored
- Runs as a Homebridge child bridge — a bulb communication failure does not affect other plugins
- Local LAN only after setup. Zero ongoing cloud dependency.

## Compatibility

Designed for **Tuya Color Light v2 bulbs** (product category `dj`, protocol version 3.4) — the most common type sold under dozens of brand names. These bulbs use Tuya's v3.4 encrypted local protocol (TCP port 6668).

To confirm your bulbs are compatible:
- They should appear in the Tuya Smart or Smart Life app
- You should be able to create a Tuya IoT Platform project and see them as "Color Light" devices

Tested with 22 bulbs on a single network. Protocol version 3.3 and 3.5 devices are not supported.

## What You Get in HomeKit

| Control | HomeKit Characteristic |
|---------|----------------------|
| Power | On |
| Brightness | Brightness (0-100%) |
| Colour temperature | ColorTemperature (140-500 Mired) |
| Colour | Hue + Saturation |

## Install

### Via Homebridge UI (recommended)

Search for `tuya-bulb` in the Homebridge plugins tab and install.

### Via command line

```bash
npm install -g homebridge-tuya-bulb
```

## Setup

### Step 1: Get Tuya IoT Platform credentials

You need a **Tuya IoT Platform** account to do a one-time device key fetch. This is free.

1. Go to [platform.tuya.com](https://platform.tuya.com) and create an account
2. Create a Cloud Development project (select your data centre region)
3. Subscribe to the **IoT Core** service (free tier is sufficient)
4. In the project's **Overview** tab, note your **Client ID** and **Client Secret**
5. Link your Tuya Smart / Smart Life app account to the project under **Devices > Link Tuya App Account**

You only need these credentials once — they are used to fetch local keys and are not stored.

### Step 2: Fetch device keys

**Via Homebridge Config UI X** (recommended):

Open the Tuya Bulbs plugin settings. The Bootstrap panel appears on first run. Enter your Client ID, Client Secret, and region, then click **Fetch Devices**. Keys are saved to `tuya-devices.json` in your Homebridge storage folder.

**Via CLI:**

```bash
npm run tuya -- fetch-keys
```

Follow the prompts. The same `tuya-devices.json` file is written.

### Step 3: Configure groups (optional)

If you have a fitting with multiple bulbs (e.g. a pendant with 3 sockets), you can group them into a single HomeKit accessory:

- In the Management panel, click **+ New Group**
- Give the group a name, pick a primary device (drives the state shown in HomeKit), and select all member bulbs
- Toggle **Also expose individual bulbs** if you also want each bulb separately accessible

### Step 4: Restart Homebridge

Bulbs appear in HomeKit automatically. No manual UUID assignment needed.

### Step 5: Verify IP resolution

The plugin uses ARP to resolve MAC addresses to IPs. If a bulb doesn't connect on first start, make sure it has been seen on the network recently (ping it first). For bulbs where the cloud API didn't return a MAC address, you can add an `ip` field directly to `tuya-devices.json`:

```json
{
  "devices": [
    { "id": "your-device-id", "key": "your-local-key", "name": "Living Room", "ip": "192.168.1.30" }
  ]
}
```

## Configuration

Minimal config — most users won't need to change anything:

```json
{
  "platform": "TuyaBulb",
  "name": "Tuya Bulbs",
  "heartbeatInterval": 10,
  "reconnectAttempts": 3
}
```

| Field | Default | Description |
|-------|---------|-------------|
| `name` | `"Tuya Bulbs"` | Platform display name |
| `heartbeatInterval` | `10` | Seconds between keep-alive pings to each bulb (5-60) |
| `reconnectAttempts` | `3` | Consecutive failures before HomeKit shows "No Response" (1-10) |

## CLI Diagnostics

A diagnostic CLI is included for testing and direct control:

```bash
npm run tuya -- discover              # ARP scan for Tuya OUI devices, check port 6668
npm run tuya -- fetch-keys            # Cloud bootstrap (interactive credential prompt)
npm run tuya -- status <ip>           # Live DP state dump for one device
npm run tuya -- set <ip> <dp> <val>   # Set a DP directly (e.g. set 192.168.1.30 20 false)
npm run tuya -- monitor <ip>          # Stream live state events (Ctrl-C to stop)
npm run tuya -- group-test <name>     # Fan out primary state to all group members
```

The `status` and `set` commands require an `ip` field in `tuya-devices.json` (the cloud fetch doesn't always populate this — use `discover` first to find the IP).

## Protocol Notes

These bulbs use **Tuya v3.4 local protocol**:

- TCP port 6668 (control)
- Session key negotiation on connect: 3-message HMAC-SHA256 handshake
- All subsequent traffic encrypted with AES-128-ECB using the negotiated session key
- DP schema for Color Light v2: DP20=power, DP21=work_mode, DP22=brightness, DP23=colour_temperature, DP24=colour_data_v2
- `colour_data_v2`: 12-char hex, 2 bytes each big-endian — H (0-360), S (0-1000), V (0-1000). V is fixed at 1000; brightness is controlled exclusively via DP22 to avoid double-scaling conflicts.

Protocol implementation via [tuyapi](https://github.com/codetheweb/tuyapi) v7.7.1.

## Development

```bash
git clone https://github.com/Mustavo/homebridge-tuya-bulb.git
cd homebridge-tuya-bulb
npm install
npm run build     # compile TypeScript to dist/
npm run watch     # compile on change
npm test          # run unit tests
npm run tuya      # CLI tool (from source, via ts-node)
```

## Release Checklist

Publishing from the monorepo source uses a clean clone at `/tmp/tuya-release`. Steps for each release:

```bash
# 1. Sync updated source, bump version in package.json, add CHANGELOG entry
# 2. Commit, tag, push
git -C /tmp/tuya-release add -A
git -C /tmp/tuya-release commit -m "v1.x.x - summary"
git -C /tmp/tuya-release tag v1.x.x
git -C /tmp/tuya-release push origin master --tags

# 3. Create GitHub Release (Homebridge reads release notes from here)
gh release create v1.x.x --repo Mustavo/homebridge-tuya-bulb --title "v1.x.x" --notes "..."

# 4. Publish to npm
cd /tmp/tuya-release && npm publish
```

## Licence

ISC
