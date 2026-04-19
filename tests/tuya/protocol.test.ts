import {
  encodeColour,
  decodeColour,
  miredToTemp,
  tempToMired,
  brightnessToTuya,
  tuyaToBrightness,
  hkSatToTuya,
  tuyaSatToHk,
} from '../../src/tuya/protocol';

describe('encodeColour', () => {
  it('encodes H=345, S=990, V=1000 to 015903de03e8', () => {
    expect(encodeColour(345, 990, 1000)).toBe('015903de03e8');
  });
  it('encodes H=0, S=0, V=0 to 000000000000', () => {
    expect(encodeColour(0, 0, 0)).toBe('000000000000');
  });
  it('encodes H=360, S=1000, V=1000 to 016803e803e8', () => {
    expect(encodeColour(360, 1000, 1000)).toBe('016803e803e8');
  });
  it('encodes H=180, S=500, V=750 to 00b401f402ee', () => {
    expect(encodeColour(180, 500, 750)).toBe('00b401f402ee');
  });
});

describe('decodeColour', () => {
  it('decodes 015903de03e8 to H=345, S=990, V=1000', () => {
    expect(decodeColour('015903de03e8')).toEqual({ h: 345, s: 990, v: 1000 });
  });
  it('decodes 000000000000 to all zeros', () => {
    expect(decodeColour('000000000000')).toEqual({ h: 0, s: 0, v: 0 });
  });
  it('is inverse of encodeColour', () => {
    expect(decodeColour(encodeColour(120, 800, 600))).toEqual({ h: 120, s: 800, v: 600 });
  });
});

describe('miredToTemp', () => {
  it('maps Mired 500 (warm) to Tuya 0', () => {
    expect(miredToTemp(500)).toBe(0);
  });
  it('maps Mired 140 (cool) to Tuya 1000', () => {
    expect(miredToTemp(140)).toBe(1000);
  });
  it('maps Mired 320 (mid) to Tuya 500', () => {
    expect(miredToTemp(320)).toBe(500);
  });
});

describe('tempToMired', () => {
  it('maps Tuya 0 to Mired 500', () => {
    expect(tempToMired(0)).toBe(500);
  });
  it('maps Tuya 1000 to Mired 140', () => {
    expect(tempToMired(1000)).toBe(140);
  });
  it('is inverse of miredToTemp', () => {
    expect(tempToMired(miredToTemp(320))).toBe(320);
  });
});

describe('brightnessToTuya', () => {
  it('maps 0% to Tuya min 10', () => {
    expect(brightnessToTuya(0)).toBe(10);
  });
  it('maps 100% to Tuya 1000', () => {
    expect(brightnessToTuya(100)).toBe(1000);
  });
  it('maps 50% to Tuya 500', () => {
    expect(brightnessToTuya(50)).toBe(500);
  });
  it('maps 1% to Tuya 10 (min clamp)', () => {
    expect(brightnessToTuya(1)).toBe(10);
  });
  it('clamps above 100% to Tuya 1000', () => {
    expect(brightnessToTuya(110)).toBe(1000);
  });
  it('roundtrip is lossless from 10% upward', () => {
    expect(tuyaToBrightness(brightnessToTuya(50))).toBe(50);
  });
  it('0% clamps to Tuya 10 (1% roundtrip by design)', () => {
    expect(tuyaToBrightness(brightnessToTuya(0))).toBe(1);
  });
});

describe('tuyaToBrightness', () => {
  it('maps Tuya 10 to 1%', () => {
    expect(tuyaToBrightness(10)).toBe(1);
  });
  it('maps Tuya 1000 to 100%', () => {
    expect(tuyaToBrightness(1000)).toBe(100);
  });
  it('maps Tuya 500 to 50%', () => {
    expect(tuyaToBrightness(500)).toBe(50);
  });
});

describe('hkSatToTuya / tuyaSatToHk', () => {
  it('maps HK 100% to Tuya 1000', () => {
    expect(hkSatToTuya(100)).toBe(1000);
  });
  it('maps HK 0% to Tuya 0', () => {
    expect(hkSatToTuya(0)).toBe(0);
  });
  it('is inverse of tuyaSatToHk', () => {
    expect(tuyaSatToHk(hkSatToTuya(75))).toBe(75);
  });
});
