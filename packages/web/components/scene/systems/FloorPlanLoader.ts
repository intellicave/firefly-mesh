// Parse floor-plan JSON → instantiate Tile + DepartmentRoom objects.
// Supports partition_cols (internal room dividers), decor_slots (env furniture),
// and floor_tint (per-room colour overlay).

import Phaser from "phaser";
import { Tile, type TileLayer } from "../entities/Tile";
import { DepartmentRoom, type DeskSlot } from "../entities/DepartmentRoom";

interface DecorSlot {
  id: string;
  col: number;
  row: number;
  tile: string; // full tile key, e.g. "tile/plant"
}

interface FloorPlanRoom {
  label: string;
  bounds: { colMin: number; colMax: number; rowMin: number; rowMax: number };
  desk_slots: Array<{ id: string; col: number; row: number; facing: string; type: string }>;
  decor_slots?: DecorSlot[];
  floor_tint?: number; // Phaser hex colour, e.g. 0xFFD070
}

interface PartitionCol {
  col: number;
  rowMin: number;
  rowMax: number;
}

interface FloorPlan {
  version: string;
  cols: number;
  rows: number;
  rooms: Record<string, FloorPlanRoom>;
  partition_cols?: PartitionCol[];
}

export interface FloorLayout {
  tiles: Tile[];
  rooms: Map<string, DepartmentRoom>;
  allTiles: Tile[];
}

// desk_slot.type → tile key
const DESK_TILE: Record<string, string> = {
  "desk-ceo":      "tile/desk-ceo",
  "desk-employee": "tile/desk-employee",
};

export class FloorPlanLoader {
  private scene: Phaser.Scene;
  private originX: number;
  private originY: number;

  constructor(scene: Phaser.Scene, originX: number, originY: number) {
    this.scene = scene;
    this.originX = originX;
    this.originY = originY;
  }

  async load(): Promise<FloorLayout> {
    const resp = await fetch("/scene/floor-plans/v1-default.json");
    const plan: FloorPlan = await resp.json();
    return this.build(plan);
  }

  private build(plan: FloorPlan): FloorLayout {
    const roomForCell = this.buildRoomLookup(plan);
    const rooms = new Map<string, DepartmentRoom>();
    const allTiles: Tile[] = [];

    // Build DepartmentRoom objects
    for (const [id, rDef] of Object.entries(plan.rooms)) {
      const slots: DeskSlot[] = rDef.desk_slots.map((s) => ({ ...s, occupantId: null }));
      rooms.set(id, new DepartmentRoom(id, rDef.label, rDef.bounds, slots));
    }

    // Floor + wall tiles (one per grid cell)
    for (let row = 0; row < plan.rows; row++) {
      for (let col = 0; col < plan.cols; col++) {
        const { tileId, layer } = this.classifyCell(col, row, plan);
        const tile = new Tile(this.scene, {
          col, row, tileId, layer,
          originX: this.originX,
          originY: this.originY,
        });
        allTiles.push(tile);

        const roomId = roomForCell.get(`${col},${row}`);
        if (roomId) {
          rooms.get(roomId)?.addTile(tile);
          // Apply per-room floor tint
          const tint = plan.rooms[roomId]?.floor_tint;
          if (layer === "floor" && tint != null) {
            tile.sprite.setTint(tint);
          }
        }
      }
    }

    // Desk furniture tiles
    for (const [roomId, room] of rooms) {
      for (const slot of room.deskSlots) {
        const tileKey = DESK_TILE[slot.type] ?? "tile/desk-employee";
        const tile = new Tile(this.scene, {
          col: slot.col, row: slot.row,
          tileId: tileKey,
          layer: "furniture",
          originX: this.originX,
          originY: this.originY,
        });
        allTiles.push(tile);
        room.addTile(tile);
      }

      // Decorative / env furniture tiles
      const decors = plan.rooms[roomId]?.decor_slots ?? [];
      for (const d of decors) {
        const tile = new Tile(this.scene, {
          col: d.col, row: d.row,
          tileId: d.tile,
          layer: "furniture",
          originX: this.originX,
          originY: this.originY,
        });
        allTiles.push(tile);
        room.addTile(tile);
      }
    }

    // Partition walls overlay floor tiles at room boundaries.
    // Placed AFTER the floor loop so both floor + wall exist at these cells.
    for (const pw of plan.partition_cols ?? []) {
      for (let row = pw.rowMin; row <= pw.rowMax; row++) {
        const tile = new Tile(this.scene, {
          col: pw.col, row,
          tileId: "tile/wall-side-w",
          layer: "furniture",
          originX: this.originX,
          originY: this.originY,
        });
        allTiles.push(tile);
      }
    }

    return { tiles: allTiles, rooms, allTiles };
  }

  private buildRoomLookup(plan: FloorPlan): Map<string, string> {
    const lookup = new Map<string, string>();
    for (const [id, rDef] of Object.entries(plan.rooms)) {
      const { colMin, colMax, rowMin, rowMax } = rDef.bounds;
      for (let r = rowMin; r <= rowMax; r++)
        for (let c = colMin; c <= colMax; c++)
          lookup.set(`${c},${r}`, id);
    }
    return lookup;
  }

  private classifyCell(
    col: number, row: number, plan: FloorPlan,
  ): { tileId: string; layer: TileLayer } {
    const isBackWallRow = row === 0 || row === 5;
    const isHallway     = row === 4;
    const isLeftEdge    = col === 0;
    const isRightEdge   = col === plan.cols - 1;

    if (isBackWallRow && isLeftEdge)  return { tileId: "tile/wall-corner-nw", layer: "backWall" };
    if (isBackWallRow && isRightEdge) return { tileId: "tile/wall-corner-ne", layer: "backWall" };
    if (isBackWallRow)                return { tileId: "tile/wall-back",      layer: "backWall" };

    // Side walls only on the row directly below each back-wall row
    const isSideWallRow = row === 1 || row === 6;
    if (isSideWallRow && isLeftEdge)  return { tileId: "tile/wall-side-w", layer: "backWall" };
    if (isSideWallRow && isRightEdge) return { tileId: "tile/wall-side-e", layer: "backWall" };

    if (isHallway) return { tileId: "tile/floor-hallway", layer: "floor" };
    return { tileId: "tile/floor-office", layer: "floor" };
  }
}
