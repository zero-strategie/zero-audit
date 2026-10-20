const HEX_COLOR = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;
const LINEAR_THRESHOLD = 0.03928;
const LUMINANCE_WEIGHTS = [0.2126, 0.7152, 0.0722] as const;

const toLinear = (channel: number): number => {
  const value = channel / 255;
  return value <= LINEAR_THRESHOLD ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
};

const luminance = (hex: string): number => {
  const match = HEX_COLOR.exec(hex);
  if (!match) throw new Error(`Invalid hex color: ${hex}`);
  const channels = [match[1], match[2], match[3]].map((part) => toLinear(parseInt(part ?? '', 16)));
  return channels.reduce(
    (sum, channel, index) => sum + channel * (LUMINANCE_WEIGHTS[index] ?? 0),
    0,
  );
};

/** WCAG 2.x contrast ratio between two #rrggbb colors. */
export const contrastRatio = (hexA: string, hexB: string): number => {
  const [lighter, darker] = [luminance(hexA), luminance(hexB)].sort((a, b) => b - a);
  return ((lighter ?? 0) + 0.05) / ((darker ?? 0) + 0.05);
};
