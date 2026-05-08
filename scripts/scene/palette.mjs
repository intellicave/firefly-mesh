// Master 32-color palette — single source of truth.
// Locked. Bumping any colour requires a major art-bible version bump.
//
// Layout: 8 ramps × 4 shades (darkest, dark, mid, light).
// Indices 0-3 = ramp 0 (neutrals), 4-7 = ramp 1 (warm browns), etc.
//
// See docs/art/firefly-mesh-art-bible.md § 2 for ramp use.

export const PALETTE_HEX = Object.freeze([
  // Ramp 0 — neutrals
  "#1a1226", "#3d3052", "#80708e", "#e8d8c4",
  // Ramp 1 — warm browns (firefly brand)
  "#5c2f1a", "#a55a35", "#d68957", "#f5d8a8",
  // Ramp 2 — orange (firefly accent)
  "#a83a1a", "#e85b3a", "#f08c5e", "#fbc78f",
  // Ramp 3 — yellow
  "#7a5a1a", "#c89a3a", "#f0c75e", "#fae8a8",
  // Ramp 4 — green (commit / online)
  "#2a4a2a", "#4a8a4a", "#7ac275", "#b8e8a8",
  // Ramp 5 — blue (inform / sync)
  "#1a3a5a", "#3a6a9a", "#5a9ad0", "#a8d8f5",
  // Ramp 6 — purple (handoff / shadow base)
  "#2c1f3a", "#5a3a7a", "#9a6ac0", "#c8a8e8",
  // Ramp 7 — red (escalate)
  "#5a1a1a", "#a82a2a", "#d85a5a", "#f0a8a8",
]);

if (PALETTE_HEX.length !== 32) {
  throw new Error(
    `Palette must be exactly 32 colours, got ${PALETTE_HEX.length}`,
  );
}

/** Named ramp accessor — index 0..3 within a ramp. */
export const RAMP = Object.freeze({
  NEUTRAL: 0,
  WARM_BROWN: 1,
  ORANGE: 2,
  YELLOW: 3,
  GREEN: 4,
  BLUE: 5,
  PURPLE: 6,
  RED: 7,
});

export const SHADE = Object.freeze({
  DARKEST: 0,
  DARK: 1,
  MID: 2,
  LIGHT: 3,
});

/** Pick a colour by ramp + shade. e.g. paletteHex(RAMP.ORANGE, SHADE.MID) → "#f08c5e" */
export function paletteHex(rampIdx, shadeIdx) {
  return PALETTE_HEX[rampIdx * 4 + shadeIdx];
}

/** Parse "#rrggbb" into [r, g, b] 0-255 ints. */
export function hexToRgb(hex) {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) throw new Error(`Bad hex: ${hex}`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/** Pack [r,g,b] back to "#rrggbb" lower-case. */
export function rgbToHex(rgb) {
  const h = (n) => n.toString(16).padStart(2, "0");
  return `#${h(rgb[0])}${h(rgb[1])}${h(rgb[2])}`;
}

/** Squared euclidean distance in RGB space — sufficient for our 32-colour set. */
export function colourDistanceSq(a, b) {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return dr * dr + dg * dg + db * db;
}

export const PALETTE_RGB = Object.freeze(PALETTE_HEX.map(hexToRgb));

/** Returns nearest palette index for a given rgb pixel. */
export function nearestPaletteIndex(rgb) {
  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < PALETTE_RGB.length; i++) {
    const d = colourDistanceSq(rgb, PALETTE_RGB[i]);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  return bestIdx;
}

/** Palette as flat Buffer RGBA (32 × 4 = 128 bytes). Useful for sharp raw input. */
export function paletteAsRgbaBuffer() {
  const buf = Buffer.alloc(PALETTE_HEX.length * 4);
  for (let i = 0; i < PALETTE_RGB.length; i++) {
    const [r, g, b] = PALETTE_RGB[i];
    buf[i * 4 + 0] = r;
    buf[i * 4 + 1] = g;
    buf[i * 4 + 2] = b;
    buf[i * 4 + 3] = 255;
  }
  return buf;
}
