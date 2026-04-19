import * as crypto from 'crypto';
import * as https from 'https';

export interface CloudDevice {
  id: string;
  key: string;
  name: string;
  online: boolean;
  mac?: string;
}

interface TuyaApiResponse {
  success?: boolean;
  result?: {
    access_token?: string;
    uid?: string;
    devices?: Array<{
      id: string;
      local_key: string;
      name: string;
      online: boolean;
      uuid?: string;
    }>;
  };
}

export function buildSignature(
  clientId: string,
  clientSecret: string,
  accessToken: string,
  method: string,
  path: string,
  body: string,
  t: string,
  nonce: string,
): string {
  const contentHash = crypto.createHash('sha256').update(body).digest('hex');
  const stringToSign = [method, contentHash, '', path].join('\n');
  const message = clientId + accessToken + t + nonce + stringToSign;
  return crypto.createHmac('sha256', clientSecret).update(message).digest('hex').toUpperCase();
}

export function parseDeviceList(raw: unknown): CloudDevice[] {
  const r = raw as TuyaApiResponse;
  if (!r?.result?.devices) return [];
  return r.result.devices.map((d) => ({
    id: d.id,
    key: d.local_key,
    name: d.name,
    online: d.online,
    mac: d.uuid?.match(/^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i) ? d.uuid : undefined,
  }));
}

const REGIONS: Record<string, string> = {
  eu: 'openapi.tuyaeu.com',
  us: 'openapi.tuyaus.com',
  cn: 'openapi.tuya.com',
  in: 'openapi.tuyain.com',
};

function httpsGet(host: string, path: string, headers: Record<string, string>): Promise<TuyaApiResponse> {
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname: host, path, method: 'GET', headers }, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function getToken(host: string, clientId: string, clientSecret: string): Promise<{ token: string; uid: string }> {
  const t = Date.now().toString();
  const nonce = crypto.randomUUID();
  const tokenPath = '/v1.0/token?grant_type=1';
  const sign = buildSignature(clientId, clientSecret, '', 'GET', tokenPath, '', t, nonce);
  const headers: Record<string, string> = {
    client_id: clientId,
    sign,
    t,
    sign_method: 'HMAC-SHA256',
    nonce,
  };
  const body = await httpsGet(host, tokenPath, headers);
  if (!body.success || !body.result?.access_token) {
    throw new Error(`Token fetch failed: ${JSON.stringify(body)}`);
  }
  return { token: body.result.access_token, uid: body.result.uid ?? '' };
}

async function fetchFromHost(
  host: string,
  clientId: string,
  clientSecret: string,
): Promise<CloudDevice[]> {
  const { token, uid } = await getToken(host, clientId, clientSecret);
  const t = Date.now().toString();
  const nonce = crypto.randomUUID();
  const devPath = `/v1.0/iot-01/associated-users/devices?uid=${encodeURIComponent(uid)}&last_row_key=&page_size=100`;
  const sign = buildSignature(clientId, clientSecret, token, 'GET', devPath, '', t, nonce);
  const headers: Record<string, string> = {
    client_id: clientId,
    access_token: token,
    sign,
    t,
    sign_method: 'HMAC-SHA256',
    nonce,
  };
  const body = await httpsGet(host, devPath, headers);
  if (!body.success) throw new Error(`Device list failed: ${JSON.stringify(body)}`);
  return parseDeviceList(body);
}

export async function fetchDevices(
  clientId: string,
  clientSecret: string,
  region = 'auto',
): Promise<CloudDevice[]> {
  if (region !== 'auto') {
    const host = REGIONS[region];
    if (!host) throw new Error(`Unknown region: ${region}`);
    return fetchFromHost(host, clientId, clientSecret);
  }
  const order = ['eu', 'us', 'cn', 'in'];
  let lastError: Error | undefined;
  for (const r of order) {
    try {
      return await fetchFromHost(REGIONS[r], clientId, clientSecret);
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      // Auth/API errors contain the response body — don't retry other regions
      if (err.message.includes('"success":false') || err.message.includes('"success": false')) {
        throw new Error(`Tuya API error (${r}): ${err.message}`);
      }
      lastError = err;
    }
  }
  throw lastError ?? new Error('Could not connect to Tuya IoT API in any region (eu, us, cn, in)');
}
