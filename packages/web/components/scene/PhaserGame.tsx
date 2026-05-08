"use client";

// Mounts the Phaser game into a div. Dynamic-import-only (ssr:false guard in page.tsx).
// Handles resize and cleanup. Exposes nothing to caller except the container ref.

import { useEffect, useRef } from "react";
import type Phaser from "phaser";

// We import scene classes lazily inside useEffect to avoid SSR issues.
type GameRef = { game: InstanceType<(typeof import("phaser"))["Game"]> };

export function PhaserGame() {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gameRef = useRef<{ game: any } | null>(null);

  useEffect(() => {
    if (!containerRef.current || gameRef.current) return;
    const el = containerRef.current;

    let cancelled = false;

    (async () => {
      const [PhaserModule, { BootScene }, { SceneRouter }, { OrgScene }] = await Promise.all([
        import("phaser"),
        import("./scene/BootScene"),
        import("./scene/SceneRouter"),
        import("./scene/OrgScene"),
      ]);
      if (cancelled) return;

      const Ph = PhaserModule.default;

      const config: Phaser.Types.Core.GameConfig = {
        type: Ph.AUTO,
        width: el.offsetWidth || 800,
        height: el.offsetHeight || 600,
        backgroundColor: "#0d0f14",
        parent: el,
        pixelArt: true,
        scene: [BootScene, SceneRouter, OrgScene],
        scale: {
          mode: Ph.Scale.RESIZE,
          autoCenter: Ph.Scale.CENTER_BOTH,
        },
        audio: { noAudio: true },
      };

      const game = new Ph.Game(config);
      gameRef.current = { game };
    })();

    return () => {
      cancelled = true;
      if (gameRef.current) {
        gameRef.current.game.destroy(true);
        gameRef.current = null;
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="h-full w-full"
      style={{ imageRendering: "pixelated" }}
    />
  );
}
