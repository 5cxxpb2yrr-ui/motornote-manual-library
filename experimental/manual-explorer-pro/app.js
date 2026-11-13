const $=s=>document.querySelector(s);const $$=s=>[...document.querySelectorAll(s)];
const docs=[{id:'engine-overview',title:'Engine Mechanical — Overview',kind:'General information · Service procedure'},{id:'engine-specs',title:'Engine Mechanical Specifications',kind:'Specifications · Reference'},{id:'engine-removal',title:'Engine Assembly — Removal',kind:'Repair procedure · 12 steps'},{id:'engine-install',title:'Engine Assembly — Installation',kind:'Repair procedure · 9 steps'}];
const vehicles={scion:'Scion xB Manuals',subaru:'Subaru Crosstrek Manuals',toyota:'Toyota Tacoma Manuals',ford:'Ford F-150 Manuals'};
const MANUAL_SITE='https://motornote-manual-library.phillipstg.workers.dev/';
let manualPageRequestId=0;
let searchGeneration=0;let indexPromise=null;
const saved=new Set((()=>{try{const value=JSON.parse(localStorage.getItem('mep-saved')||'[]');return Array.isArray(value)?value.filter(key=>typeof key==='string'&&key.split('|').length===3):[]}catch{return[]}})());
function announce(message){const toast=$('#toast');toast.textContent=message;toast.classList.add('show');setTimeout(()=>toast.classList.remove('show'),2100)}
function renderSaved(){ $('#savedCount').textContent=String(saved.size).padStart(2,'0');try{localStorage.setItem('mep-saved',JSON.stringify([...saved]))}catch{}}
function toggleSaved(kind){const key=kind+':'+docs[selected].id;if(saved.has(key))saved.delete(key);else saved.add(key);renderSaved();selectDoc(selected);announce(saved.has(key)?(kind==='favorite'?'Added to favorites':'Bookmark saved'):(kind==='favorite'?'Removed from favorites':'Bookmark removed'))}
// Factory section navigation is generated from the selected vehicle index.
function applyColorTheme(theme){
  const light=theme==='light';
  document.body.classList.toggle('light',light);
  document.documentElement.style.colorScheme=light?'light':'dark';
  const themeMeta=document.querySelector('meta[name="theme-color"]');
  if(themeMeta)themeMeta.setAttribute('content',light?'#f1f3f5':'#101820');
  const button=$('#themeButton');
  if(button){
    button.textContent=light?'☀':'☾';
    button.setAttribute('aria-label',light?'Switch to dark theme':'Switch to light theme');
    button.setAttribute('title',light?'Switch to dark theme':'Switch to light theme');
    button.setAttribute('aria-pressed',String(light));
  }
  try{localStorage.setItem('mep-theme',light?'light':'dark')}catch{}
}
let initialTheme='dark';try{if(localStorage.getItem('mep-theme')==='light')initialTheme='light'}catch{}applyColorTheme(initialTheme);
$('#themeButton').addEventListener('click',()=>{
  const next=document.body.classList.contains('light')?'dark':'light';
  applyColorTheme(next);
  announce(next==='light'?'Light theme enabled':'Dark theme enabled');
});
$('#searchOpen').addEventListener('click',()=>$('#searchDialog').showModal());$('#searchClose').addEventListener('click',()=>$('#searchDialog').close());

