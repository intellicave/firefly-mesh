// Character entity: sprite + state machine + hit area.
// Depth is set exclusively by OcclusionSystem (C8 — entity never calls setDepth).

import Phaser from "phaser";
import { tileToScreen } from "@/lib/scene/iso-math";
import type { OrgEmployee } from "@/lib/scene/event-bus";

export type CharState = "idle" | "walk" | "work" | "talk";
export type FacingDir = "s" | "se" | "e" | "ne" | "n" | "nw" | "w" | "sw";

export interface EmployeeEntityConfig {
  employee: OrgEmployee;
  charId: string;
  col: number;
  row: number;
  facing: FacingDir;
  originX: number;
  originY: number;
}

export class EmployeeEntity {
  readonly employeeId: string;
  readonly employee: OrgEmployee;
  col: number;
  row: number;
  facing: FacingDir;
  state: CharState = "idle";

  readonly sprite: Phaser.GameObjects.Image;
  readonly hitZone: Phaser.GameObjects.Zone;
  isoDepth: number;

  // Silhouette ghost — created/destroyed by OcclusionSystem
  ghost: Phaser.GameObjects.Image | null = null;

  // Ambient walk cooldown
  private ambientTimer = 0;

  constructor(scene: Phaser.Scene, cfg: EmployeeEntityConfig) {
    this.employeeId = cfg.employee.id;
    this.employee = cfg.employee;
    this.col = cfg.col;
    this.row = cfg.row;
    this.facing = cfg.facing;

    const { screenX, screenY, depth } = tileToScreen(cfg.col, cfg.row, cfg.originX, cfg.originY);
    this.isoDepth = depth;

    // Use charId texture (placeholder rectangle until real sprites land)
    this.sprite = scene.add.image(screenX, screenY - 8, cfg.charId);
    this.sprite.setOrigin(0.5, 1);
    this.sprite.setDepth(depth);

    // Interactive hit zone covers sprite bounds
    const { width, height } = this.sprite;
    this.hitZone = scene.add.zone(screenX, screenY - 8, width, height).setOrigin(0.5, 1);
    this.hitZone.setInteractive({ cursor: "pointer" });
    this.hitZone.setDepth(depth + 1);

    // Idle bob tween (respects prefers-reduced-motion via CSS media query check)
    if (!prefersReducedMotion()) {
      scene.tweens.add({
        targets: this.sprite,
        y: screenY - 8 - 2,
        duration: 800,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    }
  }

  /** Move entity to new tile position (no pathfinding — teleport for Phase 1). */
  moveTo(col: number, row: number, originX: number, originY: number): void {
    this.col = col;
    this.row = row;
    const { screenX, screenY, depth } = tileToScreen(col, row, originX, originY);
    this.isoDepth = depth;
    this.sprite.setPosition(screenX, screenY - 8);
    this.hitZone.setPosition(screenX, screenY - 8);
  }

  setState(state: CharState): void {
    this.state = state;
  }

  /** OcclusionSystem calls this each frame to set depth based on layer analysis. */
  applyDepth(depth: number): void {
    this.sprite.setDepth(depth);
    this.hitZone.setDepth(depth + 1);
  }

  destroy(): void {
    this.sprite.destroy();
    this.hitZone.destroy();
    this.ghost?.destroy();
  }
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
