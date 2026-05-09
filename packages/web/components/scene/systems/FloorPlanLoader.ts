// Parse Tiled isometric map JSON → instantiate Tile + DepartmentRoom objects.
// Tile layers (floor / walls / decor) become Tile entities at the corresponding
// scene layer. Object groups carry semantic data:
//  - "rooms" objects define bounds, label, and floor tint per department
//  - "desks" tile-objects render desk furniture and supply DeskSlot metadata

import Phaser from "phaser";
import { Tile, type TileLayer } from "../entities/Tile";
import { DepartmentRoom, type DeskSlot, type RoomBounds } from "../entities/DepartmentRoom";

interface TiledProperty {
  name: string;
  type: string;
  value: string | number | boolean;
}

interface TiledTileDef {
  id: number;
  image: string;
  imagewidth: number;
  imageheight: number;
  properties?: TiledProperty[];
}

interface TiledTileset {
  firstgid: number;
  name: string;
  tiles: TiledTileDef[];
}

interface TiledTileLayer {
  type: "tilelayer";
  name: string;
  width: number;
  height: number;
  data: number[];
}

interface TiledObject {
  id: number;
  name: string;
  type: string;
  gid?: number;
  x: number;
  y: number;
  width: number;
  height: number;
  properties?: TiledProperty[];
}

interface TiledObjectGroup {
  type: "objectgroup";
  name: string;
  objects: TiledObject[];
}

type TiledLayer = TiledTileLayer | TiledObjectGroup;

interface TiledMap {
  width: number;
  height: number;
  tilewidth: number;
  tileheight: number;
  tilesets: TiledTileset[];
  layers: TiledLayer[];
}

export interface FloorLayout {
  tiles: Tile[];
  rooms: Map<string, DepartmentRoom>;
  allTiles: Tile[];
}

interface RoomDef {
  bounds: RoomBounds;
  tint: number | null;
  label: string;
}

const TILE_LAYER_MAP: Record<string, TileLayer> = {
  floor: "floor",
  walls: "backWall",
  decor: "furniture",
  furniture: "furniture",
  frontOccluders: "frontOccluder",
};

