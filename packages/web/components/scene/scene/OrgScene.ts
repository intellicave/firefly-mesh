// OrgScene — main office floor: tile composition + employee entities.
// Subscribes to orgGraphUpdate via DataBindingSync; click events bubble via
// sceneBus to React AgentDetailDrawer (design §3.1, §3.3 step 4-6).

import Phaser from "phaser";
import { sceneBus } from "@/lib/scene/event-bus";
import { defaultOrigin, isoGridBounds } from "@/lib/scene/iso-math";
import { FloorPlanLoader } from "../systems/FloorPlanLoader";
import { DataBindingSync } from "../systems/DataBindingSync";
import { AnimationSystem } from "../systems/AnimationSystem";
import { LanternOverlaySystem } from "../systems/LanternOverlaySystem";
import { OcclusionSystem } from "../systems/OcclusionSystem";
import type { DepartmentRoom } from "../entities/DepartmentRoom";

const SCENE_BG = 0x0d0f14;

export class OrgScene extends Phaser.Scene {
  private animSys!: AnimationSystem;
  private lanternSys!: LanternOverlaySystem;
  private occlusionSys!: OcclusionSystem;
  private dataSync!: DataBindingSync;
  private rooms!: Map<string, DepartmentRoom>;
  private originX = 0;
  private originY = 0;
  private ready = false;

  constructor() {
    super({ key: "OrgScene" });
  }

  create(): void {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor(SCENE_BG);

    // Position iso grid centred in the viewport (both axes)
    const { height: gridH } = isoGridBounds();
    const origin = defaultOrigin(width);
    this.originX = origin.x;
    // Centre vertically; clamp so top tile always has room above it
    this.originY = Math.max(60, (height - gridH) / 2);

    // Initialise systems
    this.animSys = new AnimationSystem();
    this.lanternSys = new LanternOverlaySystem();
    this.occlusionSys = new OcclusionSystem(this);

    // Load floor plan and build tiles
    this.loadFloor().then(() => {
      this.dataSync = new DataBindingSync({
        scene: this,
        rooms: this.rooms,
        originX: this.originX,
        originY: this.originY,
        animSys: this.animSys,
        lanternSys: this.lanternSys,
        occlusionSys: this.occlusionSys,
        onEmployeeClick: (id) => {
          sceneBus.emit("employeeClick", { employeeId: id });
        },
      });
      this.dataSync.start();
      this.ready = true;
      sceneBus.emit("sceneReady", undefined);
    }).catch((err: unknown) => {
      console.error("[OrgScene] floor plan load failed:", err);
    });

    // Camera pan + zoom
    this.input.on("wheel", (_p: Phaser.Input.Pointer, _go: unknown, _dx: number, dy: number) => {
      const cam = this.cameras.main;
      const newZoom = Phaser.Math.Clamp(cam.zoom - dy * 0.001, 0.5, 2.5);
      cam.setZoom(newZoom);
    });

    this.setupDrag();

    // Also start SceneRouter (it manages view switching)
    if (!this.scene.isActive("SceneRouter")) {
      this.scene.launch("SceneRouter");
    }
  }

  private async loadFloor(): Promise<void> {
    const loader = new FloorPlanLoader(this, this.originX, this.originY);
    const layout = await loader.load();
    this.rooms = layout.rooms;
    this.occlusionSys.registerTiles(layout.allTiles);
  }

  private setupDrag(): void {
    let dragging = false;
    let lastX = 0, lastY = 0;

    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      dragging = true;
      lastX = p.x;
      lastY = p.y;
    });
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      if (!dragging) return;
      const cam = this.cameras.main;
      cam.scrollX -= (p.x - lastX) / cam.zoom;
      cam.scrollY -= (p.y - lastY) / cam.zoom;
      lastX = p.x;
      lastY = p.y;
    });
    this.input.on("pointerup", () => { dragging = false; });
  }

  update(time: number, delta: number): void {
    if (!this.ready || !this.dataSync) return;
    const entities = this.dataSync.getEntities();
    this.animSys.update(time, delta);
    this.lanternSys.update(entities, delta);
    this.occlusionSys.update(entities);
  }

  shutdown(): void {
    this.dataSync?.stop();
  }
}
