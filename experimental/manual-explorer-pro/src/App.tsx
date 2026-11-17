import { useEffect, useMemo, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { BookOpen, CarFront, ChevronRight, CloudOff, Download, Search, Star, Wrench, X, ShoppingCart, Github } from "lucide-react";
import { OWNED_VEHICLES } from "./data/vehicles";
import { proceduresForVehicle } from "./data/procedures";
import { cachePage, getDatabase, listFavorites, readCachedPage, saveFavorite, saveRecent } from "./lib/db";
import { searchRecords } from "./lib/search";
import { extractOemRows, type ExtractedOemRow } from "./lib/oem";
import { createCartLine, serializeShoppingList, validateCart, type ShoppingListFormat } from "./lib/cart";
import PartsSheet from "./components/PartsSheet";
import ProcedureSheet from "./components/ProcedureSheet";
import { extractProcedureFacts, type ProcedureFacts } from "./lib/procedure-extractor";
import type { ManualLink, SearchRecord, TreeNode, Vehicle, RepairCart, RepairCartLine } from "./types";
import { activate, sync as syncGitHub } from "./lib/nomie";

let searchIndexPromise: Promise<SearchRecord[]> | undefined;
async function loadAllSearchRecords(): Promise<SearchRecord[]> {
  if (!searchIndexPromise) searchIndexPromise = (async () => {
    const response = await fetch("/api/search-index");
    if (!response.ok) throw new Error("Search index is not available (" + response.status + ")");
    const manifest = await response.json() as { shards?: Array<{ key: string }> };
    const shards = await Promise.all((manifest.shards || []).map(async shard => {
      const file = shard.key.split("/").pop() || "";
      const result = await fetch("/api/search-index?file=" + encodeURIComponent(file));
      if (!result.ok) throw new Error("Search shard unavailable: " + file);
      return result.json() as Promise<SearchRecord[]>;
    }));
    return shards.flat().filter(row => OWNED_VEHICLES.some(vehicle => row.path.startsWith(vehicle.manualRoot)));
  })().catch(error => { searchIndexPromise = undefined; throw error; });
  return searchIndexPromise;
}

type Catalog = { vehicles: Vehicle[]; searchIndex: { available: boolean; documentCount: number } };
function flattenTree(nodes: TreeNode[], section: string, vehicle: Vehicle): ManualLink[] {
  const output: ManualLink[] = [];
  for (const node of nodes) {
    const label = node.n || node.title || "Untitled section";
    if (node.p != null) {
      const pageNumber = Number(node.p);
      if (Number.isInteger(pageNumber) && pageNumber > 0) output.push({
        title: label, key: vehicle.manualRoot + "pages/" + pageNumber + ".html", pageNumber, section
      });
    }
    if (node.c?.length) output.push(...flattenTree(node.c, label, vehicle));
  }
  return output;
}
function linksFromHtml(html: string, vehicle: Vehicle, section: string): ManualLink[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return [...doc.querySelectorAll<HTMLAnchorElement>("a[href]")].flatMap(anchor => {
    const href = anchor.getAttribute("href") || "";
    const match = href.match(/(?:^|\/)pages\/(\d+)\.html?(?:[?#].*)?$/i);
    if (!match) return [];
    const pageNumber = Number(match[1]);
    return [{ title: anchor.textContent?.trim() || "Page " + pageNumber, key: vehicle.manualRoot + "pages/" + pageNumber + ".html", pageNumber, section }];
  });
}
function getVariantWarning(html:string) {
  const text=new DOMParser().parseFromString(html,"text/html").body.textContent||"";
  const match=text.match(/WARNING:\\s*This page is about the [^.]*different variant\\/trim than selected\\./i);
  return match?.[0] || "";
}
async function getManualFile(key: string): Promise<string | TreeNode> {
  const response = await fetch("/api/manual-page?key=" + encodeURIComponent(key));
  if (!response.ok) throw new Error("Manual page request failed (" + response.status + ")");
  return response.headers.get("content-type")?.includes("json") ? response.json() : response.text();
}

export default function App() {
  const widgetIndex = new URLSearchParams(window.location.search).get("widgetindex");
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [vehicle, setVehicle] = useState<Vehicle>(OWNED_VEHICLES[0]);
  const [manualLinks, setManualLinks] = useState<ManualLink[]>([]);
  const [activeKey, setActiveKey] = useState("");
  const [activeTitle, setActiveTitle] = useState("");
  const [activeHtml, setActiveHtml] = useState("");
  const [oemRows, setOemRows] = useState<ExtractedOemRow[]>([]);
  const [variantWarning, setVariantWarning] = useState("");
  const [procedureFacts, setProcedureFacts] = useState<ProcedureFacts|null>(null);
  const [procedureOpen, setProcedureOpen] = useState(false);
  const readerFrame = useRef<HTMLIFrameElement>(null);
  const [partsOpen, setPartsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [records, setRecords] = useState<SearchRecord[]>([]);
  const [results, setResults] = useState<SearchRecord[]>([]);
  const [favorites, setFavorites] = useState<Array<{key:string;title:string;vehicleId:string}>>([]);
  const [cartItems, setCartItems] = useState<RepairCartLine[]>([]);
  const [cartLoaded, setCartLoaded] = useState(false);
  const [status, setStatus] = useState("Connecting to manual library…");
  const [view, setView] = useState<"home"|"library"|"procedures"|"search"|"saved"|"cart">("home");
  const [searchOpen, setSearchOpen] = useState(false);
  const [githubOpen, setGithubOpen] = useState(false);
  const [githubStatus, setGithubStatus] = useState<{authenticated:boolean;login?:string;canWrite?:boolean}>({authenticated:false});
  const [patToken, setPatToken] = useState("");
  const [patError, setPatError] = useState("");
  const [githubBusy, setGithubBusy] = useState(false);
  const [installationStatus, setInstallationStatus] = useState("");
  const [syncStatus, setSyncStatus] = useState("");
  const [offline, setOffline] = useState(!navigator.onLine);

  useEffect(() => {
    void activate();
    void listFavorites().then(setFavorites).catch(() => undefined);
    const online = () => setOffline(false), offlineEvent = () => setOffline(true);
    const manualListener = (event: Event) => {
      const detail = (event as CustomEvent<{vehicleId:string}>).detail;
      const found = OWNED_VEHICLES.find(item => item.id === detail.vehicleId);
      if (found) void selectVehicle(found);
    };
    window.addEventListener("online", online); window.addEventListener("offline", offlineEvent);
    window.addEventListener("lifeos:open-manual", manualListener);
    return () => {
      window.removeEventListener("online", online); window.removeEventListener("offline", offlineEvent);
      window.removeEventListener("lifeos:open-manual", manualListener);
    };
  }, []);

  useEffect(() => {
    void fetch("/api/auth/github/status").then(response => response.json()).then(setGithubStatus).catch(() => undefined);
  }, []);

  useEffect(() => {
    let cancelled=false;
    setCartLoaded(false);
    void getDatabase().then(db=>db.get("repairCarts",vehicle.id)).then(saved=>{
      if(cancelled)return;
      setCartItems(saved?[...saved.parts,...saved.tools]:[]);
      setCartLoaded(true);
    }).catch(()=>{if(!cancelled)setCartLoaded(true);});
    return()=>{cancelled=true;};
  }, [vehicle.id]);
  useEffect(() => {
    if(!cartLoaded)return;
    const cart:RepairCart={vehicleId:vehicle.id,procedureId:activeKey||"manual",parts:cartItems.filter(item=>item.relationship!=="tool"),tools:cartItems.filter(item=>item.relationship==="tool")};
    void getDatabase().then(db=>db.put("repairCarts",cart,vehicle.id)).catch(()=>undefined);
  }, [cartItems,vehicle.id,activeKey,cartLoaded]);

  useEffect(() => {
    void fetch("/api/catalog").then(async response => {
      if (!response.ok) throw new Error("Catalog service " + response.status);
      const data = await response.json() as Catalog;
      setCatalog(data); setStatus("Manual library connected");
      const db = await getDatabase();
      for (const item of data.vehicles) await db.put("vehicles", item, item.id);
    }).catch(() => setStatus("Offline mode · using saved manuals"));
  }, []);

  async function selectVehicle(next: Vehicle) {
    setCartLoaded(false); setVehicle(next); setView("library"); setActiveHtml(""); setActiveKey(""); setManualLinks([]); setOemRows([]); setVariantWarning(""); setProcedureFacts(null);
    try {
      if (next.treeKeys.length) {
        const trees = await Promise.all(next.treeKeys.map(key => getManualFile(key) as Promise<TreeNode>));
        setManualLinks(trees.flatMap(tree => flattenTree(tree.c || [], tree.title || "Factory manual", next)));
      } else {
        const index = await getManualFile(next.indexKey) as string;
        const entryPages = linksFromHtml(index, next, "Factory manual");
        const expanded = await Promise.all(entryPages.map(async link => {
          const html = await getManualFile(link.key) as string;
          return linksFromHtml(html, next, link.title);
        }));
        setManualLinks([...entryPages, ...expanded.flat()].filter((link, i, all) => all.findIndex(item => item.key === link.key) === i));
      }
    } catch { setStatus("Offline mode · previously cached pages remain available"); }
  }

  async function loadPage(key: string, title: string) {
    setActiveKey(key); setActiveTitle(title); setView("library");
    try {
      const html = await getManualFile(key) as string;
      setActiveHtml(html); setOemRows(extractOemRows(html, key)); setVariantWarning(getVariantWarning(html)); setProcedureFacts(extractProcedureFacts(html,key)); await cachePage(key, html, title); await saveRecent(key, title);
    } catch {
      const cached = await readCachedPage(key);
      if (cached) { setActiveHtml(cached.html); setOemRows(extractOemRows(cached.html, key)); setVariantWarning(getVariantWarning(cached.html)); setProcedureFacts(extractProcedureFacts(cached.html,key)); setStatus("Offline · showing cached factory page"); }
      else setActiveHtml("<main><h2>Page not available offline</h2><p>Open this page once while online to save it on this device.</p></main>");
    }
  }

  function handleReaderLoad() {
    try {
      const frame=readerFrame.current;
      const href=frame?.contentWindow?.location.href;
      if(!href)return;
      const key=new URL(href).searchParams.get("key");
      if(!key || !OWNED_VEHICLES.some(item=>key.startsWith(item.manualRoot)))return;
      const doc=frame?.contentDocument;
      const title=doc?.title || doc?.querySelector("h1")?.textContent?.trim() || key.split("/").pop() || "Manual page";
      setActiveKey(key);setActiveTitle(title);
      const html=doc?.documentElement?.outerHTML;
      if(html){setVariantWarning(getVariantWarning(html));setOemRows(extractOemRows(html,key));setProcedureFacts(extractProcedureFacts(html,key));void saveRecent(key,title);}
    } catch { /* sandboxed external navigation is intentionally ignored */ }
  }

  async function runSearch(value: string) {
    setQuery(value);
    if (!value.trim()) { setResults([]); return; }
    try {
      const all = records.length ? records : await loadAllSearchRecords();
      setRecords(all);
      setResults(searchRecords(all, value));
    } catch {
      setResults(searchRecords(records, value));
    }
  }

  const visibleLinks = useMemo(() => manualLinks.slice(0, 1000), [manualLinks]);
  const saved = favorites.some(item => item.key === activeKey);
  async function toggleFavorite() {
    if (!activeKey) return;
    const db = await getDatabase();
    if (saved) await db.delete("favorites", activeKey);
    else await saveFavorite(activeKey, activeTitle, vehicle.id);
    setFavorites(await listFavorites());
  }
  async function connectWithPat() {
    setGithubBusy(true); setPatError("");
    try {
      const response = await fetch("/api/auth/github/pat", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({token:patToken}) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "GitHub token validation failed");
      setGithubStatus({authenticated:true,login:data.login,canWrite:data.canWrite});
      setPatToken(""); setGithubOpen(false);
    } catch(error) { setPatError(error instanceof Error ? error.message : "Unable to connect GitHub"); }
    finally { setGithubBusy(false); }
  }
  async function testAppInstallation() {
    setInstallationStatus("Checking GitHub App installation…");
    try {
      const response = await fetch("/api/auth/github/installation");
      const data = await response.json();
      setInstallationStatus(data.installed ? "Installed · "+(data.permissions?.contents || "contents permission") : (data.error || "GitHub App is not configured"));
    } catch { setInstallationStatus("Unable to reach the GitHub App validation endpoint."); }
  }
  async function syncGitHubData() {
    setSyncStatus("Syncing…");
    try { await syncGitHub(); setSyncStatus("Synced to private repository"); }
    catch(error) { setSyncStatus(error instanceof Error ? error.message : "Sync failed"); }
  }
  async function disconnectGitHub() {
    await fetch("/api/auth/github/logout", {method:"POST"});
    setGithubStatus({authenticated:false});
  }
  async function downloadShoppingList(format:ShoppingListFormat) {
    const cart:RepairCart={vehicleId:vehicle.id,procedureId:activeKey||"manual",parts:cartItems.filter(item=>item.relationship!=="tool"),tools:cartItems.filter(item=>item.relationship==="tool")};
    const content=serializeShoppingList(vehicle,cart,format);
    const mime=format==="json"?"application/json":format==="csv"?"text/csv":format==="markdown"?"text/markdown":"text/plain";
    const url=URL.createObjectURL(new Blob([content],{type:mime}));
    const link=document.createElement("a");link.href=url;link.download="lifeos-repair-shopping-list."+format;link.click();URL.revokeObjectURL(url);
  }

  async function openSearchResult(result: SearchRecord) {
    const found = OWNED_VEHICLES.find(item => result.path.startsWith(item.manualRoot));
    if (!found) return;
    await selectVehicle(found); await loadPage(result.path, result.title); setSearchOpen(false);
  }

  function addOemPart(part: ExtractedOemRow) {
    setCartItems(old => [...old, {...createCartLine(part.partName,"required"),oem:part.partNumber}]);
    setPartsOpen(false);
  }

  if (widgetIndex) return <main className="nomie-widget">
    <div className="nomie-widget-head"><Wrench size={17}/><b>LifeOS Garage</b><span>Manuals</span></div>
    {view==="library" ? <><button className="widget-back" onClick={()=>setView("home")}>← Garage</button>
      {manualLinks.slice(0,6).map(link=><button key={link.key} onClick={()=>void loadPage(link.key,link.title)}><BookOpen size={16}/><span><b>{link.title}</b><small>Page {link.pageNumber}</small></span><ChevronRight size={14}/></button>)}
      {activeHtml&&<><p className="widget-active-title">{activeTitle}</p><iframe title={activeTitle} sandbox="allow-same-origin" srcDoc={activeHtml}/></>}
    </> : OWNED_VEHICLES.map(item=><button key={item.id} onClick={()=>void selectVehicle(item)}>
      <CarFront size={18}/><span><b>{item.year} {item.make} {item.model}</b><small>{item.engine} · Open manual</small></span><ChevronRight size={15}/>
    </button>)}
    <small className="nomie-widget-foot">{offline?"Offline cache":"Manual library"} · Local-first</small>
  </main>;

  return <div className="app-shell">
    <header className="topbar">
      <div className="brand-mark"><Wrench size={19}/><span>LifeOS <b>Manual Explorer</b></span></div>
      <div className="top-status">{offline ? <><CloudOff size={15}/> Offline</> : <><span className="pulse"/> {status}</>}</div>
      {githubStatus.authenticated ? <div className="github-actions"><span className="github-status"><Github size={15}/>{githubStatus.login} · {githubStatus.canWrite?"Write access":"Read only"}</span>{githubStatus.canWrite&&<button className="github-sync" onClick={()=>void syncGitHubData()}>Sync</button>}<button className="github-disconnect" onClick={()=>void disconnectGitHub()}>Disconnect</button></div> : <button className="github-connect" onClick={() => setGithubOpen(true)}><Github size={15}/> Connect GitHub</button>}
      {syncStatus&&<span className="sync-status">{syncStatus}</span>}
      <button className="search-button" onClick={() => setSearchOpen(true)}><Search size={17}/> Search manuals</button>
    </header>
    <div className="layout">
      <aside className="sidebar">
        <p className="eyebrow">WORKSPACE</p>
        {(["home","library","procedures","search","saved","cart"] as const).map(item => <button key={item} className={view===item?"nav-item active":"nav-item"} onClick={() => setView(item)}>
          {item==="home"?"⌂":item==="library"?"▤":item==="procedures"?"⚙":item==="search"?"⌕":item==="saved"?"☆":"▣"} <span>{item==="home"?"Overview":item==="library"?"Manuals":item==="procedures"?"Procedures":item==="search"?"Search":item==="saved"?"Favorites":"Repair cart"}</span>
        </button>)}
        <div className="sidebar-divider"/><p className="eyebrow">OWNED VEHICLES</p>
        {OWNED_VEHICLES.map(item => <button key={item.id} className={"vehicle-choice "+(vehicle.id===item.id?"selected":"")} onClick={() => void selectVehicle(item)}>
          <CarFront size={18}/><span><b>{item.year} {item.make} {item.model}</b><small>{item.engine}{item.eyesight?" · EyeSight":""}</small></span>
        </button>)}
        <div className="sidebar-foot">{catalog?.searchIndex?.documentCount?.toLocaleString() || "Index not verified"} indexed pages</div>
      </aside>
      <main className="content">
        {view==="home" && <section className="welcome">
          <p className="eyebrow">GARAGE / TECHNICAL KNOWLEDGE</p><h1>Your manuals.<br/><em>Your repair workspace.</em></h1>
          <p className="lede">Factory information, saved procedures, and repair planning for the vehicles you own.</p>
          <div className="vehicle-grid">{OWNED_VEHICLES.map(item => <button key={item.id} className="vehicle-card" onClick={() => void selectVehicle(item)}>
            <span className="card-kicker">OWNED VEHICLE</span><CarFront size={28}/><h2>{item.year} {item.make} {item.model}</h2><p>{item.engine} {item.drivetrain || ""} {item.eyesight?"· EyeSight":""}</p><span className="card-link">Open factory library <ChevronRight size={15}/></span>
          </button>)}</div>
        </section>}
        {view==="library" && <section className="library-view">
          <div className="section-heading"><div><p className="eyebrow">FACTORY SERVICE INFORMATION</p><h1>{vehicle.year} {vehicle.make} {vehicle.model}</h1><p>{vehicle.engine} · {vehicle.drivetrain || "Factory drivetrain"} {vehicle.eyesight?"· EyeSight":""}</p></div><button className="outline-button" onClick={() => setView("home")}>Garage</button></div>
          <div className="manual-columns"><section className="manual-list"><h2><BookOpen size={18}/> Manual contents <span>{manualLinks.length}</span></h2>
            {visibleLinks.map((link,index)=><button key={link.key} className={"manual-link "+(activeKey===link.key?"current":"")} onClick={()=>void loadPage(link.key,link.title)}>
              <span className="page-number">{String(index+1).padStart(2,"0")}</span><span><b>{link.title}</b><small>{link.section} · Page {link.pageNumber}</small></span><ChevronRight size={16}/>
            </button>)}
            {!visibleLinks.length&&<p className="empty">Loading factory contents or no navigation entries were found.</p>}
          </section><section className="reader">
            <div className="reader-head"><div><p className="eyebrow">MANUAL VIEWER</p><h2>{activeTitle||"Select a procedure"}</h2></div>{activeKey&&<div className="reader-actions"><button className="outline-button" onClick={()=>setProcedureOpen(true)} title="View extracted steps, torque and cautions"><Wrench size={15}/> Details</button><button className="outline-button" disabled={Boolean(variantWarning)} title={variantWarning||"View parts extracted from this source page"} onClick={()=>setPartsOpen(true)}><ShoppingCart size={15}/> Parts ({oemRows.length})</button><button className="icon-button" onClick={()=>void toggleFavorite()} aria-label="Toggle favorite"><Star size={18} fill={saved?"currentColor":"none"}/></button></div>}</div>
            {variantWarning&&<div className="variant-warning"><b>Vehicle variant warning</b><span>{variantWarning} Verify applicability to your Crosstrek Limited before using this information.</span></div>}{activeHtml?<iframe ref={readerFrame} onLoad={handleReaderLoad} title={activeTitle} className="manual-frame" sandbox="allow-same-origin" srcDoc={activeHtml}/>:<div className="reader-empty"><BookOpen size={34}/><p>Choose a factory manual page to open it here.</p></div>}
          </section></div>
        </section>}
        {view==="procedures" && <section><div className="section-heading"><div><p className="eyebrow">SOURCE-LINKED REPAIR KNOWLEDGE</p><h1>Procedure Library</h1><p>{vehicle.year} {vehicle.make} {vehicle.model} · {vehicle.engine}</p></div><button className="outline-button" onClick={()=>setView("home")}>Garage</button></div><div className="procedure-grid">{proceduresForVehicle(vehicle.id).map(procedure=><button className="procedure-card" key={procedure.id} onClick={()=>void loadPage(vehicle.manualRoot+procedure.sourcePages[0],procedure.title)}><span className="card-kicker">{procedure.system}</span><h3>{procedure.title}</h3><small>{procedure.sourcePages.length} source page{procedure.sourcePages.length===1?"":"s"} · {procedure.status}</small><div className="procedure-tags">{procedure.applicability==="confirm-trim"&&<span>Confirm trim</span>}{procedure.requiresCalibration&&<span>Calibration</span>}</div></button>)}</div>{!proceduresForVehicle(vehicle.id).length&&<p className="empty">No source-linked procedures are listed for this vehicle yet.</p>}</section>}
      {view==="search" && <section><p className="eyebrow">UNIVERSAL SEARCH</p><h1>Find a procedure</h1><input className="large-search" value={query} onChange={event=>void runSearch(event.target.value)} placeholder="water pump · fuel injector · vehicle:subaru"/><div className="result-list">{results.slice(0,100).map(result=><button key={result.path} onClick={()=>openSearchResult(result)}><b>{result.title}</b><small>{result.path}</small>{result.text.toLowerCase().includes("different variant/trim than selected")&&<em className="variant-flag">Variant applicability warning</em>}<p>{result.text.slice(0,180)}</p></button>)}</div>{query&&!results.length&&<p className="empty">No matching indexed pages. Search coverage depends on the published R2 index.</p>}</section>}
        {view==="saved" && <section><p className="eyebrow">YOUR LIBRARY</p><h1>Favorites</h1>{favorites.map(item=><button className="saved-row" key={item.key} onClick={async()=>{const found=OWNED_VEHICLES.find(v=>v.id===item.vehicleId);if(found)await selectVehicle(found);await loadPage(item.key,item.title);}}><Star size={17}/><span>{item.title}<small>{item.key}</small></span></button>)}{!favorites.length&&<p className="empty">Save a factory page with the star control to find it here.</p>}</section>}
        {view==="cart" && <section><p className="eyebrow">REPAIR WORKFLOW</p><h1>Repair cart</h1><p className="lede">Build a shopping list from a procedure. OEM numbers and prices are only shown when verified from a source.</p><div className="cart-add"><input id="part-name" placeholder="Part or tool name"/><button onClick={()=>{const input=document.querySelector<HTMLInputElement>("#part-name");if(input?.value.trim()){setCartItems(old=>[...old,createCartLine(input.value.trim())]);input.value=""}}}>Add item</button></div>{cartItems.map((item,index)=><div className="cart-row" key={item.id}><span>{item.name}<small>{item.oem?"OEM "+item.oem:"OEM not verified"} · {item.relationship}</small></span><button onClick={()=>setCartItems(old=>old.filter((_,i)=>i!==index))}>Remove</button></div>)}{cartItems.length>0&&<div className="cart-validation"><b>{validateCart({vehicleId:vehicle.id,procedureId:activeKey||"manual",parts:cartItems.filter(item=>item.relationship!=="tool"),tools:cartItems.filter(item=>item.relationship==="tool")},[],[]).warnings.length} verification warnings</b><small>Confirm OEM fitment and current vendor pricing before purchase.</small></div>}<div className="export-actions"><button onClick={()=>void downloadShoppingList("txt")} disabled={!cartItems.length}>TXT</button><button onClick={()=>void downloadShoppingList("csv")} disabled={!cartItems.length}>CSV</button><button onClick={()=>void downloadShoppingList("markdown")} disabled={!cartItems.length}>Markdown</button><button onClick={()=>void downloadShoppingList("json")} disabled={!cartItems.length}>JSON</button></div></section>}
      </main>
    </div>
    <Dialog.Root open={searchOpen} onOpenChange={setSearchOpen}><Dialog.Portal><Dialog.Overlay className="dialog-overlay"/><Dialog.Content className="search-dialog">
      <div className="dialog-head"><div><p className="eyebrow">UNIVERSAL SEARCH</p><Dialog.Title>Find a factory procedure</Dialog.Title></div><Dialog.Close className="icon-button" aria-label="Close search"><X/></Dialog.Close></div>
      <input autoFocus className="large-search" value={query} onChange={event=>void runSearch(event.target.value)} placeholder="water pump · section:engine · vehicle:scion"/>
      <div className="result-list">{results.slice(0,40).map(result=><button key={result.path} onClick={()=>openSearchResult(result)}><b>{result.title}</b><small>{result.path}</small></button>)}</div>
    </Dialog.Content></Dialog.Portal></Dialog.Root>
    <PartsSheet open={partsOpen} onOpenChange={setPartsOpen} parts={oemRows} onAdd={addOemPart}/>
    <ProcedureSheet open={procedureOpen} onOpenChange={setProcedureOpen} facts={procedureFacts}/>
    <Dialog.Root open={githubOpen} onOpenChange={setGithubOpen}><Dialog.Portal><Dialog.Overlay className="dialog-overlay"/><Dialog.Content className="search-dialog">
      <div className="dialog-head"><div><p className="eyebrow">OPTIONAL ACCOUNT CONNECTION</p><Dialog.Title>Connect GitHub</Dialog.Title></div><Dialog.Close className="icon-button" aria-label="Close GitHub connection"><X/></Dialog.Close></div>
      <p className="parts-caveat">Browsing manuals and using local favorites do not require an account. Connect GitHub only when you want to synchronize repair data with your private repository.</p>
      <a className="github-oauth-link" href="/api/auth/github/login"><Github size={17}/> Continue with GitHub App</a>
      <div className="pat-connect"><button className="outline-button" onClick={()=>void testAppInstallation()}>Test GitHub App installation</button>{installationStatus&&<p className="auth-status">{installationStatus}</p>}<label htmlFor="github-pat">Or use a fine-grained Personal Access Token</label><input id="github-pat" type="password" autoComplete="off" value={patToken} onChange={event=>setPatToken(event.target.value)} placeholder="github_pat_…"/><button className="primary-button" disabled={!patToken.trim()||githubBusy} onClick={()=>void connectWithPat()}>{githubBusy?"Checking…":"Validate token"}</button>{patError&&<p className="auth-error">{patError}</p>}</div>
    </Dialog.Content></Dialog.Portal></Dialog.Root>
    <footer className="footer"><span>LifeOS Manual Explorer Pro · MVP</span><span>{offline?"Offline cache":"R2 manual library"} · {catalog?.vehicles.length ?? 2} owned vehicles</span></footer>
  </div>;
}