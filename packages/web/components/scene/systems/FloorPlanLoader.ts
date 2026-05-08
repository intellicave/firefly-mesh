// Parse floor-plan JSON → instantiate Tile + DepartmentRoom objects.
// Tile layer assignment is derived from grid position (not declared per-cell).

import Phaser from "phaser";
import { Tile, type TileLayer } from "../entities/Tile";
import { DepartmentRoom, type DeskSlot } from "../entities/DepartmentRoom";

interface FloorPlanRoom {
  label: string;
  bounds: { colMin: number; colMax: number; rowMin: number; rowMax: number };
  desk_slots: Array<{ id: string; col: number; row: number; facing: string; type: string }>;
}

interface FloorPlan {
  version: string;
  cols: number;
  rows: number;
  rooms: Record<string, FloorPlanRoom>;
}

export interface FloorLayout {
  tiles: Tile[];
  rooms: Map<string, DepartmentRoom>;
  allTiles: Tile[];
}

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

    // Create DepartmentRoom objects
    for (const [id, rDef] of Object.entries(plan.rooms)) {
      const slots: DeskSlot[] = rDef.desk_slots.map((s) => ({
        ...s,
        occupantId: null,
      }));
      const room = new DepartmentRoom(id, rDef.label, rDef.bounds, slots);
      rooms.set(id, room);
    }

    // Instantiate one Tile per cell
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
        if (roomId) rooms.get(roomId)?.addTile(tile);
      }
    }

    // Instantiate furniture tiles at desk slots
    for (const room of rooms.values()) {
      for (const slot of room.deskSlots) {
        const furnitureTileId = slot.type === "desk-ceo"
          ? "tile/desk-ceo" : "tile/desk-employee";
        const tile = new Tile(this.scene, {
          col: slot.col, row: slot.row,
          tileId: furnitureTileId,
          layer: "furniture",
          originX: this.originX,
          originY: this.originY,
        });
        allTiles.push(tile);
        room.addTile(tile);
      }
    }

    return { tiles: allTiles, rooms, allTiles };
  }

  private buildRoomLookup(plan: FloorPlan): Map<string, string> {
    const lookup = new Map<string, string>();
    for (const [id, rDef] of Object.entries(plan.rooms)) {
      const { colMin, colMax, rowMin, rowMax } = rDef.bounds;
      for (let r = rowMin; r <= rowMax; r++) {
        for (let c = colMin; c <= colMax; c++) {
          lookup.set(`${c},${r}`, id);
        }
      }
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

    // Corners take priority over flat back-wall
    if (isBackWallRow && isLeftEdge)  return { tileId: "tile/wall-corner-nw", layer: "backWall" };
    if (isBackWallRow && isRightEdge) return { tileId: "tile/wall-corner-ne", layer: "backWall" };
    if (isBackWallRow)                return { tileId: "tile/wall-back",      layer: "backWall" };
    if (isLeftEdge)                   return { tileId: "tile/wall-side-w",    layer: "frontOccluder" };
    if (isRightEdge)                  return { tileId: "tile/wall-side-e",    layer: "frontOccluder" };
    if (isHallway)                    return { tileId: "tile/floor-hallway",  layer: "floor" };
    return { tileId: "tile/floor-office", layer: "floor" };
  }
}
