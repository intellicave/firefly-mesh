// True isometric (1:1:1) projection helpers.
// Floor tile = 64×32 rhombus, 30° elevation / 45° azimuth.
// isoX = ORIGIN_X + (col - row) * CELL_W / 2
// isoY = ORIGIN_Y + (col + row) * CELL_H / 2

export const CELL_W = 64;
export const CELL_H = 32;
export const COLS = 12;
export const ROWS = 9;

// Depth constants for 3-layer scene structure (design §2.1)
export const DEPTH_BACK_WALLS = -1000;
export const DEPTH_FRONT_OCCLUDERS = 1000;

export interface IsoPoint {
  screenX: number;
  screenY: number;
  depth: number;
}

/** Convert tile grid position to screen (canvas) coordinates. */
export function tileToScreen(col: number, row: number, originX: number, originY: number): IsoPoint {
  const screenX = originX + (col - row) * (CELL_W / 2);
  const screenY = originY + (col + row) * (CELL_H / 2);
  // Depth: objects further right and down (higher col+row) render on top.
  const depth = (col + row) * 100;
  return { screenX, screenY, depth };
}

/** Isometric canvas size for a full COLS×ROWS grid (before camera zoom). */
export function isoGridBounds(): { width: number; height: number } {
  return {
    width: (COLS + ROWS) * (CELL_W / 2),
    height: (COLS + ROWS) * (CELL_H / 2),
  };
}

/** Top-centre origin for a given viewport width so grid is horizontally centred. */
export function defaultOrigin(viewportW: number): { x: number; y: number } {
  return {
    x: viewportW / 2,
    y: CELL_H * 2,
  };
}
