import { OWNED_VEHICLES } from "../data/vehicles";
import { searchRecords } from "./search";
import type { SearchRecord } from "../types";
export interface NomiePluginInstance {
  onLaunch?: (callback:()=>void|Promise<void>)=>void;
  onRegistered?: (callback:()=>void|Promise<void>)=>void;
  storage?: { init?:()=>Promise<void>; getItem?:(key:string)=>unknown; setItem?:(key:string,value:unknown)=>void };
  createNote?: (note:string|{note:string})=>Promise<unknown>;
  selectTrackable?: (type?:"tracker"|"context"|"person")=>Promise<unknown>;
  selectTrackables?: (type?:"tracker"|"context"|"person"|null,multiple?:boolean)=>Promise<unknown[]>;
  getTrackable?: (tag:string)=>Promise<unknown>;
  getTrackableInput?: (tag:string)=>Promise<unknown>;
  openNoteEditor?: (note:string|{note:string})=>Promise<unknown>;
  prefs?: {theme?:string};
}
declare global { interface Window { NomiePlugin?:new(details:Record<string,unknown>)=>NomiePluginInstance; } }
const metadata={
  id:"lifeos-manual-explorer",author:"LifeOS",
  name:"LifeOS Manual Explorer",emoji:"🛠️",
  description:"Browse factory service information, save procedures, and plan repairs.",
  uses:["createNote","onLaunch","selectTrackables","getTrackableInput"],version:"1.0.0",
  addToCaptureMenu:true,addToMoreMenu:true,addToWidgets:true
};
let instance:NomiePluginInstance|null=null;
export async function activate() {
  if(!window.NomiePlugin)return {supported:false,reason:"Nomie plugin SDK is not available in this host."};
  instance=new window.NomiePlugin(metadata);
  const plugin=instance;
  plugin.onRegistered?.(async()=>{
    await plugin.storage?.init?.();
    const widgets=plugin.storage?.getItem?.("widgets");
    const widgetList=Array.isArray(widgets)?widgets as Array<{widgetid?:string;name?:string;emoji?:string}>:[];
    if(!widgetList.some(widget=>widget.widgetid==="lifeos-manual-explorer")) {
      plugin.storage?.setItem?.("widgets",[
        ...widgetList,
        {widgetid:"lifeos-manual-explorer",name:"Manual Explorer",emoji:"🛠️",config:{view:"garage"}}
      ]);
    }
    plugin.storage?.setItem?.("lifeos-manual-explorer-version","1.0.0");
  });
  plugin.onLaunch?.(()=>window.dispatchEvent(new CustomEvent("lifeos:nomie-launch")));
  return {supported:true};
}
export function deactivate() { instance=null; }
export async function sync() {
  const statusResponse=await fetch("/api/auth/github/status");
  const status=await statusResponse.json() as {authenticated?:boolean};
  if(!status.authenticated) {
    const catalog=await fetch("/api/catalog").then(response=>response.json());
    return {synced:false,reason:"github-not-connected",catalog};
  }
  const local=await exportData();
  const remoteResponse=await fetch("/api/github/sync");
  if(!remoteResponse.ok)throw new Error("GitHub sync read failed: "+remoteResponse.status);
  const remote=await remoteResponse.json() as {data?:Record<string,unknown[]>};
  const merged:Record<string,unknown[]>={};
  for(const store of Object.keys(local)) {
    const map=new Map<string,unknown>();
    for(const record of (remote.data?.[store]||[])) {
      if(record&&typeof record==="object"&&"key" in record)map.set(String((record as {key:unknown}).key),record);
    }
    for(const record of (local[store]||[])) {
      if(record&&typeof record==="object"&&"key" in record)map.set(String((record as {key:unknown}).key),record);
    }
    merged[store]=[...map.values()];
  }
  await importData(merged);
  const write=await fetch("/api/github/sync",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({data:merged})});
  if(!write.ok) {
    const error=await write.json() as {error?:string};
    throw new Error(error.error||"GitHub sync write failed: "+write.status);
  }
  return write.json();
}
let nomieSearchCache:Promise<SearchRecord[]>|undefined;
async function loadNomieSearchRecords():Promise<SearchRecord[]> {
  if(!nomieSearchCache)nomieSearchCache=(async()=>{
    const db=await import("./db").then(module=>module.getDatabase());
    let cached:SearchRecord[]=[];
    try{cached=await db.getAll("searchRecords");}catch{/* offline browser storage may be unavailable */}
    if(cached.length)return cached.filter(record=>OWNED_VEHICLES.some(vehicle=>record.path.startsWith(vehicle.manualRoot)));
    const response=await fetch("/api/search-index");
    if(!response.ok)throw new Error("Search index is unavailable: "+response.status);
    const manifest=await response.json() as {shards?:Array<{key:string}>};
    const shards=await Promise.all((manifest.shards||[]).map(async shard=>{
      const file=shard.key.split("/").pop()||"";
      const result=await fetch("/api/search-index?file="+encodeURIComponent(file));
      if(!result.ok)throw new Error("Search shard unavailable: "+file);
      return result.json() as Promise<SearchRecord[]>;
    }));
    const records=shards.flat();
    try{
      const tx=db.transaction("searchRecords","readwrite");
      await tx.store.clear();
      for(let offset=0;offset<records.length;offset+=400)await Promise.all(records.slice(offset,offset+400).map(record=>tx.store.put(record,record.path)));
      await tx.done;
    }catch{/* Service Worker shard cache remains available for offline use */}
    return records.filter(record=>OWNED_VEHICLES.some(vehicle=>record.path.startsWith(vehicle.manualRoot)));
  })().catch(error=>{nomieSearchCache=undefined;throw error;});
  return nomieSearchCache;
}
export async function search(query:string) {
  return searchRecords(await loadNomieSearchRecords(),query);
}
export function openManual(vehicleId:string) {
  window.dispatchEvent(new CustomEvent("lifeos:open-manual",{detail:{vehicleId}}));
}
export function openPage(key:string) {
  window.dispatchEvent(new CustomEvent("lifeos:open-page",{detail:{key}}));
}
export async function selectRepairTracker() { return instance?.selectTrackable?.("tracker"); }
export async function selectRepairTrackers(multiple=true) { return instance?.selectTrackables?.("tracker",multiple); }
export async function getRepairTrackable(tag:string) { return instance?.getTrackable?.(tag); }
export async function getRepairTrackerInput(tag:string) { return instance?.getTrackableInput?.(tag); }
export async function openRepairNoteEditor(note:string) { return instance?.openNoteEditor?.(note); }
export async function logRepairEvent(note:string) {
  if(!instance?.createNote)throw new Error("Nomie is not connected");
  return instance.createNote(note);
}
export async function exportData() {
  const db=await import("./db").then(module=>module.getDatabase());
  const stores=["favorites","bookmarks","notes","recents","settings","repairCarts"] as const;
  const result:Record<string,unknown[]>={};
  for(const store of stores) {
    const keys=await db.getAllKeys(store),values=await db.getAll(store);
    result[store]=keys.map((key,index)=>({key,value:values[index]}));
  }
  return result;
}
export async function importData(data:Record<string,unknown>) {
  const db=await import("./db").then(module=>module.getDatabase());
  for(const store of ["favorites","bookmarks","notes","recents","settings","repairCarts"] as const) {
    const records=data[store];
    if(!Array.isArray(records))continue;
    const tx=db.transaction(store,"readwrite");
    for(const record of records) {
      if(record&&typeof record==="object"&&"key" in record&&"value" in record) {
        await tx.store.put((record as {value:never}).value,String((record as {key:unknown}).key));
      }
    }
    await tx.done;
  }
}