function openIndexDb(){return new Promise((resolve,reject)=>{const req=indexedDB.open('lifeos-manual-explorer',1);req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('index'))req.result.createObjectStore('index')};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
async function cachedGet(key){try{const db=await openIndexDb();return await new Promise((resolve,reject)=>{const tx=db.transaction('index','readonly');const req=tx.objectStore('index').get(key);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}catch{return null}}
async function cachedPut(key,value){try{const db=await openIndexDb();await new Promise((resolve,reject)=>{const tx=db.transaction('index','readwrite');tx.objectStore('index').put(value,key);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)})}catch{/* Search remains usable without local caching. */}}
async function cachedClear(){try{const db=await openIndexDb();await new Promise((resolve,reject)=>{const tx=db.transaction('index','readwrite');tx.objectStore('index').clear();tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)})}catch{/* Search remains usable without local caching. */}}
async function getJson(url){const response=await fetch(url,{headers:{Accept:'application/json'}});if(!response.ok)throw new Error('Search service returned '+response.status);return response.json()}
async function loadSearchIndex(){if(indexPromise)return indexPromise;indexPromise=(async()=>{const manifest=await getJson('/api/search-index');if(!manifest||!Array.isArray(manifest.shards))throw new Error('Search index manifest is invalid');const version=manifest.generatedAt||String(manifest.version||'v1');const cachedVersion=await cachedGet('__manifest_version');if(cachedVersion!==version){await cachedClear();await cachedPut('__manifest_version',version)}const count=$('#indexedPageTotal');if(count&&Number.isFinite(manifest.documentCount))count.textContent=manifest.documentCount.toLocaleString();const all=[];let cursor=0;async function worker(){while(cursor<manifest.shards.length){const item=manifest.shards[cursor++];const cacheKey=version+':'+item.key;let records=await cachedGet(cacheKey);if(!Array.isArray(records)){records=await getJson('/api/search-index?file='+encodeURIComponent(item.key.split('/').pop()));await cachedPut(cacheKey,records)}all.push(...records)}}await Promise.all(Array.from({length:Math.min(4,manifest.shards.length)},worker));return{manifest,records:all}})().catch(error=>{indexPromise=null;throw error});return indexPromise}
function safeText(tag,value,className){const node=document.createElement(tag);node.textContent=value||'';if(className)node.className=className;return node}
function renderSearchResults(matches,query){
  const results=$('#searchResults');results.replaceChildren();
  if(!matches.length){results.append(safeText('p','No pages contain all of those search terms. Try a shorter phrase or a different keyword.','empty-state'));return}
  for(const record of matches.slice(0,50)){
    const button=document.createElement('button');button.type='button';button.className='document-item search-result';
    const details=document.createElement('span');details.append(safeText('b',record.title||'Untitled procedure'));
    const excerpt=(record.text||'').replace(/\s+/g,' ').trim();
    const terms=query.toLowerCase().split(/\s+/).filter(Boolean);
    const lower=excerpt.toLowerCase(),phraseAt=lower.indexOf(query.toLowerCase()),firstAt=lower.indexOf(terms[0]||'');
    const at=phraseAt>=0?phraseAt:Math.max(0,firstAt);
    details.append(safeText('small',(record.manualId||'Manual')+' · '+excerpt.slice(Math.max(0,at-65),Math.max(0,at-65)+180)));
    button.append(safeText('span','▤','doc-icon'),details,safeText('span','›','doc-arrow'));
    button.addEventListener('click',()=>{
      const vehicles=liveCatalog?.manuals?.flatMap(manual=>manual.vehicles)||[];
      const vehicle=vehicles.find(item=>record.path.startsWith(item.id));
      const fileKey=record.path;
      if(!vehicle||!fileKey){announce('Could not match this result to a vehicle in the live catalog.');return}
      $('#searchDialog').close();
      openLiveSearchResult(vehicle,fileKey,record.title||fileKey.split('/').pop());
    });
    results.append(button);
  }
}
async function runManualSearch(value,generation){
  const query=value.trim(),results=$('#searchResults');
  if(!query){results.replaceChildren(safeText('p','Search across the indexed factory procedures.','empty-state'));return}
  results.replaceChildren(safeText('p','Searching the R2 manual index…','empty-state'));
  try{
    const {manifest,records}=await loadSearchIndex();
    if(generation!==searchGeneration)return;
    const terms=query.toLowerCase().split(/\s+/).filter(Boolean),phrase=query.toLowerCase();
    const matches=records.map(record=>{
      const title=(record.title||'').toLowerCase(),body=(record.text||'').toLowerCase(),combined=title+' '+body;
      if(!terms.every(term=>combined.includes(term)))return null;
      const titlePhrase=title.includes(phrase),bodyPhrase=body.includes(phrase);
      const titleHits=terms.filter(term=>title.includes(term)).length;
      return{record,score:(titlePhrase?100:0)+(bodyPhrase?60:0)+(titleHits*12)};
    }).filter(Boolean).sort((a,b)=>b.score-a.score||a.record.title.localeCompare(b.record.title)).map(item=>item.record);
    $('#searchTitle').textContent='Find a procedure · '+manifest.documentCount.toLocaleString()+' indexed pages';
    renderSearchResults(matches,query);
    $('#searchDialog .dialog-note').textContent='R2 INDEX · '+manifest.documentCount.toLocaleString()+' PAGES · RESULTS OPEN IN EXPLORER';
  }catch(error){
    if(generation!==searchGeneration)return;
    results.replaceChildren(safeText('p','Search is not available yet: '+error.message+'. Confirm this app is deployed with its R2 binding.','empty-state'));
  }
}
$('#globalSearch').addEventListener('input',e=>{const generation=++searchGeneration;runManualSearch(e.target.value,generation)});
$('#filterInput').addEventListener('input',e=>{const list=$('#documentList'),items=[...list.querySelectorAll('.document-item')],query=e.target.value.trim().toLowerCase();let visible=0;items.forEach(item=>{const match=!query||item.textContent.toLowerCase().includes(query);item.hidden=!match;if(match)visible++});let empty=list.querySelector('.filter-empty-state');if(query&&items.length&&!visible){if(!empty){empty=safeText('p','No factory pages match that filter. Try another term or clear the filter.','empty-state filter-empty-state');list.append(empty)}}else empty?.remove()});
$('#addVehicle').addEventListener('click',()=>announce('Vehicle profile creation is planned for the next prototype milestone.'));

renderSaved();


// Mobile navigation follows the five-tab LifeOS model. Secondary tools stay in drawers.
function refreshTocDrawer(){
  const source=$('#documentList');
  const target=$('#tocDrawerContent');
  if(!source||!target)return;
  // The middle panel's current drill-down level is the TOC. The manual-tree
  // is only a location summary, so cloning it produced an empty drawer.
  target.replaceChildren(source.cloneNode(true));
  const cloned=[...target.querySelectorAll('.document-item')];
  const originals=[...source.querySelectorAll('.document-item')];
  cloned.forEach((item,index)=>{
    item.addEventListener('click',()=>{
      originals[index]?.click();
      $('#tocDialog').close();
    });
  });
}
$('#tocOpen').addEventListener('click',()=>{refreshTocDrawer();$('#tocDialog').showModal()});
$('#tocClose').addEventListener('click',()=>$('#tocDialog').close());
$('#moreClose').addEventListener('click',()=>$('#moreDialog').close());
$('#moreNotes').addEventListener('click',()=>{ $('#moreDialog').close();announce('Vehicle notes are planned for the next milestone.');});
$('#moreMaintenance').addEventListener('click',()=>{ $('#moreDialog').close();announce('Maintenance tracking is planned for the next milestone.');});
$('#moreSync').addEventListener('click',()=>{ $('#moreDialog').close();announce('GitHub sync is a planned integration. Current preview is local-only.');});
$('#moreSettings').addEventListener('click',()=>{ $('#moreDialog').close();$('#themeButton').click();});
// Unified navigation handler below owns all mobile-tab actions.


// Screen-state controller for the canonical iPhone flow.
function setMobileView(view,title,hint){
  if(view!=='reader')manualPageRequestId++;
  document.body.dataset.mobileView=view;
  $$('[data-mobile]').forEach(button=>button.classList.toggle('active',button.dataset.mobile===view||(view==='library'&&button.dataset.mobile==='vehicles')||(view==='reader'&&button.dataset.mobile==='vehicles')));
  if(title)$('#mobileContextTitle').textContent=title;
  if(hint)$('#mobileContextHint').textContent=hint;
}
function renderFavorites(){
  const host=$('#favoritesList');if(!host)return;host.replaceChildren();
  if(!saved.size){host.append(safeText('p','No saved procedures yet. Open a manual page and use the star or bookmark control.','empty-state'));return}
  [...saved].forEach(key=>{
    const [kind,id]=key.split(':');const doc=docs.find(item=>item.id===id);if(!doc)return;
    const row=document.createElement('div');row.className='favorite-entry';
    const label=safeText('span',doc.title+' · '+(kind==='favorite'?'Favorite':'Bookmark'));
    const open=document.createElement('button');open.type='button';open.textContent='Open';
    open.addEventListener('click',()=>{const index=docs.findIndex(item=>item.id===id);selectDoc(index);setMobileView('reader','Manual viewer','Saved reference · 2006 Scion xB')});
    row.append(label,open);host.append(row);
  });
}
const originalRenderSaved=renderSaved;
renderSaved=function(){originalRenderSaved();renderFavorites()};
$$('[data-mobile]').forEach(button=>button.addEventListener('click',()=>{
  const tab=button.dataset.mobile;
  const menu=$('#mobileFabMenu'),toggle=$('#mobileFabToggle');
  if(menu)menu.hidden=true;
  if(toggle){toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-label','Open navigation');toggle.textContent='＋';}
  if(tab==='home')setMobileView('home','Your garage','Choose a vehicle or continue where you left off.');
  if(tab==='vehicles')setMobileView('vehicles','Vehicles','Choose a vehicle to browse its manuals.');
  if(tab==='favorites'){renderFavorites();setMobileView('favorites','Favorites','Your saved procedures and references.')}
}));
$('#mobileFabToggle')?.addEventListener('click',()=>{const menu=$('#mobileFabMenu'),toggle=$('#mobileFabToggle');if(!menu||!toggle)return;menu.hidden=!menu.hidden;toggle.setAttribute('aria-expanded',String(!menu.hidden));toggle.setAttribute('aria-label',menu.hidden?'Open navigation':'Close navigation');toggle.textContent=menu.hidden?'＋':'×';});
document.addEventListener('click',event=>{const fab=$('#mobileFab');if(fab&&!fab.contains(event.target)){const menu=$('#mobileFabMenu'),toggle=$('#mobileFabToggle');if(menu)menu.hidden=true;if(toggle){toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-label','Open navigation');toggle.textContent='＋';}}});
$$('[data-home-vehicle]').forEach(button=>button.addEventListener('click',()=>{
  setMobileView('vehicles','Vehicles','Choose a vehicle to browse its manuals.');
  const target=$('.vehicle-item[data-vehicle="'+button.dataset.homeVehicle+'"]');
  if(target)target.click();
}));
$('#homeAllVehicles').addEventListener('click',()=>setMobileView('vehicles','Vehicles','Choose a vehicle to browse its manuals.'));
$$('.vehicle-item').forEach(item=>item.addEventListener('click',()=>{
  const name=item.querySelector('b')?.textContent||'Selected vehicle';
  setMobileView('vehicles',name,'Choose a manual section below.');
  $('.vehicle-panel').classList.add('show-toc');
}));
$$('.tree-child,.tree-item').forEach(item=>item.addEventListener('click',()=>{
  setMobileView('library',$('#sectionTitle').textContent,'Manual pages in this section.');
}));
$$('.document-item').forEach((item,index)=>item.addEventListener('click',()=>{
  if(item.dataset.doc){setMobileView('reader',docs[index]?.title||'Manual viewer','2006 Scion xB · Factory manual reference')}
}));
// Recent manuals are opened through the History modal, not the removed dashboard card.
$('#tocOpen').addEventListener('click',()=>setMobileView('vehicles','Table of contents','Choose a manual section.'));
renderFavorites();
setMobileView('home','Your garage','Choose a vehicle or continue where you left off.');


// Live garage inventory: R2 remains the source of truth.
let liveCatalog = null;

function iconNode(name,className='ui-icon'){
  const paths={car:"<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M5 11 6.7 6.8A2 2 0 0 1 8.6 5.5h6.8a2 2 0 0 1 1.9 1.3L19 11l1.4 1.2c.4.3.6.8.6 1.3v4a1 1 0 0 1-1 1h-1.2a1.8 1.8 0 0 1-3.6 0H8.8a1.8 1.8 0 0 1-3.6 0H4a1 1 0 0 1-1-1v-4c0-.5.2-1 .6-1.3L5 11Z\"/><path d=\"M5 11h14M6 15h2m8 0h2\"/></svg>",engine:"<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M4 10h2l2-3h8l2 3h2v9h-3v-2H9v2H6v-4H4zM9 7V4h5v3m-4 4v3m4-3v3\"/></svg>",wrench:"<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M14.7 6.3a5 5 0 0 0-6.4 6.4L3.5 17.5a2.1 2.1 0 0 0 3 3l4.8-4.8a5 5 0 0 0 6.4-6.4l-3 3-3.4-3.4z\"/></svg>",zap:"<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"m13 2-9 12h7l-1 8 10-13h-7z\"/></svg>",brake:"<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><circle cx=\"12\" cy=\"12\" r=\"8.5\"/><circle cx=\"12\" cy=\"12\" r=\"3\"/><path d=\"M12 3.5v2m8.5 6.5h-2M12 20.5v-2M3.5 12h2\"/></svg>",gear:"<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"m10 2-.5 2.1a8 8 0 0 0-1.8 1L5.6 4.5 3.5 8l1.7 1.4a8 8 0 0 0 0 2.1L3.5 13l2.1 3.5 2.1-.6a8 8 0 0 0 1.8 1L10 19h4l.5-2.1a8 8 0 0 0 1.8-1l2.1.6 2.1-3.5-1.7-1.5a8 8 0 0 0 0-2.1L20.5 8l-2.1-3.5-2.1.6a8 8 0 0 0-1.8-1L14 2z\"/><circle cx=\"12\" cy=\"10.5\" r=\"3\"/></svg>",book:"<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21zM4 5.5v15.5m4-14h8m-8 4h8\"/></svg>"};
  const node=document.createElement('span');node.className=className;node.innerHTML=paths[name]||paths.book;return node;
}
function vehiclePhotoFor(vehicle){
  const key=(vehicle.make+' '+vehicle.name).toLowerCase();
  if(key.includes('scion')||key.includes('xb'))return 'https://commons.wikimedia.org/wiki/Special:FilePath/2006%20Scion%20xB.jpg?width=960';
  if(key.includes('subaru')||key.includes('crosstrek'))return 'https://www.autotrader.ca/editorial/media/119682/2018-subaru-crosstrek-01-jm.jpg?height=1080&v=1d2ee63d9ac0cb0&width=1920';
  return '';
}
function vehiclePhoto(vehicle,className){
  const wrap=document.createElement('span');wrap.className=className;
  const src=vehiclePhotoFor(vehicle);
  if(src){const img=document.createElement('img');img.src=src;img.alt=titleFromFolder(vehicle.name);img.loading='lazy';img.decoding='async';img.onerror=()=>{wrap.replaceChildren(iconNode('car','vehicle-fallback-icon'));};wrap.append(img);}
  else wrap.append(iconNode('car','vehicle-fallback-icon'));
  return wrap;
}
function sectionIcon(label){
 const value=label.toLowerCase();
 return value.includes('engine')? 'engine':value.includes('elect')||value.includes('wiring')||value.includes('diagnos')?'zap':value.includes('brake')?'brake':value.includes('transmission')?'gear':value.includes('cool')||value.includes('fuel')?'wrench':'book';
}

function titleFromFolder(value){
  return value.replace(/\s+/g,' ').replace(/\bL4-/g,'L4 ').trim();
}
function renderLiveGarage(catalog){
  liveCatalog=catalog;
  const allVehicles=catalog.manuals.flatMap(manual=>manual.vehicles.map(vehicle=>({...vehicle,manualId:manual.id,make:manual.make,fileCount:manual.fileCount})));
  $('#vehicleTotal').textContent=String(allVehicles.length).padStart(2,'0');
  $('#manualTotal').textContent=String(catalog.manualCount).padStart(2,'0');
  const status=$('#libraryStatus'); if(status) status.textContent='ONLINE';
  const connection=$('.connection'); if(connection) connection.textContent='R2 LIBRARY ONLINE';
  const list=$('#vehicleList');list.replaceChildren();
  const home=$('#homeVehicleGrid');home.replaceChildren();
  for(const vehicle of allVehicles){
    const label=titleFromFolder(vehicle.name);
    const item=document.createElement('button');item.type='button';item.className='vehicle-item';
    item.dataset.liveHref=vehicle.href;
    item.append(vehiclePhoto(vehicle,'vehicle-icon vehicle-photo'));
    const details=document.createElement('span');details.append(safeText('b',label),safeText('small',vehicle.make.toUpperCase()+' · '+vehicle.fileCount.toLocaleString()+' files'));
    item.append(details,safeText('span','›','chevron'));
    item.addEventListener('click',()=>openLiveVehicle(vehicle));
    list.append(item);

    const card=document.createElement('button');card.type='button';card.className='home-vehicle-card';
    card.append(vehiclePhoto(vehicle,'home-car-icon vehicle-photo'),safeText('b',label),safeText('small',vehicle.make.toUpperCase()+' · '+vehicle.fileCount.toLocaleString()+' files'),safeText('span','›','home-vehicle-chevron'));
    card.addEventListener('click',()=>openLiveVehicle(vehicle));
    home.append(card);
  }
  $('#vehicleManualTitle').textContent='R2 MANUAL LIBRARY';
  $('#homeAllVehicles').textContent='View all →';
  if(!allVehicles.length){
    list.replaceChildren(safeText('p','No vehicles are currently published in the manual catalog.','empty-state'));
    home.replaceChildren(safeText('p','No vehicles are currently published in the manual catalog.','empty-state'));
    const status=$('#libraryStatus');if(status)status.textContent='EMPTY';
    return;
  }
  announce('Loaded '+allVehicles.length+' vehicle entries from the R2 manual library.');
}
function openLiveVehicle(vehicle){
  const title=titleFromFolder(vehicle.name);
  selectedVehicle=vehicle;
  setMobileView('vehicles',title,'Factory source: '+vehicle.manualId);
  $$('.vehicle-item').forEach(item=>item.classList.toggle('selected',item.dataset.liveHref===vehicle.href));
  $('.vehicle-panel').classList.add('show-toc');
  announce('Selected '+title+'. Choose a manual section to continue.');
}
async function loadLiveGarage(){
  const host=$('#vehicleList');
  try{
    const response=await fetch('/api/catalog',{headers:{Accept:'application/json'}});
    if(!response.ok)throw new Error('Catalog request returned '+response.status);
    const catalog=await response.json();
    if(!Array.isArray(catalog.manuals))throw new Error('R2 catalog response is invalid');
    renderLiveGarage(catalog);
  }catch(error){
    const status=$('#libraryStatus'); if(status) status.textContent='OFFLINE';
    const connection=$('.connection'); if(connection) connection.textContent='R2 LIBRARY OFFLINE';
    const message='Unable to load the live R2 catalog. '+error.message;
    for(const target of [host,$('#homeVehicleGrid')]){
      if(!target)continue;
      target.replaceChildren(safeText('p',message,'empty-state'));
      const retry=document.createElement('button');retry.type='button';retry.className='subtle-button';retry.textContent='Retry catalog';
      retry.addEventListener('click',loadLiveGarage);target.append(retry);
    }
    announce('R2 vehicle catalog could not be loaded.');
  }
}
loadLiveGarage();


// Unified navigation: switch views in place; never scroll to a section as navigation.
let selectedVehicle = null;
function activateView(view){
  const normalized = view === 'dashboard' ? 'home' : view === 'saved' ? 'favorites' : view;
  if(normalized==='search'){
    $('#searchDialog').showModal();
    return;
  }
  if(normalized==='more'){
    $('#moreDialog').showModal();
    return;
  }
  if(normalized==='favorites')renderFavorites();
  if(normalized==='vehicles'){
    // Vehicles always means the vehicle picker, never a stale selected tree.
    selectedVehicle=null;
    activeLiveVehicle=null;
    activeLivePage=null;
    activeTocPath=[];
    liveManualTree=[];
    $('.vehicle-panel').classList.remove('show-toc');
    $('.manual-tree').replaceChildren();
  }
  const labels={home:['Your garage','Choose a vehicle or continue where you left off.'],vehicles:[selectedVehicle?titleFromFolder(selectedVehicle.name):'Vehicles','Choose a vehicle to browse its manuals.'],library:[$('#sectionTitle').textContent,'Manual pages in this section.'],reader:[$('#readerTitle').textContent,'Factory manual reference.'],favorites:['Favorites','Your saved procedures and references.']};
  const info=labels[normalized]||labels.home;
  setMobileView(normalized,info[0],info[1]);
  $$('.mobile-fab-menu [data-mobile]').forEach(button=>button.classList.toggle('active',button.dataset.mobile===normalized));
  $$('.rail-link').forEach(button=>button.classList.toggle('active',(button.dataset.view==='dashboard'?'home':button.dataset.view==='saved'?'favorites':button.dataset.view)===normalized));
}
$$('[data-view]').forEach(button=>button.addEventListener('click',()=>activateView(button.dataset.view)));
$$('[data-mobile]').forEach(button=>button.addEventListener('click',()=>activateView(button.dataset.mobile)));


// Real R2-backed manual navigation. The manual index is the source of its own TOC.
const MANUAL_API = '/api/manual-page?key=';
async function fetchManualHtml(key) {
  const response = await fetch(MANUAL_API + encodeURIComponent(key), { headers: { Accept: 'text/html' } });
  if (!response.ok) throw new Error('Manual page request returned ' + response.status);
  return response.text();
}
function manualKey(vehicle, relative) {
  return vehicle.id.replace(/\/$/, '') + '/' + relative.replace(/^\//, '');
}
function cleanManualFragment(html, key) {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  parsed.querySelectorAll('script, iframe, object, embed, form, button').forEach(node => node.remove());
  parsed.querySelectorAll('*').forEach(node => [...node.attributes].forEach(attr => {
    if (attr.name.toLowerCase().startsWith('on')) node.removeAttribute(attr.name);
  }));
  parsed.querySelectorAll('img').forEach(img => {
    const src = img.getAttribute('src');
    if (src) {
      const pageUrl = new URL(key.split('/').map(encodeURIComponent).join('/'), MANUAL_SITE);
      img.src = new URL(src, pageUrl).href;
    }
    img.loading = 'lazy';
    img.decoding = 'async';
    img.alt = img.alt || 'Factory manual illustration';
    // Source navigation glyphs live in /icons/ and must not inherit
    // full-width illustration sizing in the manual reader.
    try {
      if (new URL(img.src).pathname.toLowerCase().includes('/icons/')) {
        img.classList.add('manual-icon-asset');
      }
    } catch {}
  });
  parsed.querySelectorAll('a[href]').forEach(link => {
    const href = link.getAttribute('href') || '';
    if (/^(https?:|mailto:|javascript:)/i.test(href)) { link.removeAttribute('href'); return; }
    const resolved = new URL(href, 'https://manual.local/' + key);
    const match = resolved.pathname.match(/^(.*?)(?:pages\/(\d+)\.html)$/);
    if (match) {
      link.dataset.manualPage = match[2];
      link.removeAttribute('href');
      link.setAttribute('role','button');
      link.setAttribute('tabindex','0');
    } else link.removeAttribute('href');
  });
  const main = parsed.querySelector('.main') || parsed.body;
  return main ? main.innerHTML : '<p>Manual page content is empty.</p>';
}
async function showLiveManualPage(vehicle, pageId, title) {
  const requestId=++manualPageRequestId;
  activeLivePage=null;
  renderLivePagination();
  const key = manualKey(vehicle, 'pages/' + pageId + '.html');
  $('#readerTitle').textContent = title || 'Manual page ' + pageId;
  $('#readerContent').innerHTML = '<p class="empty-state">Loading factory manual page…</p>';
  // Reader is a focused mobile screen at every viewport width.
  setMobileView('reader', title || 'Manual viewer', titleFromFolder(vehicle.name));
  try {
    const html = await fetchManualHtml(key);
    if(requestId!==manualPageRequestId)return;
    $('#readerContent').innerHTML = cleanManualFragment(html, key);
    $('#readerContent').querySelectorAll('[data-manual-page]').forEach(link => {
      const open = async () => {
        const targetPageId=link.dataset.manualPage;
        const path=findTocPathForPage(liveManualTree,targetPageId);
        if(path){activeTocPath=path.slice(0,-1);renderHierarchicalToc();renderTocChildren(activeTocPath.at(-1)||null)}
        await showLiveManualPage(vehicle,targetPageId,link.textContent.trim());
      };
      link.addEventListener('click', open);
      link.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); } });
    });
    $('#readerContent').querySelectorAll('a').forEach(link => {
      if (!link.dataset.manualPage) link.removeAttribute('role');
    });
    $('#reader').focus({ preventScroll: true });
    announce('Loaded factory manual page: ' + (title || pageId));
  } catch (error) {
    if(requestId!==manualPageRequestId)return;
    const message=safeText('p','Unable to load this factory manual page. '+error.message,'empty-state');
    const retry=document.createElement('button');retry.type='button';retry.className='subtle-button';retry.textContent='Retry page load';
    retry.addEventListener('click',()=>showLiveManualPage(vehicle,pageId,title));
    $('#readerContent').replaceChildren(message,retry);
  }
}
let liveManualGroups = [];
let activeManualGroup = 0;
function renderManualGroups(vehicle) {
 const tree=$('.manual-tree');tree.replaceChildren();
 const heading=document.createElement('div');heading.className='manual-tree-heading';heading.textContent='FACTORY CONTENTS';tree.append(heading);
 liveManualGroups.forEach((group,index)=>{
  const button=document.createElement('button');button.type='button';button.className='tree-item'+(index===activeManualGroup?' active':'');
  button.setAttribute('aria-current',index===activeManualGroup?'page':'false');
  button.append(iconNode(sectionIcon(group.title),'tree-section-icon'));
  const label=document.createElement('span');label.className='tree-section-label';label.textContent=group.title;
  const count=document.createElement('small');count.className='tree-section-count';count.textContent=group.pages.length.toLocaleString();
  button.append(label,count);button.addEventListener('click',()=>selectManualGroup(index,vehicle));tree.append(button);
 });
}
function renderManualGroupPages(vehicle) {
 const group=liveManualGroups[activeManualGroup],list=$('#documentList');list.replaceChildren();
 if(!group||!group.pages.length){list.append(safeText('p','This factory section contains no linked pages.','empty-state'));return;}
 const fragment=document.createDocumentFragment();
 group.pages.forEach(page=>{
  const item=document.createElement('button');item.type='button';item.className='document-item';
  item.append(iconNode(sectionIcon(page.title),'doc-icon'));
  const details=document.createElement('span');details.append(safeText('b',page.title),safeText('small','Factory manual · Page '+page.pageId));
  item.append(details,safeText('span','›','doc-arrow'));item.addEventListener('click',()=>showLiveManualPage(vehicle,page.pageId,page.title));fragment.append(item);
 });
 list.append(fragment);$('#sectionTitle').textContent=group.title;
 $('#crumb').textContent=titleFromFolder(vehicle.name).toUpperCase()+' / '+group.title.toUpperCase();
 $('.list-footnote').textContent='LIVE R2 CONTENT · '+group.pages.length.toLocaleString()+' FACTORY PAGES';$('#filterInput').value='';
}
function selectManualGroup(index,vehicle) {
 if(index<0||index>=liveManualGroups.length)return;activeManualGroup=index;
 renderManualGroups(vehicle);renderManualGroupPages(vehicle);
 setMobileView('library',liveManualGroups[index].title,'Factory manual · '+liveManualGroups[index].pages.length+' pages');
}
async function loadLiveManualIndex(vehicle) {
 const key=manualKey(vehicle,'index.html');
 $('#documentList').replaceChildren(safeText('p','Loading the factory table of contents…','empty-state'));
 $('.manual-tree').replaceChildren(safeText('p','Reading factory section structure…','empty-state'));
 try {
  const html=await fetchManualHtml(key),parsed=new DOMParser().parseFromString(html,'text/html');
  const groups=[],byTitle=new Map();let current=null;
  const entries=[...parsed.querySelectorAll('h1,h2,h3,h4,h5,h6,a[href]')];
  for(const node of entries){
   if(/^H[1-6]$/.test(node.tagName)){
    const label=node.textContent.trim().replace(/\s+/g,' ');
    if(label&&!/^(home|contents|table of contents)$/i.test(label)){
     current=byTitle.get(label);
     if(!current){current={title:label,pages:[]};byTitle.set(label,current);groups.push(current);}
    }
    continue;
   }
   const match=(node.getAttribute('href')||'').match(/pages\/(\d+)\.html(?:$|[?#])/);
   if(!match)continue;
   const pageId=match[1],pageTitle=node.textContent.trim().replace(/\s+/g,' ')||'Manual page '+pageId;
   let group=current;
   if(!group){group=byTitle.get('Factory manual pages');if(!group){group={title:'Factory manual pages',pages:[]};byTitle.set(group.title,group);groups.push(group);}}
   if(!group.pages.some(page=>page.pageId===pageId))group.pages.push({pageId,title:pageTitle});
  }
  liveManualGroups=groups.filter(group=>group.pages.length);activeManualGroup=0;
  $('#vehicleManualTitle').textContent=titleFromFolder(vehicle.name);
  if(!liveManualGroups.length){
   $('.manual-tree').replaceChildren(safeText('p','No factory sections or page links were found in this vehicle index.','empty-state'));
   $('#documentList').replaceChildren(safeText('p','The factory index did not expose any linked manual pages.','empty-state'));
   $('#sectionTitle').textContent='No sections found';$('.list-footnote').textContent='LIVE R2 CONTENT · NO PAGE LINKS FOUND';return;
  }
  renderManualGroups(vehicle);renderManualGroupPages(vehicle);
  setMobileView('library',titleFromFolder(vehicle.name),'Choose a section from the factory table of contents.');
  announce('Loaded '+liveManualGroups.length+' factory sections and '+liveManualGroups.reduce((n,g)=>n+g.pages.length,0).toLocaleString()+' linked pages.');
 }catch(error){
  $('.manual-tree').replaceChildren(safeText('p','Unable to load factory sections. '+error.message,'empty-state'));
  $('#documentList').replaceChildren(safeText('p','Unable to load the factory table of contents. '+error.message,'empty-state'));
 }
}

openLiveVehicle = async function(vehicle) {
  selectedVehicle = vehicle;
  const title = titleFromFolder(vehicle.name);
  setMobileView('library',title,'Loading factory manual sections from R2.');
  $$('.vehicle-item').forEach(item=>item.classList.toggle('selected',item.dataset.liveHref===vehicle.href));
  $('.vehicle-panel').classList.add('show-toc');
  $('#vehicleManualTitle').textContent = title;
  await loadLiveManualIndex(vehicle);
};


// Manual Explorer usability fixes: make make-filters functional, allow backdrop
// dismissal, and keep reader navigation attached to the vehicle being viewed.
let activeManualFilter = 'all';
function applyManualFilter(make) {
  activeManualFilter = make;
  $$('.search-filters .filter-chip').forEach(chip => {
    const selected = (chip.dataset.manualFilter || 'all') === make;
    chip.classList.toggle('active', selected);
    chip.setAttribute('aria-pressed', String(selected));
  });
  const query = $('#globalSearch').value;
  const generation = ++searchGeneration;
  runManualSearch(query, generation);
}
$$('.search-filters .filter-chip').forEach((chip, index) => {
  const filter = ['all', 'scion', 'subaru'][index] || 'all';
  chip.dataset.manualFilter = filter;
  chip.type = 'button';
  chip.addEventListener('click', () => applyManualFilter(filter));
  chip.setAttribute('aria-pressed', String(filter === 'all'));
});

const previousRunManualSearch = runManualSearch;
runManualSearch = async function(value, generation) {
  const query = value.trim();
  if (!query) return previousRunManualSearch(value, generation);
  try {
    const { manifest, records } = await loadSearchIndex();
    if (generation !== searchGeneration) return;
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    const phrase = query.toLowerCase();
    const matches = records.filter(record => {
      const make = (record.manualId || '').toLowerCase();
      if (activeManualFilter !== 'all' && !make.includes(activeManualFilter)) return false;
      const title = (record.title || '').toLowerCase();
      const body = (record.text || '').toLowerCase();
      const combined = title + ' ' + body;
      return terms.every(term => combined.includes(term));
    }).map(record => {
      const title = (record.title || '').toLowerCase();
      const body = (record.text || '').toLowerCase();
      const titleHits = terms.filter(term => title.includes(term)).length;
      return { record, score: (title.includes(phrase) ? 100 : 0) + (body.includes(phrase) ? 60 : 0) + titleHits * 12 };
    }).sort((a,b) => b.score-a.score || a.record.title.localeCompare(b.record.title)).map(item => item.record);
    $('#searchTitle').textContent = 'Find a procedure · ' + manifest.documentCount.toLocaleString() + ' indexed pages';
    renderSearchResults(matches, query);
    $('#searchDialog .dialog-note').textContent = (activeManualFilter === 'all' ? 'ALL MANUALS' : activeManualFilter.toUpperCase()) + ' · R2 INDEX · ' + matches.length.toLocaleString() + ' MATCHING PAGES';
  } catch (error) {
    if (generation !== searchGeneration) return;
    $('#searchResults').replaceChildren(safeText('p','Search is not available yet: '+error.message,'empty-state'));
  }
};

// Native dialog backdrop clicks target the dialog element itself.
for (const dialog of [$('#searchDialog'), $('#tocDialog'), $('#moreDialog')]) {
  if (!dialog) continue;
  dialog.addEventListener('click', event => {
    if (event.target === dialog) dialog.close();
  });
}

// A result can be opened without first visiting the vehicle screen. Keep the
// selected vehicle in sync so Previous/Next work from search results too.
const showLiveManualPageWithVehicle = showLiveManualPage;
showLiveManualPage = async function(vehicle, pageId, title) {
  selectedVehicle = vehicle;
  return showLiveManualPageWithVehicle(vehicle, pageId, title);
};


// Dashboard search is the same universal search used throughout the app.
$('#dashboardSearch')?.addEventListener('click',()=>activateView('search'));


// Recent factory pages live in a dedicated History modal, not on the garage screen.
function readRecentHistory() {
  try {
    const value = JSON.parse(localStorage.getItem('mep-recent-history') || '[]');
    return Array.isArray(value) ? value.filter(item => item && item.vehicleId && item.pageId && item.title) : [];
  } catch { return []; }
}
function renderRecentManual() {
  const host = $('#recentManualList');
  const history = readRecentHistory();
  const count = $('#recentCount');
  if (count) count.textContent = String(history.length).padStart(2, '0');
  if (!host) return;
  host.replaceChildren();
  if (!history.length) {
    host.append(safeText('p', 'No factory pages opened yet. Open a manual page and it will appear here.', 'empty-state'));
    return;
  }
  history.forEach((recent, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'recent-history-item';
    button.append(safeText('span', '▤', 'recent-history-icon'));
    const details = document.createElement('span');
    details.append(safeText('b', recent.title), safeText('small', (recent.vehicleName || 'Vehicle') + ' · Factory page'));
    button.append(details, safeText('span', '›', 'recent-history-arrow'));
    button.addEventListener('click', () => {
      const vehicle = liveCatalog?.manuals?.flatMap(manual => manual.vehicles.map(item => ({...item, manualId: manual.id, make: manual.make})))
        .find(item => item.id === recent.vehicleId);
      if (!vehicle) {
        announce('This vehicle is not in the current live catalog.');
        return;
      }
      $('#historyDialog').close();
      openLiveSearchResult(vehicle, recent.pageId, recent.title);
    });
    host.append(button);
  });
}
function recordRecentManual(vehicle, pageId, title) {
  const recent = {
    vehicleId: vehicle.id,
    vehicleName: titleFromFolder(vehicle.name),
    pageId: String(pageId),
    title: title || 'Manual page ' + pageId
  };
  const history = readRecentHistory().filter(item => !(item.vehicleId === recent.vehicleId && item.pageId === recent.pageId));
  history.unshift(recent);
  try {
    localStorage.setItem('mep-recent-history', JSON.stringify(history.slice(0, 20)));
    localStorage.setItem('mep-recent-manual', JSON.stringify(recent));
  } catch {}
  renderRecentManual();
}
$('#historyOpen')?.addEventListener('click', () => {
  renderRecentManual();
  $('#historyDialog').showModal();
});
$('#historyClose')?.addEventListener('click', () => $('#historyDialog').close());
const legacyRecent = (() => { try { return JSON.parse(localStorage.getItem('mep-recent-manual') || 'null'); } catch { return null; } })();
if (legacyRecent?.vehicleId && legacyRecent?.pageId && legacyRecent?.title && !readRecentHistory().length) {
  try { localStorage.setItem('mep-recent-history', JSON.stringify([legacyRecent])); } catch {}
}
renderRecentManual();

// Do not present the sample procedure as if it were a factory page.
$('#readerTitle').textContent = 'Select a factory manual page';
$('#readerContent').replaceChildren(safeText('p', 'Choose a vehicle, open its factory table of contents, and select a page. Real manual content will appear here.', 'empty-state'));
const meta = $('.reader-meta');
if (meta) meta.replaceChildren(safeText('span', 'FACTORY MANUAL'), safeText('span', 'LIVE R2 CONTENT'));
const readerEyebrow = $('.reader-toolbar .eyebrow');
if (readerEyebrow) readerEyebrow.firstChild.textContent = 'FACTORY MANUAL ';
const footerLabel = $('.reader-footer span');
if (footerLabel) footerLabel.textContent = 'R2 FACTORY READER';

// More tolerant factory-index parser: handle linked lists, image-map areas,
// data-href navigation and relative numeric page links in older manual exports.
const previousLoadLiveManualIndex = loadLiveManualIndex;
loadLiveManualIndex = async function(vehicle) {
  const key = manualKey(vehicle, 'index.html');
  $('#documentList').replaceChildren(safeText('p', 'Loading the factory table of contents…', 'empty-state'));
  $('.manual-tree').replaceChildren(safeText('p', 'Reading factory section structure…', 'empty-state'));
  try {
    const html = await fetchManualHtml(key);
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    const groups = [];
    const byTitle = new Map();
    let current = null;
    const headingNodes = new Set(parsed.querySelectorAll('h1,h2,h3,h4,h5,h6,[role="heading"]'));
    const candidates = [...parsed.querySelectorAll('h1,h2,h3,h4,h5,h6,[role="heading"],a[href],area[href],[data-href],[data-url],[onclick]')];
    const pageLink = (node) => {
      const raw = node.getAttribute('href') || node.getAttribute('data-href') || node.getAttribute('data-url') || node.getAttribute('src') || node.getAttribute('onclick') || '';
      const decoded = raw;
      const match = decoded.match(/(?:^|[\\/])pages[\\/](\d+)\.html?(?:$|[?#'"\s])/i)
        || decoded.match(/(?:^|[\\/])(\d+)\.html?(?:$|[?#'"\s])/i);
      return match ? match[1] : null;
    };
    for (const node of candidates) {
      if (headingNodes.has(node)) {
        const label = node.textContent.trim().replace(/\s+/g, ' ');
        if (label && !/^(home|contents|table of contents)$/i.test(label)) {
          current = byTitle.get(label);
          if (!current) {
            current = { title: label, pages: [] };
            byTitle.set(label, current);
            groups.push(current);
          }
        }
        continue;
      }
      const pageId = pageLink(node);
      if (!pageId) continue;
      const pageTitle = (node.textContent || node.getAttribute('title') || node.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ') || 'Manual page ' + pageId;
      let group = current;
      if (!group) {
        group = byTitle.get('Factory manual pages');
        if (!group) {
          group = { title: 'Factory manual pages', pages: [] };
          byTitle.set(group.title, group);
          groups.push(group);
        }
      }
      if (!group.pages.some(page => page.pageId === pageId)) group.pages.push({ pageId, title: pageTitle });
    }
    liveManualGroups = groups.filter(group => group.pages.length);
    activeManualGroup = 0;
    $('#vehicleManualTitle').textContent = titleFromFolder(vehicle.name);
    if (!liveManualGroups.length) {
      const linkCount = parsed.querySelectorAll('a[href],area[href],[data-href],[data-url]').length;
      $('.manual-tree').replaceChildren(safeText('p', 'The factory index loaded, but no numbered page links were detected. Index links found: ' + linkCount + '. Check this manual’s index structure.', 'empty-state'));
      $('#documentList').replaceChildren(safeText('p', 'No factory page links were found in this vehicle index.', 'empty-state'));
      $('#sectionTitle').textContent = 'No pages detected';
      $('.list-footnote').textContent = 'R2 INDEX LOADED · NO NUMBERED PAGE LINKS DETECTED';
      announce('Factory index loaded, but its page-link format needs a parser adjustment.');
      return;
    }
    renderManualGroups(vehicle);
    renderManualGroupPages(vehicle);
    setMobileView('library', titleFromFolder(vehicle.name), 'Choose a section from the factory table of contents.');
    announce('Loaded ' + liveManualGroups.length + ' factory groups and ' + liveManualGroups.reduce((n, group) => n + group.pages.length, 0).toLocaleString() + ' linked pages.');
  } catch (error) {
    $('.manual-tree').replaceChildren(safeText('p', 'Unable to load factory sections. ' + error.message, 'empty-state'));
    $('#documentList').replaceChildren(safeText('p', 'Unable to load the factory table of contents. ' + error.message, 'empty-state'));
  }
};




// Reader preview controls: keep the page docked until the user expands it.
const readerActions = $('.reader-actions');
if (readerActions && !$('#expandReader')) {
  const expandButton = document.createElement('button');
  expandButton.type = 'button';
  expandButton.id = 'expandReader';
  expandButton.className = 'icon-button reader-expand-button';
  expandButton.textContent = '⤢';
  expandButton.setAttribute('aria-label', 'Expand manual reader');
  expandButton.setAttribute('aria-pressed', 'false');
  readerActions.append(expandButton);
  expandButton.addEventListener('click', () => {
    const expanded = document.body.classList.toggle('reader-expanded');
    expandButton.setAttribute('aria-pressed', String(expanded));
    expandButton.setAttribute('aria-label', expanded ? 'Return to page preview' : 'Expand manual reader');
    expandButton.textContent = expanded ? '⤡' : '⤢';
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && document.body.classList.contains('reader-expanded')) {
      document.body.classList.remove('reader-expanded');
      expandButton.setAttribute('aria-pressed', 'false');
      expandButton.setAttribute('aria-label', 'Expand manual reader');
      expandButton.textContent = '⤢';
    }
  });
}

// Desktop reader stays docked as the third workspace panel. Live pagination
// follows the selected vehicle's factory index rather than prototype records.
let activeLivePage = null;
let activeLiveVehicle = null;
const livePreviousButton = $('#previousDoc').cloneNode(true);
const liveNextButton = $('#nextDoc').cloneNode(true);
$('#previousDoc').replaceWith(livePreviousButton);
$('#nextDoc').replaceWith(liveNextButton);

function normalizeFactoryPageId(value) {
  const raw = String(value ?? '').trim();
  return raw.match(/(?:^|[\\/])pages[\\/](\d+)\.html?(?:$|[?#])/i)?.[1]
    || raw.match(/(?:^|[\\/])(\d+)\.html?(?:$|[?#])/i)?.[1]
    || raw.match(/^(\d+)$/)?.[1]
    || null;
}
function activeReaderPageSequence() {
  const pages = liveManualGroups[activeManualGroup]?.pages || [];
  const seen = new Set();
  return pages.filter(page => {
    const id = normalizeFactoryPageId(page?.pageId);
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}
function currentLivePageIndex() {
  const pages = activeReaderPageSequence();
  const activeId = normalizeFactoryPageId(activeLivePage?.pageId || activeLivePage?.file);
  return activeId ? pages.findIndex(page => normalizeFactoryPageId(page.pageId) === activeId) : -1;
}
function renderLivePagination() {
  const footer = $('.reader-footer');
  if (!footer) return;
  const pages = activeReaderPageSequence();
  const index = currentLivePageIndex();
  const previous = livePreviousButton;
  const next = liveNextButton;
  previous.disabled = !activeLiveVehicle || index <= 0;
  next.disabled = !activeLiveVehicle || index < 0 || index >= pages.length - 1;
  previous.title = previous.disabled ? 'No previous page in this section' : 'Previous: ' + pages[index - 1].title;
  next.title = next.disabled ? 'No next page in this section' : 'Next: ' + pages[index + 1].title;
  const status = footer.querySelector('.reader-page-status') || document.createElement('span');
  status.className = 'reader-page-status';
  const shortPageLabel = normalizeFactoryPageId(activeLivePage?.pageId || activeLivePage?.file)
    || String(activeLivePage?.file || activeLivePage?.pageId || '').split('/').pop().replace(/\.html?$/i, '');
  status.textContent = index >= 0
    ? 'FACTORY PAGE ' + shortPageLabel + ' · ' + (index + 1) + ' OF ' + pages.length
    : activeLivePage ? 'FACTORY PAGE ' + shortPageLabel : 'SELECT A FACTORY PAGE';
  status.setAttribute('title', activeLivePage?.title || 'Factory page position');
  const center = footer.querySelector('span');
  if (center && center !== status) center.replaceWith(status);
  else if (!center) footer.insertBefore(status, next);
}
async function navigateLivePage(offset) {
  const pages = activeReaderPageSequence();
  const index = currentLivePageIndex();
  const target = pages[index + offset];
  if (!activeLiveVehicle || !target || index < 0) return;
  await showLiveManualPage(activeLiveVehicle, target.pageId, target.title);
}
livePreviousButton.addEventListener('click', () => navigateLivePage(-1));
liveNextButton.addEventListener('click', () => navigateLivePage(1));

const showLiveManualPageWithDockedReader = showLiveManualPage;
showLiveManualPage = async function(vehicle, pageId, title) {
  activeLiveVehicle = vehicle;
  const pageLoad=showLiveManualPageWithDockedReader(vehicle, pageId, title);
  const requestId=manualPageRequestId;
  await pageLoad;
  if(requestId!==manualPageRequestId)return;
  const content = $('#readerContent');
  if (content && !content.querySelector('.empty-state')) {
    activeLivePage = { pageId: String(pageId), title: title || 'Manual page ' + pageId };
    $$('.document-item').forEach(item => item.classList.toggle('selected', item.querySelector('small')?.textContent.includes('Page ' + pageId) || false));
    $('#readerTitle').textContent = activeLivePage.title;
    renderLivePagination();
  }
};

// The desktop overview retains its vehicle tree and page list while the reader
// occupies the right-hand panel. Mobile continues to use its focused reader view.
renderLivePagination();


// Factory TOC drill-down: preserve the source hierarchy, show one level at a time.
let liveManualTree = [];
let activeTocPath = [];
let tocLoadRequestId = 0;
let tocExpandRequestId = 0;

function tocPageId(href='') {
  return href.match(/(?:^|[\/])pages[\/](\d+)\.html?(?:$|[?#])/i)?.[1]
    || href.match(/(?:^|[\/])(\d+)\.html?(?:$|[?#])/i)?.[1] || null;
}
function tocNodeFromLi(li) {
  const nested = [...li.children].filter(el => /^(UL|OL)$/i.test(el.tagName));
  const own = li.cloneNode(true);
  own.querySelectorAll('ul,ol').forEach(el => el.remove());
  const ownLink = own.querySelector('a[href],[data-href],[data-url]');
  const rawHref = ownLink?.getAttribute('href') || ownLink?.getAttribute('data-href') || ownLink?.getAttribute('data-url') || '';
  const asset = own.querySelector('img[src],a[href$=".svg"],img[src$=".svg"]');
  const assetUrl = asset?.getAttribute('src') || (asset?.tagName === 'A' ? asset.getAttribute('href') : null);
  const label = (own.textContent || ownLink?.getAttribute('title') || '').replace(/\s+/g,' ').trim();
  const node = { id:'toc-'+Math.random().toString(36).slice(2), title:label || 'Untitled section', pageId:tocPageId(rawHref), assetUrl, children:[] };
  nested.forEach(list => [...list.children].filter(el => el.tagName === 'LI').forEach(child => node.children.push(tocNodeFromLi(child))));
  return node;
}
function buildHierarchicalToc(parsed) {
  const roots = [];
  const topLists = [...parsed.querySelectorAll('ul,ol')].filter(list => !list.parentElement.closest('li'));
  topLists.forEach(list => {
    [...list.children].filter(el => el.tagName === 'LI').forEach(li => roots.push(tocNodeFromLi(li)));
  });
  if (roots.length) return roots;
  const stack = [{level:0,node:{title:'Factory manual',children:[]}}];
  [...parsed.querySelectorAll('h1,h2,h3,h4,h5,h6,a[href],area[href],[data-href],[data-url]')].forEach(el => {
    const heading = /^H[1-6]$/.test(el.tagName);
    if (heading) {
      const level=Number(el.tagName.slice(1)), title=el.textContent.replace(/\s+/g,' ').trim();
      if (!title || /^(home|contents|table of contents)$/i.test(title)) return;
      const node={title,children:[],pageId:null,assetUrl:null};
      while(stack.length>1 && stack[stack.length-1].level>=level) stack.pop();
      stack[stack.length-1].node.children.push(node);stack.push({level,node});
    } else {
      const href=el.getAttribute('href')||el.getAttribute('data-href')||el.getAttribute('data-url')||'';
      const pageId=tocPageId(href);
      const assetUrl=/\.svg(?:$|[?#])/i.test(href)?href:null;
      if(!pageId&&!assetUrl)return;
      const title=(el.textContent||el.getAttribute('title')||el.getAttribute('aria-label')||'').replace(/\s+/g,' ').trim()|| (pageId?'Manual page '+pageId:'Illustration');
      stack[stack.length-1].node.children.push({title,pageId,assetUrl,children:[]});
    }
  });
  return stack[0].node.children;
}
async function hydrateTocNode(node,vehicle){
  if(!node || node.children?.length || !node.pageId) return node;
  const html=await fetchManualHtml(manualKey(vehicle,'pages/'+node.pageId+'.html'));
  const parsed=new DOMParser().parseFromString(html,'text/html');
  const children=buildHierarchicalToc(parsed).filter(child=>String(child.pageId||'')!==String(node.pageId));
  if(children.length) node.children=children;
  return node;
}
function tocLeafPages(node,out=[]) {
  if(node?.pageId) out.push({pageId:String(node.pageId),title:node.title});
  (node?.children||[]).forEach(child=>tocLeafPages(child,out));
  return out;
}
function findTocPathForPage(nodes,pageId,path=[]) {
  for(const node of nodes||[]){
    const next=[...path,node];
    if(String(node.pageId||'')===String(pageId))return next;
    const found=findTocPathForPage(node.children,pageId,next);
    if(found)return found;
  }
  return null;
}
function ensureTocDrilldownControls() {
  const host=$('.manual-tree');
  if(!host)return;
  let back=$('#tocBackButton');
  if(!back){
    back=document.createElement('button');
    back.type='button';back.id='tocBackButton';back.className='toc-back-button';
    back.textContent='← Back';back.hidden=true;
    const heading=$('.manual-tree-heading');
    if(heading)heading.insertBefore(back,heading.firstChild);
  }
  if(!back.dataset.bound){
    back.dataset.bound='true';
    back.addEventListener('click',()=>{
      if(!activeTocPath.length){
        // At the vehicle's root, Back returns to the vehicle picker so another
        // manual can be selected; do not leave the old tree overlay active.
        selectedVehicle=null;
        activeLiveVehicle=null;
        activeLivePage=null;
        liveManualTree=[];
        activeTocPath=[];
        $('.vehicle-panel').classList.remove('show-toc');
        $('.manual-tree').replaceChildren();
        $('#documentList').replaceChildren(safeText('p','Choose a vehicle to browse its factory manual.','empty-state'));
        setMobileView('vehicles','Vehicles','Choose a vehicle to browse its manuals.');
        return;
      }
      activeTocPath=activeTocPath.slice(0,-1);
      const parent=activeTocPath.at(-1)||null;
      renderHierarchicalToc();
      renderTocChildren(parent);
      setMobileView('vehicles',parent?.title||titleFromFolder(selectedVehicle.name),'Choose a manual section.');
    });
  }
  let crumbs=$('#tocBreadcrumbs');
  if(!crumbs){
    crumbs=document.createElement('nav');crumbs.id='tocBreadcrumbs';crumbs.className='toc-breadcrumbs';
    crumbs.setAttribute('aria-label','Manual location');
    host.append(crumbs);
  }
}
function renderHierarchicalToc() {
  ensureTocDrilldownControls();
  const vehicleName=selectedVehicle?titleFromFolder(selectedVehicle.name):'Factory manual';
  const host=$('.manual-tree');
  const crumbs=$('#tocBreadcrumbs');
  const back=$('#tocBackButton');
  if(back)back.hidden=!selectedVehicle;
  if(crumbs){
    crumbs.replaceChildren();
    const root=document.createElement('button');root.type='button';root.className='toc-crumb-button';root.textContent=vehicleName;
    root.addEventListener('click',()=>{activeTocPath=[];renderHierarchicalToc();renderTocChildren(null);});
    crumbs.append(root);
    activeTocPath.forEach((node,index)=>{
      crumbs.append(safeText('span','/','toc-crumb-separator'));
      const item=document.createElement('button');item.type='button';item.className='toc-crumb-button';item.textContent=node.title;
      item.addEventListener('click',()=>{activeTocPath=activeTocPath.slice(0,index+1);renderHierarchicalToc();renderTocChildren(node);});
      crumbs.append(item);
    });
  }
  if(!host)return;
  [...host.querySelectorAll('.toc-menu-entry,.manual-tree-heading')].forEach(el=>el.remove());
  const current=activeTocPath.at(-1)||null;
  const children=current?.children||liveManualTree||[];
  host.append(safeText('div',current?.title||vehicleName,'manual-tree-heading'));
  children.forEach(node=>{
    const item=document.createElement('button');item.type='button';item.className='tree-item toc-menu-entry';
    item.append(iconNode(sectionIcon(node.title),'tree-section-icon'),safeText('span',node.title,'tree-section-label'));
    item.append(safeText('span',node.children?.length?'›':node.pageId?'↗':'›','tree-menu-arrow'));
    item.addEventListener('click',()=>openTocNode(node));
    host.append(item);
  });
}
async function openTocNode(node) {
  if(!node)return;
  if(node.pageId&&!node.children?.length&&selectedVehicle){
    showLiveManualPage(selectedVehicle,node.pageId,node.title);
    return;
  }
  if(node.children?.length){
    activeTocPath=[...activeTocPath,node];
  } else {
    activeTocPath=[...activeTocPath,node];
  }
  renderHierarchicalToc();
  renderTocChildren(node);
  // Portrait is a drill-down flow: folders stay in the TOC screen;
  // terminal folders advance to their page list. Landscape shows both panes.
  const hasSubfolders=(node.children||[]).some(child=>Array.isArray(child.children)&&child.children.length>0);
  setMobileView(hasSubfolders?'vehicles':'library',node.title,
    hasSubfolders?'Choose a subsection.':'Choose a factory page from this section.');
  if(window.matchMedia('(orientation:landscape) and (max-height:600px)').matches){
    document.querySelector('.document-panel .document-list')?.scrollTo({top:0,behavior:'smooth'});
  }
}
function renderReaderBreadcrumbs() {
  const host=$('#crumb');
  if(!host || !selectedVehicle)return;
  host.replaceChildren();
  const vehicleLabel=titleFromFolder(selectedVehicle.name);
  const segments=[{label:vehicleLabel,path:[]}];
  activeTocPath.forEach((node,index)=>segments.push({
    label:node.title,
    path:activeTocPath.slice(0,index+1)
  }));
  segments.forEach((segment,index)=>{
    if(index)host.append(safeText('span',' / ','reader-crumb-separator'));
    const button=document.createElement('button');
    button.type='button';
    button.className='reader-crumb-button';
    button.textContent=segment.label;
    if(index===segments.length-1)button.setAttribute('aria-current','location');
    button.addEventListener('click',()=>{
      activeTocPath=segment.path.slice();
      const target=activeTocPath.at(-1)||null;
      renderHierarchicalToc();
      renderTocChildren(target);
      const children=target?.children||liveManualTree||[];
      const hasSubfolders=children.some(child=>Array.isArray(child.children)&&child.children.length>0);
      setMobileView(target&&!hasSubfolders?'library':'vehicles',
        target?.title||vehicleLabel,
        target?'Choose a factory page from this section.':'Choose a factory manual section.');
      restoreNavigationHighlight();
    });
    host.append(button);
  });
}
function renderTocChildren(node) {
  const list=$('#documentList');
  if(!list)return;
  const pages=tocLeafPages(node||{children:liveManualTree});
  list.replaceChildren();
  if(!pages.length){
    list.append(safeText('p','Choose a section in the left panel to see its factory pages here.','empty-state'));
  } else {
    pages.forEach(page=>{
      const item=document.createElement('button');item.type='button';item.className='document-item';
      item.append(iconNode('book','doc-icon'));
      const details=document.createElement('span');
      details.append(safeText('b',page.title),safeText('small','Factory page '+page.pageId));
      item.append(details,safeText('span','›','doc-arrow'));
      item.addEventListener('click',()=>showLiveManualPage(selectedVehicle,page.pageId,page.title));
      list.append(item);
    });
  }
  const title=node?.title||'Factory contents';
  $('#sectionTitle').textContent=title+' · Pages';
  renderReaderBreadcrumbs();
  liveManualGroups=[{title,pages}];
  activeManualGroup=0;
  $('.list-footnote').textContent='FACTORY PAGES · '+pages.length.toLocaleString()+' PAGES IN THIS SECTION';
  $('#filterInput').value='';
  renderLivePagination();
}
loadLiveManualIndex = async function(vehicle) {
  const requestId=++tocLoadRequestId;
  selectedVehicle=vehicle;
  activeTocPath=[];
  activeLiveVehicle=vehicle;
  activeLivePage=null;
  liveManualGroups=[];activeManualGroup=0;
  renderLivePagination();
  $('#documentList').replaceChildren(safeText('p','Loading the factory contents…','empty-state'));
  $('.manual-tree').replaceChildren(safeText('p','Reading original factory hierarchy…','empty-state'));
  try{
    const html=await fetchManualHtml(manualKey(vehicle,'index.html'));
    if(requestId!==tocLoadRequestId || selectedVehicle?.id!==vehicle.id)return;
    const parsed=new DOMParser().parseFromString(html,'text/html');
    liveManualTree=buildHierarchicalToc(parsed);
    if(liveManualTree.length===1 && !liveManualTree[0].children?.length)await hydrateTocNode(liveManualTree[0],vehicle);
    if(requestId!==tocLoadRequestId || selectedVehicle?.id!==vehicle.id)return;
    if(!liveManualTree.length)throw new Error('No factory sections or page links were found.');
    renderHierarchicalToc();
    renderTocChildren(null);
    setMobileView('vehicles',titleFromFolder(vehicle.name),'Choose a factory section to continue.');
    const count=liveManualTree.reduce((total,node)=>total+tocLeafPages(node).length,0);
    announce('Loaded factory contents with '+count.toLocaleString()+' linked pages.');
  }catch(error){
    if(requestId!==tocLoadRequestId || selectedVehicle?.id!==vehicle.id)return;
    $('.manual-tree').replaceChildren(safeText('p','Unable to read the factory contents. '+error.message,'empty-state'));
    $('#documentList').replaceChildren(safeText('p','The factory index could not be parsed. '+error.message,'empty-state'));
  }
}
openLiveVehicle = async function(vehicle) {
  selectedVehicle=vehicle;
  activeTocPath=[];
  activeLiveVehicle=vehicle;
  activeLivePage=null;
  const title=titleFromFolder(vehicle.name);
  setMobileView('vehicles',title,'Loading factory contents from R2.');
  $$('.vehicle-item').forEach(item=>item.classList.toggle('selected',item.dataset.liveHref===vehicle.href));
  $('.vehicle-panel').classList.add('show-toc');
  $('#vehicleManualTitle').textContent=title;
  await loadLiveManualIndex(vehicle);
};
async function openLiveSearchResult(vehicle,pageId,title) {
  await openLiveVehicle(vehicle);
  if(selectedVehicle?.id!==vehicle.id)return;
  const path=findTocPathForPage(liveManualTree,pageId);
  if(path){
    activeTocPath=path.slice(0,-1);
    renderHierarchicalToc();
    renderTocChildren(activeTocPath.at(-1)||null);
  }
  showLiveManualPage(vehicle,pageId,title);
}


// Navigation audit fixes: explicit reader return, real-page favorites, and wired controls.
(function installNavigationAuditFixes(){
  const byId=id=>document.getElementById(id);
  const searchDialog=byId('searchDialog');
  const globalSearch=byId('globalSearch');
  let viewBeforeSearch=document.body.dataset.mobileView||'home';
  function restoreNavigationHighlight(){
    const view=document.body.dataset.mobileView||'home';
    const mobileView=(view==='library'||view==='reader')?'vehicles':view;
    document.querySelectorAll('.mobile-fab-menu [data-mobile]').forEach(button=>button.classList.toggle('active',button.dataset.mobile===mobileView));
    const railView=view==='reader'?'library':view;
    document.querySelectorAll('.rail-link[data-view]').forEach(button=>{
      const key=button.dataset.view==='dashboard'?'home':button.dataset.view==='saved'?'favorites':button.dataset.view;
      button.classList.toggle('active',key===railView);
    });
  }
  function openSearch(){
    if(!searchDialog)return;
    manualPageRequestId++;
    viewBeforeSearch=document.body.dataset.mobileView||'home';
    if(!searchDialog.open)searchDialog.showModal();
    restoreNavigationHighlight();
    document.querySelectorAll('.mobile-fab-menu [data-mobile]').forEach(button=>button.classList.toggle('active',button.dataset.mobile==='search'));
    document.querySelectorAll('.rail-link[data-view]').forEach(button=>button.classList.toggle('active',button.dataset.view==='search'));
  }
  // Replace controls that had no action, or whose old listener opened the same dialog twice.
  for(const id of ['searchOpen','dashboardSearch']){
    const old=byId(id); if(!old)continue;
    const fresh=old.cloneNode(true); old.replaceWith(fresh);
    fresh.addEventListener('click',openSearch);
  }
  const searchClose=byId('searchClose');
  searchDialog?.addEventListener('close',()=>{
    const restore=viewBeforeSearch;
    if(restore==='search')document.body.dataset.mobileView='home';
    restoreNavigationHighlight();
  });
  // The filter glyph is an action, not decoration: focus the section filter.
  byId('listFilter')?.addEventListener('click',()=>{
    const input=byId('filterInput');
    if(input){input.focus();input.scrollIntoView({block:'nearest',behavior:'smooth'});announce('Type to filter the current manual section.');}
  });
  // The workspace avatar opens the same secondary-tools drawer as More.
  document.querySelector('.avatar')?.addEventListener('click',()=>{
    const dialog=byId('moreDialog');if(dialog&&!dialog.open)dialog.showModal();
  });

  // Add an unmistakable Back control to the reader. On phones it returns to the
  // exact TOC drill-down level; on desktop it keeps the three-panel workspace.
  const toolbarActions=document.querySelector('.reader-actions');
  let readerBack=byId('readerBackButton');
  if(toolbarActions&&!readerBack){
    readerBack=document.createElement('button');
    readerBack.type='button';readerBack.id='readerBackButton';
    readerBack.className='subtle-button reader-back-button';
    readerBack.textContent='‹';readerBack.setAttribute('aria-label','Back to manual navigation');
    readerBack.hidden=true;
    const toolbar=document.querySelector('.reader-toolbar');
    if(toolbar)toolbar.insertBefore(readerBack,toolbar.firstChild);
    readerBack.addEventListener('click',()=>{
      const vehicleName=selectedVehicle?titleFromFolder(selectedVehicle.name):'Vehicles';
      const parent=activeTocPath.at(-1)||null;
      const level=parent?.title||vehicleName;
      renderHierarchicalToc();
      renderTocChildren(parent);
      setMobileView('library',level,'Choose a factory page from this section.');
      restoreNavigationHighlight();
    });
  }
  let readerSearch=byId('readerSearchButton');
  if(toolbarActions&&!readerSearch){
    readerSearch=document.createElement('button');
    readerSearch.type='button';readerSearch.id='readerSearchButton';
    readerSearch.className='subtle-button reader-search-button';
    readerSearch.textContent='⌕';readerSearch.setAttribute('aria-label','Search manuals');
    toolbarActions.insertBefore(readerSearch,byId('bookmarkButton')||toolbarActions.firstChild);
    readerSearch.addEventListener('click',openSearch);
  }

  // Bind favorites/bookmarks to the actual live vehicle + factory page, not demo docs.
  function liveSaveKey(kind){
    if(!activeLiveVehicle||!activeLivePage)return null;
    return [kind,encodeURIComponent(activeLiveVehicle.id),String(activeLivePage.pageId)].join('|');
  }
  function syncLiveSaveButtons(){
    const favorite=byId('favoriteButton'),bookmark=byId('bookmarkButton');
    const favoriteKey=liveSaveKey('favorite'),bookmarkKey=liveSaveKey('bookmark');
    if(favorite){
      const active=!!favoriteKey&&saved.has(favoriteKey);
      favorite.textContent=active?'★ Favorite':'☆ Favorite';favorite.setAttribute('aria-pressed',String(active));
      favorite.setAttribute('aria-label',active?'Remove this page from favorites':'Save this page as a favorite');
    }
    if(bookmark){
      const active=!!bookmarkKey&&saved.has(bookmarkKey);
      bookmark.textContent=active?'⚑ Bookmark':'⚐ Bookmark';bookmark.setAttribute('aria-pressed',String(active));
      bookmark.setAttribute('aria-label',active?'Remove this page bookmark':'Bookmark this page');
    }
  }
  function renderLiveFavorites(){
    const host=byId('favoritesList');if(!host)return;
    host.replaceChildren();
    const entries=[...saved].map(key=>{
      const parts=key.split('|');
      if(parts.length!==3)return null;
      return {kind:parts[0],vehicleId:decodeURIComponent(parts[1]),pageId:parts[2]};
    }).filter(Boolean);
    if(!entries.length){
      host.append(safeText('p','No saved factory pages yet. Use Favorite for quick access or Bookmark to mark a page for later.','empty-state'));
      return;
    }
    entries.forEach(entry=>{
      const vehicle=liveCatalog?.manuals?.flatMap(manual=>manual.vehicles.map(item=>({...item,manualId:manual.id,make:manual.make}))).find(item=>item.id===entry.vehicleId);
      const page=liveManualTree?findTocPathForPage(liveManualTree,entry.pageId):null;
      const title=page?.at(-1)?.title||('Factory page '+entry.pageId);
      const row=document.createElement('div');row.className='favorite-entry';
      const label=safeText('span',title+' · '+(vehicle?titleFromFolder(vehicle.name):'Vehicle unavailable')+' · '+(entry.kind==='favorite'?'Favorite':'Bookmark'));
      const open=document.createElement('button');open.type='button';open.textContent='Open';open.disabled=!vehicle;
      open.addEventListener('click',()=>openLiveSearchResult(vehicle,entry.pageId,title));
      row.append(label,open);host.append(row);
    });
  }
  renderFavorites=renderLiveFavorites;
  function renderLiveSaved(){
    byId('savedCount').textContent=String(saved.size).padStart(2,'0');
    try{localStorage.setItem('mep-saved',JSON.stringify([...saved]));}catch{}
    renderLiveFavorites();
  }
  function toggleLiveSaved(kind){
    const key=liveSaveKey(kind);
    if(!key){announce('Open a factory manual page before saving it.');return;}
    if(saved.has(key))saved.delete(key);else saved.add(key);
    renderLiveSaved();syncLiveSaveButtons();
    announce(saved.has(key)?(kind==='favorite'?'Factory page added to Favorites':'Factory page bookmarked'):(kind==='favorite'?'Favorite removed':'Bookmark removed'));
  }
  for(const [id,kind] of [['favoriteButton','favorite'],['bookmarkButton','bookmark']]){
    const old=byId(id);if(!old)continue;
    const fresh=old.cloneNode(true);old.replaceWith(fresh);
    fresh.addEventListener('click',()=>toggleLiveSaved(kind));
  }
  renderSaved=renderLiveSaved;
  renderLiveSaved();

  // Wrap the final live-page renderer so every route (TOC, search, recent, links,
  // Previous/Next) updates the same reader controls and navigation context.
  const previousFinalPageRenderer=showLiveManualPage;
  showLiveManualPage=async function(vehicle,pageId,title){
    if(readerBack)readerBack.hidden=false;
    await previousFinalPageRenderer(vehicle,pageId,title);
    const content=byId('readerContent');
    if(content&&!content.querySelector('.empty-state')){
      syncLiveSaveButtons();
      renderLivePagination();
    }
  };
  const previousFinalVehicleOpener=openLiveVehicle;
  openLiveVehicle=async function(vehicle){
    if(readerBack)readerBack.hidden=true;
    return previousFinalVehicleOpener(vehicle);
  };

  // Keep search and primary-nav highlighting truthful while a modal is open.
  const previousActivateView=activateView;
  activateView=function(view){
    const normalized=view==='dashboard'?'home':view==='saved'?'favorites':view;
    if(normalized==='search'){
      openSearch();
      document.querySelectorAll('.mobile-fab-menu [data-mobile]').forEach(button=>button.classList.toggle('active',button.dataset.mobile==='search'));
      document.querySelectorAll('.rail-link[data-view]').forEach(button=>button.classList.toggle('active',button.dataset.view==='search'));
      return;
    }
    previousActivateView(view);
    restoreNavigationHighlight();
  };
  searchDialog?.addEventListener('close',restoreNavigationHighlight);
  restoreNavigationHighlight();
})();


// Section-based R2 layout: Vehicle/Manual/Section/Exact Filename.
// The filename in tree.json is authoritative; never synthesize it from a title or ID.
const SECTION_MANUAL_API = '/api/manual-page?key=';
function sectionObjectUrl(key) {
  return SECTION_MANUAL_API + encodeURIComponent(key);
}
async function fetchSectionObject(key) {
  const response = await fetch(sectionObjectUrl(key), { headers: { Accept: '*/*' } });
  if (!response.ok) throw new Error('Manual file request returned ' + response.status + ' for ' + key);
  return response;
}
function sectionChildren(node) {
  if (Array.isArray(node)) return node;
  return node?.c || node?.children || node?.sections || [];
}
function safeSectionFile(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const file = value;
  if (file.startsWith('/') || file.includes('\\') || /[\u0000-\u001f\u007f]/.test(file)) return null;
  const parts = file.split('/');
  if (parts.some(part => !part || part === '.' || part === '..')) return null;
  return file;
}
function sectionTreeNodes(input, vehicle, parentFolders=[]) {
  return sectionChildren(input).map(raw => {
    const title = String(raw.n ?? raw.title ?? raw.name ?? 'Untitled section').trim() || 'Untitled section';
    const rawFile = raw.file ?? raw.filename ?? raw.fileName ?? null;
    const pageNumber = Number(raw.p);
    const pageFile = Number.isInteger(pageNumber) && pageNumber > 0
      ? 'pages/' + pageNumber + '.html'
      : null;
    const exactFile = safeSectionFile(rawFile || pageFile);
    let fileKey = null;
    if (exactFile) {
      const vehicleRoot = vehicle.id.replace(/\/$/, '') + '/';
      const relative = exactFile.startsWith(vehicleRoot)
        ? exactFile
        : exactFile.includes('/')
          ? exactFile
          : [...parentFolders, exactFile].join('/');
      fileKey = relative.startsWith(vehicleRoot) ? relative : manualKey(vehicle, relative);
    }
    const children = sectionTreeNodes(raw, vehicle, [...parentFolders, title]);
    return {
      id: raw.id || 'section-' + Math.random().toString(36).slice(2),
      title,
      file: exactFile,
      fileKey,
      pageId: fileKey,
      assetUrl: raw.assetUrl || null,
      children
    };
  });
}
function sectionFileCount(nodes) {
  return (nodes || []).reduce((total, node) =>
    total + (node.fileKey ? 1 : 0) + sectionFileCount(node.children || []), 0);
}
function resolveSectionReference(baseKey, href) {
  if (!href || /^(?:https?:|mailto:|javascript:|data:|blob:)/i.test(href)) return null;
  try {
    const baseUrl = new URL('https://manual-assets.invalid/' + baseKey.split('/').map(encodeURIComponent).join('/'));
    if (href.startsWith('#')) return null;
    const resolved = new URL(href, baseUrl);
    if (resolved.origin !== baseUrl.origin) return null;
    const key = decodeURIComponent(resolved.pathname.replace(/^\/+/, ''));
    const manualRoot = baseKey.split('/').slice(0, 3).join('/') + '/';
    if (!key.startsWith(manualRoot)) return null;
    if (!key || key.split('/').some(part => !part || part === '.' || part === '..')) return null;
    if (!/\.(?:html?|md|txt|pdf|png|jpe?g|gif|webp|svg|json|css)$/i.test(key)) return null;
    return key;
  } catch {
    return null;
  }
}
function cleanSectionHtml(html, key) {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  parsed.querySelectorAll('script,iframe,object,embed,form,button,base,meta').forEach(node => node.remove());
  parsed.querySelectorAll('*').forEach(node => [...node.attributes].forEach(attr => {
    if (attr.name.toLowerCase().startsWith('on')) node.removeAttribute(attr.name);
  }));
  parsed.querySelectorAll('img').forEach(img => {
    const source = img.getAttribute('src');
    const assetKey = resolveSectionReference(key, source);
    if (assetKey) img.src = sectionObjectUrl(assetKey);
    else img.removeAttribute('src');
    img.removeAttribute('srcset');
    img.loading = 'lazy';
    img.decoding = 'async';
    img.alt = img.alt || 'Factory manual illustration';
    if (/\/icons\//i.test(assetKey || '')) img.classList.add('manual-icon-asset');
  });
  parsed.querySelectorAll('a[href]').forEach(link => {
    const targetKey = resolveSectionReference(key, link.getAttribute('href') || '');
    if (targetKey) {
      link.dataset.manualFile = targetKey;
      link.removeAttribute('href');
      link.setAttribute('role', 'button');
      link.setAttribute('tabindex', '0');
    } else if (!(link.getAttribute('href') || '').startsWith('#')) {
      link.removeAttribute('href');
      link.removeAttribute('role');
    }
  });
  parsed.querySelectorAll('[src],[srcset]').forEach(node => {
    if (node.tagName !== 'IMG') {
      node.removeAttribute('src');
      node.removeAttribute('srcset');
    }
  });
  const main = parsed.querySelector('.main') || parsed.body;
  return main ? main.innerHTML : '<p>Manual file is empty.</p>';
}
function installManualImageZoom(host) {
  if (!host) return;
  host.querySelectorAll('img:not(.manual-icon-asset):not(.manual-zoom-image)').forEach(image => {
    const mount = () => {
      if (!image.isConnected || image.closest('.manual-zoom-shell')) return;
      if (image.naturalWidth < 180 || image.naturalHeight < 120) return;
      const shell = document.createElement('section');
      shell.className = 'manual-zoom-shell';
      shell.setAttribute('aria-label', 'Zoomable factory diagram');
      const toolbar = document.createElement('div');
      toolbar.className = 'manual-zoom-toolbar';
      const zoomOut = document.createElement('button');
      zoomOut.type = 'button'; zoomOut.className = 'manual-zoom-button';
      zoomOut.textContent = '−'; zoomOut.setAttribute('aria-label', 'Zoom out');
      const zoomIn = document.createElement('button');
      zoomIn.type = 'button'; zoomIn.className = 'manual-zoom-button';
      zoomIn.textContent = '+'; zoomIn.setAttribute('aria-label', 'Zoom in');
      const fit = document.createElement('button');
      fit.type = 'button'; fit.className = 'manual-zoom-fit';
      fit.textContent = 'Fit page'; fit.setAttribute('aria-label', 'Fit entire diagram in view');
      const status = document.createElement('span');
      status.className = 'manual-zoom-status'; status.setAttribute('aria-live', 'polite');
      toolbar.append(zoomOut, zoomIn, fit, status);
      const viewport = document.createElement('div');
      viewport.className = 'manual-zoom-viewport';
      viewport.setAttribute('role', 'group');
      viewport.setAttribute('aria-label', 'Diagram. Pinch to zoom and drag to pan.');
      const parent = image.parentNode;
      if (!parent) return;
      parent.insertBefore(shell, image);
      shell.append(toolbar, viewport);
      viewport.append(image);
      image.classList.add('manual-zoom-image');
      let scale = 1, x = 0, y = 0, fitWidth = 0, fitHeight = 0;
      const pointers = new Map();
      let dragStart = null, pinchStart = null;
      const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
      const fitDimensions = () => {
        const vw = viewport.clientWidth, vh = viewport.clientHeight;
        if (!vw || !vh || !image.naturalWidth || !image.naturalHeight) return false;
        const fitScale = Math.min(vw / image.naturalWidth, vh / image.naturalHeight);
        fitWidth = image.naturalWidth * fitScale;
        fitHeight = image.naturalHeight * fitScale;
        image.style.setProperty('width', fitWidth + 'px', 'important');
        image.style.setProperty('height', fitHeight + 'px', 'important');
        image.style.setProperty('max-width', 'none', 'important');
        image.style.setProperty('max-height', 'none', 'important');
        return true;
      };
      const limits = () => ({
        x: Math.max(0, (fitWidth * scale - viewport.clientWidth) / 2),
        y: Math.max(0, (fitHeight * scale - viewport.clientHeight) / 2)
      });
      const paint = () => {
        const bounds = limits();
        x = clamp(x, -bounds.x, bounds.x);
        y = clamp(y, -bounds.y, bounds.y);
        image.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0) scale(' + scale + ')';
        status.textContent = scale === 1 ? 'FIT PAGE' : Math.round(scale * 100) + '%';
        zoomOut.disabled = scale <= 1.001;
        zoomIn.disabled = scale >= 5;
        viewport.classList.toggle('is-zoomed', scale > 1.001);
      };
      const fitPage = () => {
        if (!fitDimensions()) return;
        scale = 1; x = 0; y = 0; paint();
      };
      const setScale = next => {
        const old = scale;
        scale = clamp(next, 1, 5);
        const ratio = scale / old;
        x *= ratio; y *= ratio;
        paint();
      };
      zoomOut.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); setScale(scale / 1.35); });
      zoomIn.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); setScale(scale * 1.35); });
      fit.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); fitPage(); });
      viewport.addEventListener('pointerdown', event => {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        viewport.setPointerCapture?.(event.pointerId);
        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (pointers.size === 1 && scale > 1) {
          dragStart = { x: event.clientX, y: event.clientY, tx: x, ty: y };
        } else if (pointers.size === 2) {
          const points = [...pointers.values()];
          const cx = (points[0].x + points[1].x) / 2;
          const cy = (points[0].y + points[1].y) / 2;
          const rect = viewport.getBoundingClientRect();
          const centerX = cx - rect.left - viewport.clientWidth / 2;
          const centerY = cy - rect.top - viewport.clientHeight / 2;
          const dx = points[0].x - points[1].x, dy = points[0].y - points[1].y;
          pinchStart = { distance: Math.hypot(dx, dy), scale, imageX: (centerX - x) / scale, imageY: (centerY - y) / scale };
          dragStart = null;
        }
        event.preventDefault();
      });
      viewport.addEventListener('pointermove', event => {
        if (!pointers.has(event.pointerId)) return;
        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (pointers.size >= 2 && pinchStart) {
          const points = [...pointers.values()];
          const dx = points[0].x - points[1].x, dy = points[0].y - points[1].y;
          const distance = Math.hypot(dx, dy);
          const rect = viewport.getBoundingClientRect();
          const cx = (points[0].x + points[1].x) / 2 - rect.left - viewport.clientWidth / 2;
          const cy = (points[0].y + points[1].y) / 2 - rect.top - viewport.clientHeight / 2;
          scale = clamp(pinchStart.scale * distance / Math.max(1, pinchStart.distance), 1, 5);
          x = cx - pinchStart.imageX * scale;
          y = cy - pinchStart.imageY * scale;
          paint();
        } else if (pointers.size === 1 && dragStart && scale > 1) {
          x = dragStart.tx + event.clientX - dragStart.x;
          y = dragStart.ty + event.clientY - dragStart.y;
          paint();
        }
        event.preventDefault();
      });
      const endPointer = event => {
        pointers.delete(event.pointerId);
        if (pointers.size < 2) pinchStart = null;
        if (pointers.size === 1 && scale > 1) {
          const point = [...pointers.values()][0];
          dragStart = { x: point.x, y: point.y, tx: x, ty: y };
        } else dragStart = null;
      };
      viewport.addEventListener('pointerup', endPointer);
      viewport.addEventListener('pointercancel', endPointer);
      fit.addEventListener('dblclick', event => { event.preventDefault(); fitPage(); });
      if (typeof ResizeObserver !== 'undefined') {
        const observer = new ResizeObserver(() => {
          const previousWidth = fitWidth, previousHeight = fitHeight;
          if (!fitDimensions()) return;
          if (scale === 1 || !previousWidth || !previousHeight) { scale = 1; x = 0; y = 0; }
          else { x *= fitWidth / previousWidth; y *= fitHeight / previousHeight; }
          paint();
        });
        observer.observe(viewport);
      }
      requestAnimationFrame(fitPage);
    };
    if (image.complete && image.naturalWidth) mount();
    else image.addEventListener('load', mount, { once: true });
  });
}
async function renderSectionFile(response, key, title, requestId) {
  const host = $('#readerContent');
  const extension = key.split('.').pop().toLowerCase();
  host.replaceChildren();
  if (extension === 'pdf') {
    const frame = document.createElement('iframe');
    frame.className = 'manual-pdf-frame';
    frame.title = title || key.split('/').pop();
    frame.src = sectionObjectUrl(key);
    host.append(frame);
    return;
  }
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(extension)) {
    const image = document.createElement('img');
    image.className = 'manual-page-image';
    image.alt = title || key.split('/').pop();
    image.src = sectionObjectUrl(key);
    host.append(image);
    installManualImageZoom(host);
    return;
  }
  if (extension === 'md' || extension === 'txt') {
    const pre = document.createElement('pre');
    pre.className = 'manual-plain-text';
    pre.textContent = await response.text();
    if (requestId === manualPageRequestId) host.replaceChildren(pre);
    return;
  }
  const html = await response.text();
  if (requestId !== manualPageRequestId) return;
  host.innerHTML = cleanSectionHtml(html, key);
  installManualImageZoom(host);
  host.querySelectorAll('[data-manual-file]').forEach(link => {
    const open = () => showLiveManualPage(selectedVehicle, link.dataset.manualFile, link.textContent.trim() || link.dataset.manualFile.split('/').pop());
    link.addEventListener('click', open);
    link.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); }
    });
  });
}
loadLiveManualIndex = async function(vehicle) {
  const requestId = ++tocLoadRequestId;
  selectedVehicle = vehicle;
  activeLiveVehicle = vehicle;
  activeTocPath = [];
  activeLivePage = null;
  liveManualGroups = [];
  activeManualGroup = 0;
  liveManualTree = [];
  renderLivePagination();
  $('#documentList').replaceChildren(safeText('p', 'Loading the factory table of contents…', 'empty-state'));
  $('.manual-tree').replaceChildren(safeText('p', 'Loading manual sections…', 'empty-state'));
  try {
    const treeFiles = Array.isArray(vehicle.treeFiles) ? vehicle.treeFiles : [];
    let roots = [];
    let source = '';

    if (treeFiles.length) {
      try {
        const trees = await Promise.all(treeFiles.map(async entry => {
          if (!entry?.key) throw new Error('A section tree is missing its object key.');
          const response = await fetchSectionObject(entry.key);
          return { entry, tree: await response.json() };
        }));
        if (requestId !== tocLoadRequestId || selectedVehicle?.id !== vehicle.id) return;
        roots = trees.flatMap(({ entry, tree }) => sectionTreeNodes([{
          n: tree.title || entry.title,
          c: sectionChildren(tree)
        }], vehicle));
        if (roots.length && sectionFileCount(roots)) {
          source = trees.length + ' registered section trees';
        }
      } catch (treeError) {
        console.warn('Registered section trees unavailable; falling back to the factory index.', treeError);
      }
    }

    // Older catalog entries may not expose treeFiles. The factory index remains
    // the canonical fallback and contains the original section/page hierarchy.
    if (!roots.length || !sectionFileCount(roots)) {
      const html = await fetchManualHtml(manualKey(vehicle, 'index.html'));
      if (requestId !== tocLoadRequestId || selectedVehicle?.id !== vehicle.id) return;
      const parsed = new DOMParser().parseFromString(html, 'text/html');
      roots = buildHierarchicalToc(parsed);
      if (roots.length === 1 && !roots[0].children?.length) {
        await hydrateTocNode(roots[0], vehicle);
      }
      if (requestId !== tocLoadRequestId || selectedVehicle?.id !== vehicle.id) return;
      source = 'factory index';
    }

    if (!roots.length) throw new Error('The factory index contains no navigable sections.');
    const count = roots.reduce((total, node) => total + tocLeafPages(node).length, 0);
    if (!count) throw new Error('The factory hierarchy contains no usable page references.');

    liveManualTree = roots;
    renderHierarchicalToc();
    renderTocChildren(null);
    setMobileView('vehicles', titleFromFolder(vehicle.name), 'Choose a factory section to continue.');
    announce('Loaded ' + source + ' with ' + count.toLocaleString() + ' linked factory pages.');
  } catch (error) {
    if (requestId !== tocLoadRequestId || selectedVehicle?.id !== vehicle.id) return;
    $('.manual-tree').replaceChildren(safeText('p', 'Unable to load factory sections. ' + error.message, 'empty-state'));
    $('#documentList').replaceChildren(safeText('p', 'The factory table of contents could not be loaded. ' + error.message, 'empty-state'));
  }
};
tocLeafPages = function(node, out=[]) {
  (node?.children || []).forEach(child => {
    if (child?.fileKey) out.push({ pageId: String(child.fileKey), title: child.title, file: child.file });
  });
  return out;
};
function sectionNavigationView(node) {
  const children = node?.children || liveManualTree || [];
  const hasSubfolders = children.some(child =>
    Array.isArray(child.children) && child.children.length > 0
  );
  return node && !hasSubfolders ? 'library' : 'vehicles';
}
function navigateToSectionPath(path) {
  activeTocPath = path.slice();
  const target = activeTocPath.at(-1) || null;
  renderHierarchicalToc();
  renderTocChildren(target);
  const view = sectionNavigationView(target);
  setMobileView(view, target?.title || titleFromFolder(selectedVehicle.name),
    target ? 'Choose a factory file from this section.' : 'Choose a factory manual section.');
}
function renderSectionBreadcrumbs() {
  const vehicleLabel = titleFromFolder(selectedVehicle?.name || 'Vehicle');
  const segments = [{ label: vehicleLabel, path: [] }];
  activeTocPath.forEach((node, index) => segments.push({
    label: node.title,
    path: activeTocPath.slice(0, index + 1)
  }));
  const render = (host, className) => {
    if (!host) return;
    host.replaceChildren();
    segments.forEach((segment, index) => {
      if (index) host.append(safeText('span', '/', 'reader-crumb-separator'));
      const button = document.createElement('button');
      button.type = 'button';
      button.className = className;
      button.textContent = segment.label;
      if (index === segments.length - 1) button.setAttribute('aria-current', 'location');
      button.addEventListener('click', () => navigateToSectionPath(segment.path));
      host.append(button);
    });
  };
  render($('#crumb'), 'reader-crumb-button');
  const toolbar = document.querySelector('.reader-toolbar > div:first-of-type');
  if (toolbar) {
    let trail = $('#readerBreadcrumbs');
    if (!trail) {
      trail = document.createElement('nav');
      trail.id = 'readerBreadcrumbs';
      trail.setAttribute('aria-label', 'Manual location');
      toolbar.append(trail);
    }
    render(trail, 'reader-crumb-button');
  }
}
renderTocChildren = function(node) {
  const list = $('#documentList');
  if (!list) return;
  const pages = tocLeafPages(node || { children: liveManualTree });
  list.replaceChildren();
  if (!pages.length) {
    list.append(safeText('p', 'Choose a section to see its factory files here.', 'empty-state'));
  } else {
    pages.forEach(page => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'document-item';
      item.append(iconNode(sectionIcon(page.title), 'doc-icon'));
      const details = document.createElement('span');
      details.append(safeText('b', page.title), safeText('small', page.file));
      item.append(details, safeText('span', '›', 'doc-arrow'));
      item.addEventListener('click', () => showLiveManualPage(selectedVehicle, page.pageId, page.title));
      list.append(item);
    });
  }
  const title = node?.title || 'Factory contents';
  $('#sectionTitle').textContent = title + ' · Files';
  renderSectionBreadcrumbs();
  liveManualGroups = [{ title, pages }];
  activeManualGroup = 0;
  $('.list-footnote').textContent = 'SECTION FILES · ' + pages.length.toLocaleString() + ' FILES';
  $('#filterInput').value = '';
  renderLivePagination();
};
showLiveManualPage = async function(vehicle, fileKey, title) {
  const requestId = ++manualPageRequestId;
  selectedVehicle = vehicle;
  activeLiveVehicle = vehicle;
  activeLivePage = null;
  renderLivePagination();
  const vehicleRoot = vehicle.id.replace(/\/$/, '') + '/';
  const key = String(fileKey).startsWith(vehicleRoot) ? String(fileKey) : manualKey(vehicle, String(fileKey));
  const fileName = key.split('/').pop();
  const displayTitle = title || fileName;
  $('#readerTitle').textContent = displayTitle;
  $('#readerContent').replaceChildren(safeText('p', 'Loading ' + fileName + '…', 'empty-state'));
  setMobileView('reader', displayTitle, titleFromFolder(vehicle.name) + ' · ' + fileName);
  const readerBack = $('#readerBackButton');
  if (readerBack) readerBack.hidden = false;
  try {
    const extension = key.split('.').pop().toLowerCase();
    const response = ['pdf', 'png', 'svg'].includes(extension) ? null : await fetchSectionObject(key);
    if (requestId !== manualPageRequestId) return;
    await renderSectionFile(response, key, displayTitle, requestId);
    if (requestId !== manualPageRequestId) return;
    activeLivePage = { pageId: key, title: displayTitle, file: fileName };
    renderSectionBreadcrumbs();
    renderLivePagination();
    const favoriteKey = ['favorite', encodeURIComponent(vehicle.id), key].join('|');
    const bookmarkKey = ['bookmark', encodeURIComponent(vehicle.id), key].join('|');
    const favorite = $('#favoriteButton');
    const bookmark = $('#bookmarkButton');
    if (favorite) {
      const active = saved.has(favoriteKey);
      favorite.textContent = active ? '★ Favorite' : '☆ Favorite';
      favorite.setAttribute('aria-pressed', String(active));
    }
    if (bookmark) {
      const active = saved.has(bookmarkKey);
      bookmark.textContent = active ? '⚑ Bookmark' : '⚐ Bookmark';
      bookmark.setAttribute('aria-pressed', String(active));
    }
    try {
      recordRecentManual(vehicle, key, displayTitle);
    } catch {}
    announce('Opened ' + fileName);
  } catch (error) {
    if (requestId !== manualPageRequestId) return;
    const message = safeText('p', 'Unable to open ' + fileName + '. ' + error.message, 'empty-state');
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'subtle-button';
    retry.textContent = 'Retry file';
    retry.addEventListener('click', () => showLiveManualPage(vehicle, key, displayTitle));
    $('#readerContent').replaceChildren(message, retry);
  }
};
openLiveSearchResult = async function(vehicle, fileKey, title) {
  await openLiveVehicle(vehicle);
  if (selectedVehicle?.id !== vehicle.id) return;
  const path = findTocPathForPage(liveManualTree, fileKey);
  if (path) {
    activeTocPath = path.slice(0, -1);
    renderHierarchicalToc();
    renderTocChildren(activeTocPath.at(-1) || null);
  }
  showLiveManualPage(vehicle, fileKey, title);
};

// Final mobile FAB binding: replace any stale prototype listeners with one live handler.
(function bindLiveFab(){
  const toggle=document.getElementById('mobileFabToggle');
  const menu=document.getElementById('mobileFabMenu');
  if(!toggle||!menu)return;
  const freshToggle=toggle.cloneNode(true);toggle.replaceWith(freshToggle);
  freshToggle.addEventListener('click',()=>{
    menu.hidden=!menu.hidden;
    freshToggle.setAttribute('aria-expanded',String(!menu.hidden));
    freshToggle.setAttribute('aria-label',menu.hidden?'Open navigation':'Close navigation');
    freshToggle.textContent=menu.hidden?'＋':'×';
  });
  menu.querySelectorAll('button[data-mobile]').forEach(button=>{
    const fresh=button.cloneNode(true);button.replaceWith(fresh);
    fresh.addEventListener('click',()=>{
      const view=fresh.dataset.mobile;
      menu.hidden=true;
      freshToggle.setAttribute('aria-expanded','false');
      freshToggle.setAttribute('aria-label','Open navigation');
      freshToggle.textContent='＋';
      activateView(view);
    });
  });
})();
