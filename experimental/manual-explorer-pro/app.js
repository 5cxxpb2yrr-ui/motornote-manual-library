const $=s=>document.querySelector(s);const $$=s=>[...document.querySelectorAll(s)];
const docs=[{id:'engine-overview',title:'Engine Mechanical — Overview',kind:'General information · Service procedure'},{id:'engine-specs',title:'Engine Mechanical Specifications',kind:'Specifications · Reference'},{id:'engine-removal',title:'Engine Assembly — Removal',kind:'Repair procedure · 12 steps'},{id:'engine-install',title:'Engine Assembly — Installation',kind:'Repair procedure · 9 steps'}];
const vehicles={scion:'Scion xB Manuals',subaru:'Subaru Crosstrek Manuals',toyota:'Toyota Tacoma Manuals',ford:'Ford F-150 Manuals'};
const MANUAL_SITE='https://motornote-manual-library.phillipstg.workers.dev/';
let selected=0;let searchGeneration=0;let indexPromise=null;
const saved=new Set(JSON.parse(localStorage.getItem('mep-saved')||'[]'));
function announce(message){const toast=$('#toast');toast.textContent=message;toast.classList.add('show');setTimeout(()=>toast.classList.remove('show'),2100)}
function renderSaved(){ $('#savedCount').textContent=String(saved.size).padStart(2,'0');localStorage.setItem('mep-saved',JSON.stringify([...saved]));}
function selectDoc(index){selected=(index+docs.length)%docs.length;const d=docs[selected];$('#readerTitle').textContent=d.title;$$('.document-item').forEach((el,i)=>el.classList.toggle('selected',i===selected));const key='favorite:'+d.id;const bookmark='bookmark:'+d.id;$('#favoriteButton').setAttribute('aria-pressed',String(saved.has(key)));$('#bookmarkButton').setAttribute('aria-pressed',String(saved.has(bookmark)));$('#readerContent').innerHTML='<div class="procedure-label">DEMO REFERENCE / '+String(selected+1).padStart(2,'0')+'</div><h3>'+d.title+'</h3><p>This is sample interface content, not a factory procedure. In the connected version, the original manual page, diagrams, specifications, warnings and navigation will be displayed here.</p><div class="notice"><strong>Factory information placeholder</strong><p>Vehicle-specific instructions and safety information will be loaded from the selected manual source.</p></div><h3>Reference details</h3><ul><li>'+d.kind+'</li><li>Vehicle: 2006 Scion xB</li><li>Engine: 1NZ-FE · 1.5L</li></ul>';$('#reader').focus({preventScroll:true});}
function toggleSaved(kind){const key=kind+':'+docs[selected].id;if(saved.has(key))saved.delete(key);else saved.add(key);renderSaved();selectDoc(selected);announce(saved.has(key)?(kind==='favorite'?'Added to favorites':'Bookmark saved'):(kind==='favorite'?'Removed from favorites':'Bookmark removed'))}
$$('.document-item').forEach((el,i)=>el.addEventListener('click',()=>selectDoc(i)));
$('#favoriteButton').addEventListener('click',()=>toggleSaved('favorite'));$('#bookmarkButton').addEventListener('click',()=>toggleSaved('bookmark'));
$('#previousDoc').addEventListener('click',()=>selectDoc(selected-1));$('#nextDoc').addEventListener('click',()=>selectDoc(selected+1));
$$('.vehicle-item').forEach(el=>el.addEventListener('click',()=>{$$('.vehicle-item').forEach(x=>x.classList.remove('selected'));el.classList.add('selected');$('#vehicleManualTitle').textContent=vehicles[el.dataset.vehicle];announce('Vehicle changed: '+el.querySelector('b').textContent+'. Sample pages remain selected.');}));
// Factory section navigation is generated from the selected vehicle index.
$('#themeButton').addEventListener('click',()=>{document.body.classList.toggle('light');announce(document.body.classList.contains('light')?'Light theme enabled':'Dark theme enabled')});
$('#searchOpen').addEventListener('click',()=>{$('#searchDialog').showModal();$('#globalSearch').focus()});$('#searchClose').addEventListener('click',()=>$('#searchDialog').close());

