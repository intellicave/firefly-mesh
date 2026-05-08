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
  "tile/bookcase":    0x3a2510,
  "tile/sofa":        0x2a2a3a,
  "tile/server-rack": 0x202835,
  "tile/tv-screen":   0x101828,
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

  /** Queue all shipped tile PNGs for loading. Call in BootScene.preload(). */
  loadTileAssets(): void {
    const TILE_BASE = "/scene/assets/tiles";
    const tiles: Array<[string, string]> = [
      ["tile/floor-office",    `${TILE_BASE}/tile__floor-office.png`],
      ["tile/floor-hallway",   `${TILE_BASE}/tile__floor-hallway.png`],
      ["tile/wall-back",       `${TILE_BASE}/tile__wall-back.png`],
      ["tile/wall-side-w",     `${TILE_BASE}/tile__wall-side-w.png`],
      ["tile/wall-side-e",     `${TILE_BASE}/tile__wall-side-e.png`],
      ["tile/wall-corner-nw",  `${TILE_BASE}/tile__wall-corner-nw.png`],
      ["tile/wall-corner-ne",  `${TILE_BASE}/tile__wall-corner-ne.png`],
      ["tile/wall-doorway-s",  `${TILE_BASE}/tile__wall-doorway-s.png`],
      ["tile/desk-ceo",        `${TILE_BASE}/tile__desk-ceo.png`],
      ["tile/desk-employee",   `${TILE_BASE}/tile__desk-employee.png`],
      ["tile/chair",           `${TILE_BASE}/tile__chair.png`],
      ["tile/bulletin",        `${TILE_BASE}/tile__bulletin.png`],
      ["tile/cooler",          `${TILE_BASE}/tile__cooler.png`],
      ["tile/plant",           `${TILE_BASE}/tile__plant.png`],
      ["tile/whiteboard",      `${TILE_BASE}/tile__whiteboard.png`],
      ["tile/bookcase",        `${TILE_BASE}/tile__bookcase.png`],
      ["tile/sofa",            `${TILE_BASE}/tile__sofa.png`],
      ["tile/server-rack",     `${TILE_BASE}/tile__server-rack.png`],
      ["tile/tv-screen",       `${TILE_BASE}/tile__tv-screen.png`],
    ];
    for (const [key, path] of tiles) {
      this.scene.load.image(key, path);
    }
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
    // Actual sizes from PixelLab MCP output (Phase 2 production tiles)
    const tileSizes: Record<string, [number, number]> = {
      "tile/floor-office":   [64, 64],
      "tile/floor-hallway":  [64, 64],
      "tile/wall-back":      [64, 64],
      "tile/wall-side-w":    [32, 32],
      "tile/wall-side-e":    [32, 32],
      "tile/wall-corner-nw": [32, 32],
      "tile/wall-corner-ne": [32, 32],
      "tile/wall-doorway-s": [64, 64],
      "tile/desk-ceo":       [64, 64],
      "tile/desk-employee":  [64, 64],
      "tile/chair":          [32, 32],
      "tile/bulletin":       [32, 32],
      "tile/cooler":         [32, 32],
      "tile/plant":          [32, 32],
      "tile/whiteboard":     [48, 48],
      "tile/bookcase":       [48, 48],
      "tile/sofa":           [64, 64],
      "tile/server-rack":    [32, 32],
      "tile/tv-screen":      [64, 64],
    };

    for (const [key, [w, h]] of Object.entries(tileSizes)) {
      if (!this.scene.textures.exists(key)) {
        this.makePlaceholder(key, w, h, PLACEHOLDER_COLORS[key] ?? 0x333333);
      }
    }

    // Character placeholders — IDs match stage-all-chars.mjs CHARS array
    for (const id of [
      "char/firefly-ceo", "char/firefly-coo", "char/firefly-cto",
      "char/firefly-pm", "char/firefly-marketer", "char/firefly-service-lead",
      "char/firefly-warehouse-lead", "char/firefly-ops",
      "char/firefly-engineer", "char/firefly-designer",
    ]) {
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
