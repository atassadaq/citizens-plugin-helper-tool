// Model recolours are OSRS "JagexColor" values: a packed 16-bit HSL where
// hue = bits 10-15 (0-63), saturation = bits 7-9 (0-7), lightness = bits 0-6 (0-127).
// These convert to/from CSS hex so recolours can be shown as swatches and picked with a
// normal colour picker. Mirrors net.runelite.api.JagexColor's maths (including its half-step
// offsets), so a picked colour round-trips to the same packed value the game would produce.

export function jagexToHex(packed: number): string {
  const hue = (packed >> 10) & 63;
  const sat = (packed >> 7) & 7;
  const lum = packed & 127;
  const h = hue / 64 + 0.0078125;
  const s = sat / 8 + 0.0625;
  const l = lum / 128;
  const [r, g, b] = hslToRgb(h, s, l);
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

export function hexToJagex(hex: string): number {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  const hue = Math.min(63, Math.floor(h * 64));
  const sat = Math.min(7, Math.floor(s * 8));
  const lum = Math.min(127, Math.floor(l * 128));
  return (hue << 10) | (sat << 7) | lum;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (t: number) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return [channel(h + 1 / 3), channel(h), channel(h - 1 / 3)].map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255)) as [
    number,
    number,
    number,
  ];
}
