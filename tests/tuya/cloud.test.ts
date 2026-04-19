jest.mock('https');
import * as https from 'https';

import { buildSignature, parseDeviceList } from '../../src/tuya/cloud';

describe('buildSignature', () => {
  it('produces a 64-char uppercase hex HMAC-SHA256', () => {
    const sig = buildSignature(
      'testClientId',
      'testSecret',
      'testToken',
      'GET',
      '/v1.0/token?grant_type=1',
      '',
      '1713500000000',
      'test-nonce-1234',
    );
    expect(sig).toMatch(/^[0-9A-F]{64}$/);
  });

  it('is deterministic', () => {
    const args = ['id', 'secret', 'tok', 'GET', '/path', '', '12345', 'nonce'] as const;
    expect(buildSignature(...args)).toBe(buildSignature(...args));
  });

  it('changes when secret changes', () => {
    const base = buildSignature('id', 'secret1', 'tok', 'GET', '/path', '', '12345', 'nonce');
    const other = buildSignature('id', 'secret2', 'tok', 'GET', '/path', '', '12345', 'nonce');
    expect(base).not.toBe(other);
  });
});

describe('parseDeviceList', () => {
  it('maps cloud response to CloudDevice array', () => {
    const raw = {
      result: {
        devices: [
          { id: 'dev1', local_key: 'key1', name: 'Hall16', online: true, uuid: 'cc:8c:bf:4a:5b:58' },
          { id: 'dev2', local_key: 'key2', name: 'Hall18', online: false, uuid: '' },
        ],
      },
    };
    const devices = parseDeviceList(raw);
    expect(devices).toHaveLength(2);
    expect(devices[0]).toEqual({ id: 'dev1', key: 'key1', name: 'Hall16', online: true, mac: 'cc:8c:bf:4a:5b:58' });
    expect(devices[1]).toEqual({ id: 'dev2', key: 'key2', name: 'Hall18', online: false, mac: undefined });
  });

  it('returns empty array for missing result', () => {
    expect(parseDeviceList({})).toEqual([]);
    expect(parseDeviceList({ result: {} })).toEqual([]);
  });
});
