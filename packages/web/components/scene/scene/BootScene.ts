// Preloads manifest.json + all shipped assets. Registers placeholder textures
// for anything not yet shipped. Emits sceneReady after bootstrap fetch.

import Phaser from "phaser";
import { sceneBus } from "@/lib/scene/event-bus";
import { AssetRegistry } from "../systems/AssetRegistry";

export class BootScene extends Phaser.Scene {
  private assetReg!: AssetRegistry;

  constructor() {
    super({ key: "BootScene" });
  }

  preload(): void {
    this.assetReg = new AssetRegistry(this);
    this.assetReg.loadManifest();

    // Show loading progress in console during development
    this.load.on("progress", (value: number) => {
      if (typeof process !== "undefined") {
        // server-side guard — preload only runs in browser
      }
      void value;
    });
  }

  create(): void {
    const { ok } = this.assetReg.processManifest();
    if (!ok) {
      console.warn("[BootScene] manifest.json not found or invalid — running with placeholders only");
    }

    // Expose registry via game data store for other scenes
    this.game.registry.set("assetRegistry", this.assetReg);

    // Start OrgScene immediately (it handles empty state gracefully)
    this.scene.start("OrgScene");
  }
}
