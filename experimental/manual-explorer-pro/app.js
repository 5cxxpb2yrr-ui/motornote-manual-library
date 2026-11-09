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
$$('.tree-child,.tree-item').forEach(el=>el.addEventListener('click',()=>{$$('.tree-child,.tree-item').forEach(x=>x.classList.remove('active'));el.classList.add('active');const name=el.textContent.trim().replace(/^[⌄›]\s*/,'');$('#sectionTitle').textContent=name;$('#crumb').textContent=$('#vehicleManualTitle').textContent.toUpperCase()+' / '+name.toUpperCase();announce('Section selected: '+name);}));
$('#themeButton').addEventListener('click',()=>{document.body.classList.toggle('light');announce(document.body.classList.contains('light')?'Light theme enabled':'Dark theme enabled')});
$('#searchOpen').addEventListener('click',()=>{$('#searchDialog').showModal();$('#globalSearch').focus()});$('#searchClose').addEventListener('click',()=>$('#searchDialog').close());

function openIndexDb(){return new Promise((resolve,reject)=>{const req=indexedDB.open('lifeos-manual-explorer',1);req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('index'))req.result.createObjectStore('index')};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
async function cachedGet(key){try{const db=await openIndexDb();return await new Promise((resolve,reject)=>{const tx=db.transaction('index','readonly');const req=tx.objectStore('index').get(key);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}catch{return null}}
async function cachedPut(key,value){try{const db=await openIndexDb();await new Promise((resolve,reject)=>{const tx=db.transaction('index','readwrite');tx.objectStore('index').put(value,key);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)})}catch{/* Search remains usable without local caching. */}}
async function getJson(url){const response=await fetch(url,{headers:{Accept:'application/json'}});if(!response.ok)throw new Error('Search service returned '+response.status);return response.json()}
async function loadSearchIndex(){if(indexPromise)return indexPromise;indexPromise=(async()=>{const manifest=await getJson('/api/search-index');if(!manifest||!Array.isArray(manifest.shards))throw new Error('Search index manifest is invalid');const all=[];let cursor=0;async function worker(){while(cursor<manifest.shards.length){const item=manifest.shards[cursor++];let records=await cachedGet(item.key);if(!Array.isArray(records)){records=await getJson('/api/search-index?file='+encodeURIComponent(item.key.split('/').pop()));await cachedPut(item.key,records)}all.push(...records)}}await Promise.all(Array.from({length:Math.min(4,manifest.shards.length)},worker));return{manifest,records:all}})().catch(error=>{indexPromise=null;throw error});return indexPromise}
function safeText(tag,value,className){const node=document.createElement(tag);node.textContent=value||'';if(className)node.className=className;return node}
function renderSearchResults(matches,query){const results=$('#searchResults');results.replaceChildren();if(!matches.length){results.append(safeText('p','No matching manual pages were found.','empty-state'));return}for(const record of matches.slice(0,50)){const button=document.createElement('button');button.type='button';button.className='document-item search-result';const icon=safeText('span','▤','doc-icon');const details=document.createElement('span');details.append(safeText('b',record.title||'Untitled procedure'));const excerpt=(record.text||'').replace(/\s+/g,' ').trim();const at=excerpt.toLowerCase().indexOf(query.toLowerCase().split(/\s+/)[0]);const snippet=excerpt.slice(Math.max(0,at-65),Math.max(0,at-65)+180);details.append(safeText('small',(record.manualId||'Manual')+' · '+snippet));button.append(icon,details,safeText('span','↗','doc-arrow'));button.addEventListener('click',()=>{const target=MANUAL_SITE+record.path.split('/').map(encodeURIComponent).join('/');window.open(target,'_blank','noopener,noreferrer')});results.append(button)}}
async function runManualSearch(value,generation){const query=value.trim();const results=$('#searchResults');if(!query){results.replaceChildren(safeText('p','Search across the indexed factory procedures.','empty-state'));return}results.replaceChildren(safeText('p','Searching the R2 manual index…','empty-state'));try{const {manifest,records}=await loadSearchIndex();if(generation!==searchGeneration)return;const terms=query.toLowerCase().split(/\s+/).filter(Boolean);const matches=records.map(record=>{const title=(record.title||'').toLowerCase(),body=(record.text||'').toLowerCase();const matched=terms.filter(term=>title.includes(term)||body.includes(term)).length;const score=matched*10+(terms.every(term=>title.includes(term))?20:0);return{record,score}}).filter(item=>item.score>0).sort((a,b)=>b.score-a.score).map(item=>item.record);$('#searchTitle').textContent='Find a procedure · '+manifest.documentCount+' indexed';renderSearchResults(matches,query);$('#searchDialog .dialog-note').textContent='R2 INDEX · '+manifest.documentCount+' PAGES · RESULTS OPEN IN THE SECURE MANUAL LIBRARY';}catch(error){if(generation!==searchGeneration)return;results.replaceChildren(safeText('p','Search is not available yet: '+error.message+'. Confirm this app is deployed with its R2 binding.','empty-state'));}}
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
function titleFromFolder(value){
  return value.replace(/\s+/g,' ').replace(/\bL4-/g,'L4 ').trim();
}
function renderLiveGarage(catalog){
  liveCatalog=catalog;
  const allVehicles=catalog.manuals.flatMap(manual=>manual.vehicles.map(vehicle=>({...vehicle,manualId:manual.id,make:manual.make,fileCount:manual.fileCount})));
  $('#vehicleTotal').textContent=String(allVehicles.length).padStart(2,'0');
  $('#manualTotal').textContent=String(catalog.manualCount).padStart(2,'0');
  const list=$('#vehicleList');list.replaceChildren();
  const home=$('#homeVehicleGrid');home.replaceChildren();
  for(const vehicle of allVehicles){
    const label=titleFromFolder(vehicle.name);
    const item=document.createElement('button');item.type='button';item.className='vehicle-item';
    item.dataset.liveHref=vehicle.href;
    item.append(safeText('span','🚘','vehicle-icon'));
    const details=document.createElement('span');details.append(safeText('b',label),safeText('small',vehicle.make.toUpperCase()+' · '+vehicle.fileCount.toLocaleString()+' files'));
    item.append(details,safeText('span','›','chevron'));
    item.addEventListener('click',()=>openLiveVehicle(vehicle));
    list.append(item);

    const card=document.createElement('button');card.type='button';card.className='home-vehicle-card';
    card.append(safeText('span','🚘','home-car-icon'),safeText('b',label),safeText('small',vehicle.make.toUpperCase()+' · Factory manual'));
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
async function loadLiveManualIndex(vehicle) {
  const key = manualKey(vehicle, 'index.html');
  $('#documentList').replaceChildren(safeText('p','Loading the factory table of contents…','empty-state'));
  try {
    const html = await fetchManualHtml(key);
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    const heading = parsed.querySelector('h1')?.textContent?.trim() || titleFromFolder(vehicle.name);
    $('#vehicleManualTitle').textContent = heading;
    $('#sectionTitle').textContent = 'Manual sections';
    $('#crumb').textContent = heading.toUpperCase() + ' / FACTORY CONTENTS';
    const list = $('#documentList');
    list.replaceChildren();
    const links = [...parsed.querySelectorAll('a[href]')].filter(link => /pages\/\d+\.html(?:$|[?#])/.test(link.getAttribute('href') || ''));
    for (const link of links) {
      const href = link.getAttribute('href');
      const pageId = href.match(/pages\/(\d+)\.html/)[1];
      const label = link.textContent.trim() || 'Manual page ' + pageId;
      const item = document.createElement('button');
      item.type = 'button'; item.className = 'document-item';
      item.append(safeText('span','▤','doc-icon'));
      const details = document.createElement('span');
      details.append(safeText('b',label),safeText('small','Factory manual · Page '+pageId));
      item.append(details,safeText('span','›','doc-arrow'));
      item.addEventListener('click',()=>showLiveManualPage(vehicle,pageId,label));
      list.append(item);
    }
    if (!links.length) list.append(safeText('p','No linked sections were found in this manual index.','empty-state'));
    $('.list-footnote').textContent = 'LIVE R2 CONTENT · ' + links.length + ' LINKS IN THE FACTORY INDEX';
    setMobileView('library',heading,'Select a factory manual section or procedure.');
    announce('Loaded '+links.length+' entries from the factory manual index.');
  } catch (error) {
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