const TILED_MAP_PATH = "/scene/tiled/firefly-office.tmj";

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
    const resp = await fetch(TILED_MAP_PATH);
    if (!resp.ok) throw new Error(`Failed to load Tiled map: ${resp.status}`);
    const map: TiledMap = await resp.json();
    return this.build(map);
  }

  private build(map: TiledMap): FloorLayout {
    const allTiles: Tile[] = [];
    const TW = map.tilewidth;
    const TH = map.tileheight;

    const gidToKey = this.buildGidToKeyMap(map);

    // Parse rooms first — needed for tinting floor tiles + assigning desks
    const roomDefs = this.parseRooms(map, TW, TH);
    const deskSlotsByRoom = new Map<string, DeskSlot[]>();
    for (const name of roomDefs.keys()) deskSlotsByRoom.set(name, []);

    // Render tile layers
    for (const layer of map.layers) {
      if (layer.type !== "tilelayer") continue;
      const tileLayer = TILE_LAYER_MAP[layer.name];
      if (!tileLayer) continue;
      this.renderTileLayer(layer, tileLayer, gidToKey, roomDefs, allTiles);
    }

    // Render desk tile-objects + collect DeskSlot data
    const desksLayer = findObjectGroup(map, "desks");
    if (desksLayer) {
      for (const obj of desksLayer.objects) {
        if (obj.type !== "desk" || !obj.gid) continue;
        const tileKey = gidToKey.get(obj.gid);
        if (!tileKey) continue;

        // Tile objects in Tiled are anchored at bottom-left of their tile cell.
        const col = Math.round(obj.x / TW);
        const row = Math.round(obj.y / TH) - 1;
        const props = propMap(obj.properties);
        const facing = (props.facing as string | undefined) ?? "s";
        const deskType = tileKey.replace("tile/", "");

        const tile = new Tile(this.scene, {
          col, row,
          tileId: tileKey,
          layer: "furniture",
          originX: this.originX,
          originY: this.originY,
        });
        allTiles.push(tile);

        const roomName = findRoomForCell(roomDefs, col, row);
        if (roomName) {
          deskSlotsByRoom.get(roomName)?.push({
            id: obj.name,
            col, row,
            facing,
            type: deskType,
            occupantId: null,
          });
        }
      }
    }

    // Build DepartmentRoom objects with their accumulated slots
    const rooms = new Map<string, DepartmentRoom>();
    for (const [name, def] of roomDefs) {
      rooms.set(name, new DepartmentRoom(name, def.label, def.bounds, deskSlotsByRoom.get(name) ?? []));
    }

    return { tiles: allTiles, rooms, allTiles };
  }

  private buildGidToKeyMap(map: TiledMap): Map<number, string> {
    const m = new Map<number, string>();
    for (const ts of map.tilesets) {
      for (const tile of ts.tiles ?? []) {
        const key = propMap(tile.properties).key as string | undefined;
        if (key) m.set(ts.firstgid + tile.id, key);
      }
    }
    return m;
  }

  private parseRooms(map: TiledMap, TW: number, TH: number): Map<string, RoomDef> {
    const out = new Map<string, RoomDef>();
    const layer = findObjectGroup(map, "rooms");
    if (!layer) return out;
    for (const obj of layer.objects) {
      if (obj.type !== "room") continue;
      const colMin = Math.round(obj.x / TW);
      const rowMin = Math.round(obj.y / TH);
      const colMax = Math.round((obj.x + obj.width) / TW) - 1;
      const rowMax = Math.round((obj.y + obj.height) / TH) - 1;
      const props = propMap(obj.properties);
      const tintHex = props.tint as string | undefined;
      const tint = tintHex ? parseHexColor(tintHex) : null;
      const label = (props.label as string | undefined) ?? obj.name;
      out.set(obj.name, { bounds: { colMin, colMax, rowMin, rowMax }, tint, label });
    }
    return out;
  }

  private renderTileLayer(
    layer: TiledTileLayer,
    sceneLayer: TileLayer,
    gidToKey: Map<number, string>,
    roomDefs: Map<string, RoomDef>,
    out: Tile[],
  ): void {
    for (let i = 0; i < layer.data.length; i++) {
      const gid = layer.data[i];
      if (gid === 0) continue;
      const tileKey = gidToKey.get(gid);
      if (!tileKey) continue;
      const col = i % layer.width;
      const row = Math.floor(i / layer.width);
      const tile = new Tile(this.scene, {
        col, row,
        tileId: tileKey,
        layer: sceneLayer,
        originX: this.originX,
        originY: this.originY,
      });
      out.push(tile);

      if (sceneLayer === "floor") {
        const roomName = findRoomForCell(roomDefs, col, row);
        if (roomName) {
          const tint = roomDefs.get(roomName)?.tint;
          if (tint != null) tile.sprite.setTint(tint);
        }
      }
    }
  }
}

function findObjectGroup(map: TiledMap, name: string): TiledObjectGroup | null {
  for (const l of map.layers) {
    if (l.type === "objectgroup" && l.name === name) return l;
  }
  return null;
}

function findRoomForCell(rooms: Map<string, RoomDef>, col: number, row: number): string | null {
  for (const [name, def] of rooms) {
    const b = def.bounds;
    if (col >= b.colMin && col <= b.colMax && row >= b.rowMin && row <= b.rowMax) return name;
  }
  return null;
}

function propMap(props?: TiledProperty[]): Record<string, string | number | boolean> {
  const m: Record<string, string | number | boolean> = {};
  if (!props) return m;
  for (const p of props) m[p.name] = p.value;
  return m;
}

function parseHexColor(hex: string): number {
  let s = hex.trim();
  if (s.startsWith("#")) s = s.slice(1);
  else if (s.startsWith("0x") || s.startsWith("0X")) s = s.slice(2);
  // Tiled "color" type stores as #AARRGGBB; strip alpha if present
  if (s.length === 8) s = s.slice(2);
  return parseInt(s, 16);
}
