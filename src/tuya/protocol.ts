function pad4(n: number): string {
  return n.toString(16).padStart(4, '0');
}

export function encodeColour(h: number, s: number, v: number): string {
  return pad4(h) + pad4(s) + pad4(v);
}

export function decodeColour(hex: string): { h: number; s: number; v: number } {
  return {
    h: parseInt(hex.slice(0, 4), 16),
    s: parseInt(hex.slice(4, 8), 16),
    v: parseInt(hex.slice(8, 12), 16),
  };
}

export function miredToTemp(mired: number): number {
  return Math.min(1000, Math.max(0, Math.round(((mired - 500) / (140 - 500)) * 1000))) || 0;
}

export function tempToMired(temp: number): number {
  return Math.min(500, Math.max(140, Math.round(500 + (temp / 1000) * (140 - 500))));
}

export function brightnessToTuya(pct: number): number {
  return Math.min(1000, Math.max(10, Math.round(pct * 10)));
}

export function tuyaToBrightness(val: number): number {
  return Math.round(val / 10);
}

export function hkSatToTuya(sat: number): number {
  return Math.min(1000, Math.max(0, Math.round(sat * 10)));
}

export function tuyaSatToHk(sat: number): number {
  return Math.round(sat / 10);
}
