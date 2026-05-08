// Manages active view lifecycle. Only place that calls scene.start/stop/sleep (C7).
// Subscribes to sceneBus "setView" events from React toolbar.

import Phaser from "phaser";
import { sceneBus } from "@/lib/scene/event-bus";

type ViewKey = "org" | "task" | "a2a";

export class SceneRouter extends Phaser.Scene {
  private currentView: ViewKey = "org";

  constructor() {
    super({ key: "SceneRouter" });
  }

  create(): void {
    sceneBus.on("setView", ({ view }) => {
      if (view === this.currentView) return;
      this.switchView(view);
    });

    // Emit initial view so toolbar reflects correct state
    sceneBus.emit("viewChanged", { view: "org" });
  }

  private switchView(next: ViewKey): void {
    const prev = this.currentView;
    this.currentView = next;

    if (prev === "task") this.scene.stop("TaskScene");
    if (next === "task") this.scene.start("TaskScene");

    // A2AOverlay runs concurrently with OrgScene (additive layer)
    if (prev === "a2a") this.scene.stop("A2AOverlayScene");
    if (next === "a2a") this.scene.launch("A2AOverlayScene");

    sceneBus.emit("viewChanged", { view: next });
  }
}
