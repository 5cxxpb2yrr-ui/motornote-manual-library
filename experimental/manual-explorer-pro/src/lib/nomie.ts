export interface NomiePluginInstance {
  onLaunch?: (callback: () => void | Promise<void>) => void;
  onRegistered?: (callback: () => void | Promise<void>) => void;
  storage?: { init?: () => Promise<void>; getItem?: (key: string) => unknown; setItem?: (key: string, value: unknown) => void };
  createNote?: (note: string | { note: string }) => Promise<unknown>;
  selectTrackable?: (type?: "tracker" | "context" | "person") => Promise<unknown>;
  prefs?: { theme?: string };
}
declare global { interface Window { NomiePlugin?: new (details: Record<string, unknown>) => NomiePluginInstance; } }
const metadata = {
  name: "LifeOS Manual Explorer", emoji: "🛠️",
  description: "Browse factory service information, save procedures, and plan repairs.",
  uses: [], version: "1.0.0", addToCaptureMenu: true, addToMoreMenu: true, addToWidgets: true
};
let instance: NomiePluginInstance | null = null;
export async function activate() {
  if (!window.NomiePlugin) return { supported: false, reason: "Nomie plugin SDK is not available in this host." };
  instance = new window.NomiePlugin(metadata);
  await instance.storage?.init?.();
  instance.onLaunch?.(() => window.dispatchEvent(new CustomEvent("lifeos:nomie-launch")));
  instance.onRegistered?.(() => instance?.storage?.setItem?.("lifeos-manual-explorer-version", "1.0.0"));
  return { supported: true };
}
export function deactivate() { instance = null; }
export async function sync() {
  const response = await fetch("/api/catalog", { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error("Manual catalog sync failed: " + response.status);
  return response.json();
}
export async function search(query: string) {
  const response = await fetch("/api/search-index");
  if (!response.ok) throw new Error("Search index is unavailable: " + response.status);
  return { query, manifest: await response.json() };
}
export function openManual(vehicleId: string) {
  window.dispatchEvent(new CustomEvent("lifeos:open-manual", { detail: { vehicleId } }));
}
export function openPage(key: string) {
  window.dispatchEvent(new CustomEvent("lifeos:open-page", { detail: { key } }));
}
export async function exportData() {
  const db = await import("./db").then(module => module.getDatabase());
  const stores = ["favorites","bookmarks","notes","recents","settings","repairCarts"] as const;
  const result: Record<string, unknown[]> = {};
  for (const store of stores) result[store] = await db.getAll(store);
  return result;
}
export async function importData(data: Record<string, unknown>) {
  const db = await import("./db").then(module => module.getDatabase());
  for (const store of ["favorites","bookmarks","notes","settings","repairCarts"] as const) {
    const records = data[store];
    if (!Array.isArray(records)) continue;
    const tx = db.transaction(store, "readwrite");
    for (const record of records) {
      if (record && typeof record === "object" && "key" in record) {
        const key = (record as { key: IDBValidKey }).key;
        await tx.store.put(record as never, key);
      }
    }
    await tx.done;
  }
}