import { openDB, type DBSchema } from "idb";
import type { RepairCart, SearchRecord, Vehicle } from "../types";
interface LifeOSDB extends DBSchema {
  manuals: { key: string; value: { key: string; title: string; updatedAt: number } };
  pages: { key: string; value: { key: string; html: string; title: string; cachedAt: number } };
  vehicles: { key: string; value: Vehicle };
  parts: { key: string; value: unknown };
  relationships: { key: string; value: unknown };
  favorites: { key: string; value: { key: string; title: string; vehicleId: string } };
  bookmarks: { key: string; value: { key: string; title: string; vehicleId: string } };
  notes: { key: string; value: { key: string; body: string; updatedAt: number } };
  recents: { key: string; value: { key: string; title: string; openedAt: number } };
  settings: { key: string; value: unknown };
  searches: { key: string; value: { query: string; searchedAt: number } };
  viewerState: { key: string; value: unknown };
  tocState: { key: string; value: unknown };
  repairCarts: { key: string; value: RepairCart };
  pricingCache: { key: string; value: unknown };
  github: { key: string; value: { connected: boolean; login?: string } };
  searchRecords: { key: string; value: SearchRecord };
}
let database: ReturnType<typeof openDB<LifeOSDB>> | undefined;
export function getDatabase() {
  if (!database) database = openDB<LifeOSDB>("lifeos_manuals", 1, {
    upgrade(db) {
      const stores: Array<keyof LifeOSDB> = [
        "manuals","pages","vehicles","parts","relationships","favorites","bookmarks","notes",
        "recents","settings","searches","viewerState","tocState","repairCarts","pricingCache","github","searchRecords"
      ];
      for (const store of stores) if (!db.objectStoreNames.contains(store)) db.createObjectStore(store);
    }
  });
  return database;
}
export async function cachePage(key: string, html: string, title: string) {
  const db = await getDatabase(); await db.put("pages", { key, html, title, cachedAt: Date.now() }, key);
}
export async function readCachedPage(key: string) { return (await getDatabase()).get("pages", key); }
export async function saveFavorite(key: string, title: string, vehicleId: string) {
  const db = await getDatabase(); await db.put("favorites", { key, title, vehicleId }, key);
}
export async function listFavorites() { return (await getDatabase()).getAll("favorites"); }
export async function saveRecent(key: string, title: string) {
  const db = await getDatabase(); await db.put("recents", { key, title, openedAt: Date.now() }, key);
}
export async function listRecents() { return (await getDatabase()).getAll("recents"); }