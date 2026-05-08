// 3-layer scene structure owner (design C8).
// Sole authority for setDepth() calls on all game objects.
// Each frame: walks every EmployeeEntity, hit-tests against frontOccluders,
// spawns/updates silhouette ghost sprite when intersection detected.

import Phaser from "phaser";
import { DEPTH_BACK_WALLS, DEPTH_FRONT_OCCLUDERS } from "@/lib/scene/iso-math";
import type { Tile } from "../entities/Tile";
import type { EmployeeEntity } from "../entities/EmployeeEntity";

// Ghost sprite style: ramp-1 light, alpha 0.55
const GHOST_TINT = 0xc4cfe0;
const GHOST_ALPHA = 0.55;

export class OcclusionSystem {
  private scene: Phaser.Scene;
  private occluderTiles: Tile[] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /** Register all tiles; OcclusionSystem applies initial depths. */
  registerTiles(tiles: Tile[]): void {
    this.occluderTiles = tiles.filter((t) => t.layer === "frontOccluder");
    for (const tile of tiles) {
      tile.sprite.setDepth(tile.baseDepth());
    }
  }

  /** Called every frame by OrgScene.update(). */
  update(entities: Map<string, EmployeeEntity>): void {
    for (const entity of entities.values()) {
      const occluded = this.isOccluded(entity);
      this.applyEntityDepth(entity, occluded);
    }
  }

  private isOccluded(entity: EmployeeEntity): boolean {
    const eBounds = entity.sprite.getBounds();
    for (const occ of this.occluderTiles) {
      const oBounds = occ.sprite.getBounds();
      if (Phaser.Geom.Intersects.RectangleToRectangle(eBounds, oBounds)) {
        return true;
      }
    }
    return false;
  }

  private applyEntityDepth(entity: EmployeeEntity, occluded: boolean): void {
    if (occluded) {
      // Entity is behind a front occluder → show ghost, hide real sprite
      entity.sprite.setAlpha(0);
      this.updateGhost(entity);
      entity.applyDepth(DEPTH_FRONT_OCCLUDERS - 1); // ghost sits just behind occluder
    } else {
      // Visible — remove ghost, show real sprite
      entity.sprite.setAlpha(1);
      this.destroyGhost(entity);
      entity.applyDepth(entity.isoDepth);
    }
  }

  private updateGhost(entity: EmployeeEntity): void {
    if (!entity.ghost) {
      entity.ghost = this.scene.add.image(
        entity.sprite.x,
        entity.sprite.y,
        entity.sprite.texture.key,
      );
      entity.ghost.setOrigin(entity.sprite.originX, entity.sprite.originY);
      entity.ghost.setTint(GHOST_TINT);
      entity.ghost.setAlpha(GHOST_ALPHA);
    }
    entity.ghost.setPosition(entity.sprite.x, entity.sprite.y);
    entity.ghost.setDepth(DEPTH_FRONT_OCCLUDERS - 2);
  }

  private destroyGhost(entity: EmployeeEntity): void {
    if (entity.ghost) {
      entity.ghost.destroy();
      entity.ghost = null;
    }
  }

  /** Must be called when entities are removed from scene. */
  cleanupEntity(entity: EmployeeEntity): void {
    this.destroyGhost(entity);
  }
}
