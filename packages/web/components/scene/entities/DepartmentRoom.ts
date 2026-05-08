// Logical aggregator for a room's tile composition + desk slots.
// Holds no sprite of its own; owns Tile instances + desk_slot positions.

import type { Tile } from "./Tile";

export interface DeskSlot {
  id: string;
  col: number;
  row: number;
  facing: string;
  type: string;
  occupantId: string | null;
}

export interface RoomBounds {
  colMin: number;
  colMax: number;
  rowMin: number;
  rowMax: number;
}

export class DepartmentRoom {
  readonly id: string;
  readonly label: string;
  readonly bounds: RoomBounds;
  readonly tiles: Tile[] = [];
  readonly deskSlots: DeskSlot[];

  constructor(
    id: string,
    label: string,
    bounds: RoomBounds,
    deskSlots: DeskSlot[],
  ) {
    this.id = id;
    this.label = label;
    this.bounds = bounds;
    this.deskSlots = deskSlots.map((s) => ({ ...s, occupantId: null }));
  }

  addTile(tile: Tile): void {
    this.tiles.push(tile);
  }

  /** Claim the next free desk slot; returns slot id or null if all occupied. */
  claimNextSlot(employeeId: string): DeskSlot | null {
    const free = this.deskSlots.find((s) => s.occupantId === null);
    if (!free) return null;
    free.occupantId = employeeId;
    return free;
  }

  releaseSlot(employeeId: string): void {
    const slot = this.deskSlots.find((s) => s.occupantId === employeeId);
    if (slot) slot.occupantId = null;
  }

  getSlotForEmployee(employeeId: string): DeskSlot | null {
    return this.deskSlots.find((s) => s.occupantId === employeeId) ?? null;
  }

  destroy(): void {
    this.tiles.forEach((t) => t.destroy());
  }
}
