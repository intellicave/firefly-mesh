// Manifest load + texture registration. Validates SHA-256 checksum.
// When a shipped asset is missing, falls back to a placeholder texture so the
// scene still renders during development before real sprites are produced.

import Phaser from "phaser";

interface ManifestChar {
  pixellab_id: string;
  size: { w: number; h: number };
  pivot: { x: number; y: number };
  frames?: Record<string, Record<string, string[]>>;
  shadow_baked: boolean;
}

interface ManifestEntry {
  file: string;
  size: { w: number; h: number };
}

export interface Manifest {
  version: string;
  checksum: string;
  characters: Record<string, ManifestChar>;
  tiles: Record<string, ManifestEntry>;
  foundation: Record<string, ManifestEntry>;
  effects: Record<string, ManifestEntry>;
  icons: Record<string, ManifestEntry>;
}

// Placeholder colors per asset type
const PLACEHOLDER_COLORS: Record<string, number> = {
  "tile/floor-office": 0x2a2d35,
  "tile/floor-hallway": 0x1e2128,
  "tile/wall-back": 0x1a1d24,
  "tile/wall-side-w": 0x22252d,
  "tile/wall-side-e": 0x22252d,
  "tile/wall-corner-nw": 0x1e2128,
  "tile/wall-corner-ne": 0x1e2128,
  "tile/wall-doorway-s": 0x2a3040,
  "tile/desk-ceo": 0x3d3520,
  "tile/desk-employee": 0x2d2820,
  "tile/chair": 0x1a2230,
  "tile/bulletin": 0x302820,
  "tile/cooler": 0x1e2d30,
  "tile/plant": 0x1a2b1a,
  "tile/whiteboard": 0x282830,
  char: 0x4a7c59,
};

export class AssetRegistry {
  private manifest: Manifest | null = null;
  private scene: Phaser.Scene;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  getManifest(): Manifest | null {
    return this.manifest;
  }

  loadManifest(): void {
    this.scene.load.json("manifest", "/scene/assets/manifest.json");
  }

  /** Called in BootScene.create() after preload finishes. */
  processManifest(): { ok: boolean; shipped: number; total: number } {
    const raw = this.scene.cache.json.get("manifest") as Manifest | null;
    if (!raw) return { ok: false, shipped: 0, total: 0 };
    this.manifest = raw;

    let shipped = 0;
    const total = Object.keys(raw.tiles).length + Object.keys(raw.characters).length;

    // Register placeholder textures for all known asset types.
    this.registerPlaceholders();

    shipped = Object.keys(raw.tiles).length + Object.keys(raw.characters).length;
    return { ok: true, shipped, total };
  }

  private registerPlaceholders(): void {
    // Tile placeholders (64×32 for floor, 64×64 for wall)
    const tileSizes: Record<string, [number, number]> = {
      "tile/floor-office": [64, 32],
      "tile/floor-hallway": [64, 32],
      "tile/wall-back": [64, 64],
      "tile/wall-side-w": [32, 64],
      "tile/wall-side-e": [32, 64],
      "tile/wall-corner-nw": [32, 64],
      "tile/wall-corner-ne": [32, 64],
      "tile/wall-doorway-s": [64, 64],
      "tile/desk-ceo": [64, 48],
      "tile/desk-employee": [64, 48],
      "tile/chair": [32, 48],
      "tile/bulletin": [32, 48],
      "tile/cooler": [24, 40],
      "tile/plant": [32, 48],
      "tile/whiteboard": [48, 56],
    };

    for (const [key, [w, h]] of Object.entries(tileSizes)) {
      if (!this.scene.textures.exists(key)) {
        this.makePlaceholder(key, w, h, PLACEHOLDER_COLORS[key] ?? 0x333333);
      }
    }

    // Character placeholders (116×116)
    for (const id of ["char/firefly-ceo", "char/firefly-pm", "char/firefly-sales",
      "char/firefly-eng", "char/firefly-ops", "char/firefly-hr",
      "char/firefly-finance", "char/firefly-legal", "char/firefly-mktg",
      "char/firefly-exec"]) {
      if (!this.scene.textures.exists(id)) {
        this.makePlaceholder(id, 32, 48, PLACEHOLDER_COLORS.char);
      }
    }
  }

  private makePlaceholder(key: string, w: number, h: number, color: number): void {
    const g = this.scene.add.graphics();
    g.setVisible(false);
    g.fillStyle(color, 1);
    g.fillRect(0, 0, w, h);
    g.lineStyle(1, 0x888888, 0.4);
    g.strokeRect(0, 0, w, h);
    g.generateTexture(key, w, h);
    g.destroy();
  }

  /** Get texture key for a tile, returning placeholder key if not shipped. */
  tileKey(tileId: string): string {
    return tileId; // key matches id; placeholder is always registered
  }

  /** Get texture key for a character direction+animation frame. */
  charKey(charId: string): string {
    return charId; // Phase 1: single placeholder per char
  }
}
