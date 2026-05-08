// Single tile sprite at an iso-grid position.
// OcclusionSystem sets depth — this class never calls setDepth() directly (C8).

import Phaser from "phaser";
import { tileToScreen, DEPTH_BACK_WALLS, DEPTH_FRONT_OCCLUDERS, CELL_W, CELL_H } from "@/lib/scene/iso-math";

export type TileLayer = "backWall" | "floor" | "furniture" | "frontOccluder";

export interface TileConfig {
  col: number;
  row: number;
  tileId: string;
  layer: TileLayer;
  originX?: number;
  originY?: number;
}

export class Tile {
  readonly col: number;
  readonly row: number;
  readonly tileId: string;
  readonly layer: TileLayer;
  readonly sprite: Phaser.GameObjects.Image;
  readonly isoDepth: number;

  constructor(scene: Phaser.Scene, cfg: TileConfig) {
    const ox = cfg.originX ?? 0;
    const oy = cfg.originY ?? 0;
    const { screenX, screenY, depth } = tileToScreen(cfg.col, cfg.row, ox, oy);

    this.col = cfg.col;
    this.row = cfg.row;
    this.tileId = cfg.tileId;
    this.layer = cfg.layer;
    this.isoDepth = depth;

    this.sprite = scene.add.image(screenX, screenY, cfg.tileId);
    this.sprite.setOrigin(0.5, 1);
    // Floor tiles must be drawn at the exact iso-cell footprint (2:1 rhombus).
    // PNGs from PixelLab may be square; scale them down here.
    if (cfg.layer === "floor") {
      this.sprite.setDisplaySize(CELL_W, CELL_H);
    }

    // OcclusionSystem will call applyDepth(); initial assignment here so tiles
    // are visible before OcclusionSystem runs its first frame.
    const d = this.baseDepth();
    this.sprite.setDepth(d);
  }

  baseDepth(): number {
    switch (this.layer) {
      case "backWall": return DEPTH_BACK_WALLS + this.isoDepth * 0.001;
      case "frontOccluder": return DEPTH_FRONT_OCCLUDERS + this.isoDepth * 0.001;
      default: return this.isoDepth;
    }
  }

  destroy(): void {
    this.sprite.destroy();
  }
}
