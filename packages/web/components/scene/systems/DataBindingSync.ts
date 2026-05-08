// TanStack Query → Phaser bridge (Phaser-side).
// Receives orgGraphUpdate events from sceneBus; diffs against entity registry;
// spawns / updates / destroys EmployeeEntity instances.
// Never imports React, useQuery, or fetch (C2, C3).

import Phaser from "phaser";
import { sceneBus, type OrgGraphPayload, type OrgEmployee } from "@/lib/scene/event-bus";
import { EmployeeEntity } from "../entities/EmployeeEntity";
import type { DepartmentRoom } from "../entities/DepartmentRoom";
import type { AnimationSystem } from "./AnimationSystem";
import type { LanternOverlaySystem } from "./LanternOverlaySystem";
import type { OcclusionSystem } from "./OcclusionSystem";

// Role → room priority (design §2.1)
const ROLE_ROOM: Record<string, string> = {
  owner: "ceo-office",
  admin: "ceo-office",
  manager: "product-maker",
  employee: "sales-bullpen",
  auditor: "floor-flex",
};

export class DataBindingSync {
  private scene: Phaser.Scene;
  private entities = new Map<string, EmployeeEntity>();
  private rooms: Map<string, DepartmentRoom>;
  private originX: number;
  private originY: number;
  private animSys: AnimationSystem;
  private lanternSys: LanternOverlaySystem;
  private occlusionSys: OcclusionSystem;
  private onEmployeeClick: (id: string) => void;
  private unsubscribe: (() => void) | null = null;

  constructor(opts: {
    scene: Phaser.Scene;
    rooms: Map<string, DepartmentRoom>;
    originX: number;
    originY: number;
    animSys: AnimationSystem;
    lanternSys: LanternOverlaySystem;
    occlusionSys: OcclusionSystem;
    onEmployeeClick: (id: string) => void;
  }) {
    this.scene = opts.scene;
    this.rooms = opts.rooms;
    this.originX = opts.originX;
    this.originY = opts.originY;
    this.animSys = opts.animSys;
    this.lanternSys = opts.lanternSys;
    this.occlusionSys = opts.occlusionSys;
    this.onEmployeeClick = opts.onEmployeeClick;
  }

  start(): void {
    const handler = (data: OrgGraphPayload) => this.reconcile(data);
    sceneBus.on("orgGraphUpdate", handler);
    this.unsubscribe = () => sceneBus.off("orgGraphUpdate", handler);
  }

  stop(): void {
    this.unsubscribe?.();
  }

  getEntities(): Map<string, EmployeeEntity> {
    return this.entities;
  }

  private reconcile(data: OrgGraphPayload): void {
    const incoming = new Map(data.employees.map((e) => [e.id, e]));

    // Destroy removed employees
    for (const [id, entity] of this.entities) {
      if (!incoming.has(id)) {
        this.removeEntity(id, entity);
      }
    }

    // Spawn new employees; update existing
    for (const [id, emp] of incoming) {
      if (this.entities.has(id)) {
        this.updateEntity(id, emp);
      } else {
        this.spawnEntity(emp);
      }
    }
  }

  private spawnEntity(emp: OrgEmployee): void {
    const roomId = ROLE_ROOM[emp.role] ?? "floor-flex";
    const room = this.rooms.get(roomId) ?? this.rooms.get("floor-flex")!;
    const slot = room?.claimNextSlot(emp.id);
    if (!slot) return; // no free desks — overflow not shown in V1

    const charId = roleToCharId(emp.role);
    const entity = new EmployeeEntity(this.scene, {
      employee: emp,
      charId,
      col: slot.col,
      row: slot.row,
      facing: slot.facing as never,
      originX: this.originX,
      originY: this.originY,
    });

    entity.hitZone.on("pointerup", () => this.onEmployeeClick(emp.id));
    this.animSys.register(entity);
    this.lanternSys.register(entity);
    this.entities.set(emp.id, entity);
  }

  private updateEntity(id: string, emp: OrgEmployee): void {
    const entity = this.entities.get(id)!;
    // Update employee reference (name/title may have changed)
    Object.assign(entity.employee, emp);
  }

  private removeEntity(id: string, entity: EmployeeEntity): void {
    this.occlusionSys.cleanupEntity(entity);
    this.animSys.unregister(id);
    this.lanternSys.unregister(id);
    // Find and release desk slot
    for (const room of this.rooms.values()) room.releaseSlot(id);
    entity.destroy();
    this.entities.delete(id);
  }
}

function roleToCharId(role: string): string {
  const map: Record<string, string> = {
    owner: "char/firefly-ceo",
    admin: "char/firefly-exec",
    manager: "char/firefly-pm",
    employee: "char/firefly-eng",
    auditor: "char/firefly-ops",
  };
  return map[role] ?? "char/firefly-eng";
}