function openIndexDb(){return new Promise((resolve,reject)=>{const req=indexedDB.open('lifeos-manual-explorer',1);req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('index'))req.result.createObjectStore('index')};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
async function cachedGet(key){try{const db=await openIndexDb();return await new Promise((resolve,reject)=>{const tx=db.transaction('index','readonly');const req=tx.objectStore('index').get(key);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}catch{return null}}
async function cachedPut(key,value){try{const db=await openIndexDb();await new Promise((resolve,reject)=>{const tx=db.transaction('index','readwrite');tx.objectStore('index').put(value,key);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)})}catch{/* Search remains usable without local caching. */}}
async function getJson(url){const response=await fetch(url,{headers:{Accept:'application/json'}});if(!response.ok)throw new Error('Search service returned '+response.status);return response.json()}
async function loadSearchIndex(){if(indexPromise)return indexPromise;indexPromise=(async()=>{const manifest=await getJson('/api/search-index');if(!manifest||!Array.isArray(manifest.shards))throw new Error('Search index manifest is invalid');const all=[];let cursor=0;async function worker(){while(cursor<manifest.shards.length){const item=manifest.shards[cursor++];let records=await cachedGet(item.key);if(!Array.isArray(records)){records=await getJson('/api/search-index?file='+encodeURIComponent(item.key.split('/').pop()));await cachedPut(item.key,records)}all.push(...records)}}await Promise.all(Array.from({length:Math.min(4,manifest.shards.length)},worker));return{manifest,records:all}})().catch(error=>{indexPromise=null;throw error});return indexPromise}
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
      const pageId=record.path.match(/\/pages\/(\d+)\.html?$/i)?.[1];
      if(!vehicle||!pageId){announce('Could not match this result to a vehicle in the live catalog.');return}
      $('#searchDialog').close();
      showLiveManualPage(vehicle,pageId,record.title||'Manual page '+pageId);
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
$('#filterInput').addEventListener('input',e=>{$$('.document-item').forEach(el=>el.hidden=!el.textContent.toLowerCase().includes(e.target.value.toLowerCase()))});
$('#addVehicle').addEventListener('click',()=>announce('Vehicle profile creation is planned for the next prototype milestone.'));

renderSaved();selectDoc(0);


// Mobile navigation follows the five-tab LifeOS model. Secondary tools stay in drawers.
function refreshTocDrawer(){
  const source=$('.manual-tree');
  const target=$('#tocDrawerContent');
  if(!source||!target)return;
  target.replaceChildren(source.cloneNode(true));
  target.querySelectorAll('[data-section]').forEach(item=>{
    item.addEventListener('click',()=>{
      const section=item.dataset.section;
      const original=$('.manual-tree [data-section="'+section+'"]');
      if(original)original.click();
      $('#tocDialog').close();
      $('#reader').scrollIntoView({behavior:'smooth',block:'start'});
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
  if(tab==='home')setMobileView('home','Your garage','Choose a vehicle or continue where you left off.');
  if(tab==='vehicles')setMobileView('vehicles','Vehicles','Choose a vehicle to browse its manuals.');
  if(tab==='favorites'){renderFavorites();setMobileView('favorites','Favorites','Your saved procedures and references.')}
}));
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
$('#recentManual').addEventListener('click',()=>{selectDoc(0);setMobileView('reader','Manual viewer','Recently opened · 2006 Scion xB')});
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
    card.append(vehiclePhoto(vehicle,'home-car-icon vehicle-photo'),safeText('b',label),safeText('small',vehicle.make.toUpperCase()+' · Factory manual'));
    card.addEventListener('click',()=>openLiveVehicle(vehicle));
    home.append(card);
  }
  $('#vehicleManualTitle').textContent='R2 MANUAL LIBRARY';
  $('#homeAllVehicles').textContent='View all →';
  $('#homeContextHint')?.remove();
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
    host.replaceChildren(safeText('p','Unable to load the live R2 catalog. '+error.message,'empty-state'));
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
    $('#globalSearch').focus();
    return;
  }
  if(normalized==='more'){
    $('#moreDialog').showModal();
    return;
  }
  if(normalized==='favorites')renderFavorites();
  const labels={home:['Your garage','Choose a vehicle or continue where you left off.'],vehicles:[selectedVehicle?titleFromFolder(selectedVehicle.name):'Vehicles','Choose a vehicle to browse its manuals.'],library:[$('#sectionTitle').textContent,'Manual pages in this section.'],reader:[$('#readerTitle').textContent,'Factory manual reference.'],favorites:['Favorites','Your saved procedures and references.']};
  const info=labels[normalized]||labels.home;
  setMobileView(normalized,info[0],info[1]);
  $$('.mobile-nav button').forEach(button=>button.classList.toggle('active',button.dataset.mobile===normalized));
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
  const key = manualKey(vehicle, 'pages/' + pageId + '.html');
  $('#readerTitle').textContent = title || 'Manual page ' + pageId;
  $('#readerContent').innerHTML = '<p class="empty-state">Loading factory manual page…</p>';
  setMobileView('reader', title || 'Manual viewer', titleFromFolder(vehicle.name));
  try {
    const html = await fetchManualHtml(key);
    $('#readerContent').innerHTML = cleanManualFragment(html, key);
    $('#readerContent').querySelectorAll('[data-manual-page]').forEach(link => {
      const open = () => showLiveManualPage(vehicle, link.dataset.manualPage, link.textContent.trim());
      link.addEventListener('click', open);
      link.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); } });
    });
    $('#readerContent').querySelectorAll('a').forEach(link => {
      if (!link.dataset.manualPage) link.removeAttribute('role');
    });
    $('#reader').focus({ preventScroll: true });
    announce('Loaded factory manual page: ' + (title || pageId));
  } catch (error) {
    $('#readerContent').replaceChildren(safeText('p','Unable to load this factory manual page. '+error.message,'empty-state'));
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


// Live page-to-page navigation: replace the demo document controls with the
// actual ordered page list from the selected vehicle's factory index.
let livePageSequence = [];
let livePageVehicleId = null;
let livePageIndex = -1;

async function ensureLivePageSequence(vehicle) {
  if (livePageVehicleId === vehicle.id && livePageSequence.length) return;
  const html = await fetchManualHtml(manualKey(vehicle, 'index.html'));
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const links = [...parsed.querySelectorAll('a[href]')]
    .filter(link => /pages\/\d+\.html(?:$|[?#])/.test(link.getAttribute('href') || ''));
  const seen = new Set();
  livePageSequence = links.map(link => {
    const href = link.getAttribute('href') || '';
    const pageId = href.match(/pages\/(\d+)\.html/)?.[1];
    return pageId ? { pageId, title: link.textContent.trim() || 'Manual page ' + pageId } : null;
  }).filter(item => {
    if (!item || seen.has(item.pageId)) return false;
    seen.add(item.pageId);
    return true;
  });
  livePageVehicleId = vehicle.id;
}

function updateLivePageControls() {
  const previous = $('#previousDoc');
  const next = $('#nextDoc');
  if (!previous || !next) return;
  previous.disabled = livePageIndex <= 0;
  next.disabled = livePageIndex < 0 || livePageIndex >= livePageSequence.length - 1;
  previous.setAttribute('aria-label', 'Previous factory manual page');
  next.setAttribute('aria-label', 'Next factory manual page');
  previous.title = previous.disabled ? 'No previous page' : 'Previous: ' + livePageSequence[livePageIndex - 1].title;
  next.title = next.disabled ? 'No next page' : 'Next: ' + livePageSequence[livePageIndex + 1].title;
}

function installLivePageControls() {
  for (const id of ['previousDoc', 'nextDoc']) {
    const oldButton = $('#' + id);
    if (!oldButton || oldButton.dataset.liveNavigation === 'true') continue;
    const button = oldButton.cloneNode(true);
    button.dataset.liveNavigation = 'true';
    oldButton.replaceWith(button);
    button.addEventListener('click', () => {
      const offset = id === 'previousDoc' ? -1 : 1;
      const target = livePageSequence[livePageIndex + offset];
      if (!selectedVehicle || !target) return;
      showLiveManualPage(selectedVehicle, target.pageId, target.title);
    });
  }
  updateLivePageControls();
}

const originalShowLiveManualPageWithSequence = showLiveManualPage;
showLiveManualPage = async function(vehicle, pageId, title) {
  try {
    await ensureLivePageSequence(vehicle);
    livePageIndex = livePageSequence.findIndex(item => item.pageId === String(pageId));
    updateLivePageControls();
  } catch (error) {
    announce('Could not load the manual page sequence: ' + error.message);
  }
  return originalShowLiveManualPageWithSequence(vehicle, pageId, title);
};

installLivePageControls();


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


// Productionize the prototype's "Recent manuals" surface and harden R2 index loading.
// The old static card and initial reader content were sample data, not a real page.
const recentCardOld = $('#recentManual');
if (recentCardOld) {
  const recentCard = recentCardOld.cloneNode(true);
  recentCardOld.replaceWith(recentCard);
  const recentHost = recentCard.parentElement;
  let recentEmpty = $('#recentManualEmpty');
  if (!recentEmpty) {
    recentEmpty = document.createElement('p');
    recentEmpty.id = 'recentManualEmpty';
    recentEmpty.className = 'empty-state';
    recentEmpty.textContent = 'No factory pages opened yet. Select a vehicle and open a page to see it here.';
    recentCard.insertAdjacentElement('afterend', recentEmpty);
  }
  const readRecent = () => {
    try { return JSON.parse(localStorage.getItem('mep-recent-manual') || 'null'); }
    catch { return null; }
  };
  const renderRecentManual = () => {
    const recent = readRecent();
    const valid = recent && recent.vehicleId && recent.pageId && recent.title;
    recentCard.hidden = !valid;
    recentEmpty.hidden = !!valid;
    const count = $('#recentCount');
    if (count) count.textContent = valid ? '01' : '00';
    if (!valid) return;
    recentCard.replaceChildren();
    recentCard.append(safeText('span', '▤'));
    const details = document.createElement('span');
    details.append(safeText('b', recent.title), safeText('small', recent.vehicleName + ' · Factory manual'));
    recentCard.append(details, safeText('span', '›'));
  };
  recentCard.addEventListener('click', () => {
    const recent = readRecent();
    const vehicle = liveCatalog?.manuals?.flatMap(manual => manual.vehicles.map(item => ({...item, manualId: manual.id, make: manual.make})))
      .find(item => item.id === recent?.vehicleId);
    if (!vehicle || !recent) {
      announce('Select the vehicle again to reopen this recent page.');
      return;
    }
    showLiveManualPage(vehicle, recent.pageId, recent.title);
  });
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

  // If the Pages Function route is unavailable, read the same object directly
  // from the public read-only R2 Worker instead of leaving the TOC blank.
  const fetchManualHtmlViaPages = fetchManualHtml;
  fetchManualHtml = async function(key) {
    try {
      return await fetchManualHtmlViaPages(key);
    } catch (pagesError) {
      const directUrl = MANUAL_SITE + key.split('/').map(encodeURIComponent).join('/');
      try {
        const response = await fetch(directUrl, { headers: { Accept: 'text/html' } });
        if (!response.ok) throw new Error('R2 Worker returned ' + response.status);
        return await response.text();
      } catch (workerError) {
        throw new Error('Pages API: ' + pagesError.message + ' · R2 Worker: ' + workerError.message);
      }
    }
  };

  // Persist a recent entry only after a real R2 page has loaded successfully.
  const showPageBeforeRecent = showLiveManualPage;
  showLiveManualPage = async function(vehicle, pageId, title) {
    await showPageBeforeRecent(vehicle, pageId, title);
    const content = $('#readerContent');
    if (content && !content.querySelector('.empty-state')) {
      const recent = {
        vehicleId: vehicle.id,
        vehicleName: titleFromFolder(vehicle.name),
        pageId: String(pageId),
        title: title || 'Manual page ' + pageId
      };
      try { localStorage.setItem('mep-recent-manual', JSON.stringify(recent)); } catch {}
      renderRecentManual();
    }
  };
}
