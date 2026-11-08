(()=>{"use strict";
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const manualLinks=[{label:"Home",href:"/",icon:"⌂"},{label:"Scion",href:"/manuals/scion-service-manual/",icon:"◉"},{label:"Subaru",href:"/manuals/subaru-service-manual/",icon:"✦"},{label:"Manuals",href:"/",icon:"▤"}];
const current=location.pathname.toLowerCase();const active=current.includes("scion")?1:current.includes("subaru")?2:current==="/"||current.endsWith("index.html")?0:3;
const shell=document.createElement("div");shell.innerHTML='<header class="mn-brand"><a href="/" aria-label="MotorNote Manual Library home"><span class="mn-phoenix" aria-hidden="true">🔥</span></a><a href="/"><strong>MOTORNOTE</strong><small>MANUAL LIBRARY</small></a><button class="mn-menu" type="button" aria-label="Open search">⌕</button></header><nav class="mn-bottom" aria-label="Main navigation">'+manualLinks.map((x,i)=>'<a href="'+x.href+'" '+(i===active?'aria-current="page"':'')+'><span aria-hidden="true">'+x.icon+'</span>'+x.label+'</a>').join("")+'</nav><button class="mn-fab" type="button" aria-label="Search factory manuals">⌕</button><div class="mn-search-backdrop" aria-hidden="true"><section class="mn-search-panel" role="dialog" aria-modal="true" aria-labelledby="mn-search-title"><div class="mn-search-head"><h2 id="mn-search-title">⌕ Search Manuals</h2><button class="mn-close" type="button" aria-label="Close search">×</button></div><form class="mn-search-form"><input class="mn-search-input" type="search" placeholder="Search a part, system, symptom…" aria-label="Search factory manuals" maxlength="4000"><button class="mn-submit" type="submit">Search</button></form><div class="mn-filters" aria-label="Filter search results"><button class="mn-filter" type="button" data-filter="all" aria-pressed="true">All Manuals</button><button class="mn-filter" type="button" data-filter="scion" aria-pressed="false">Scion</button><button class="mn-filter" type="button" data-filter="subaru" aria-pressed="false">Subaru</button></div><section class="mn-recent" aria-label="Recent searches"><div class="mn-recent-head"><strong>Recent searches</strong><button class="mn-recent-clear" type="button">Clear</button></div><div class="mn-recent-list"></div></section><div class="mn-status" aria-live="polite">Search across the indexed factory manuals.</div><div class="mn-results"></div></section></div>';
document.body.prepend(shell);
const backdrop=shell.querySelector(".mn-search-backdrop"),input=shell.querySelector(".mn-search-input"),status=shell.querySelector(".mn-status"),results=shell.querySelector(".mn-results");let filter="all",lastQuery="",opener=null;const RECENT_KEY="motornote.manualSearch.recent.v1",RECENT_LIMIT=6;let recent=[];try{const saved=JSON.parse(localStorage.getItem(RECENT_KEY)||"[]");if(Array.isArray(saved))recent=saved.filter(x=>typeof x==="string").slice(0,RECENT_LIMIT)}catch{}
function renderRecent(){const host=shell.querySelector(".mn-recent-list"),section=shell.querySelector(".mn-recent");if(!host||!section)return;section.hidden=recent.length===0;host.innerHTML=recent.map(q=>'<button class="mn-recent-item" type="button" data-recent-query="'+esc(q)+'"><span aria-hidden="true">↺</span><span>'+esc(q)+'</span></button>').join("")}function rememberSearch(q){recent=[q,...recent.filter(x=>x.toLowerCase()!==q.toLowerCase())].slice(0,RECENT_LIMIT);try{localStorage.setItem(RECENT_KEY,JSON.stringify(recent))}catch{}renderRecent()}renderRecent();shell.querySelector(".mn-recent-clear").addEventListener("click",()=>{recent=[];try{localStorage.removeItem(RECENT_KEY)}catch{}renderRecent()});shell.querySelector(".mn-recent-list").addEventListener("click",e=>{const button=e.target.closest("[data-recent-query]");if(!button)return;const q=button.dataset.recentQuery;input.value=q;rememberSearch(q);runSearch(q)});function open(event){opener=event?.currentTarget||document.activeElement;backdrop.setAttribute("aria-hidden","false");document.body.style.overflow="hidden";setTimeout(()=>input.focus(),50)}
function close(){backdrop.setAttribute("aria-hidden","true");document.body.style.overflow="";if(opener&&typeof opener.focus==="function")opener.focus()}
shell.querySelectorAll(".mn-fab,.mn-menu").forEach(b=>b.addEventListener("click",open));shell.querySelector(".mn-close").addEventListener("click",close);backdrop.addEventListener("click",e=>{if(e.target===backdrop)close()});
shell.querySelectorAll(".mn-filter").forEach(b=>b.addEventListener("click",()=>{filter=b.dataset.filter;shell.querySelectorAll(".mn-filter").forEach(x=>x.setAttribute("aria-pressed",String(x===b)));if(lastQuery)runSearch(lastQuery)}));
function itemDetails(c,query){
 const item=c?.item||{},m=item.metadata||{},path=m.source_path||item.key||"";
 const raw=String(c?.text||"").trim();
 const frontmatter=raw.replace(/^---\s*[\s\S]*?\n---\s*/,"");
 const imageMatch=frontmatter.match(/!\[[^\]]*\]\(([^)]+)\)/)||frontmatter.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i);
 let preview="";
 if(imageMatch){try{const u=new URL(imageMatch[1],location.origin+"/"+path);if(u.origin===location.origin&&/\.(png|jpe?g|webp|gif|svg)$/i.test(u.pathname))preview=u.href}catch{}}
 const heading=frontmatter.split(/\r?\n/).map(x=>x.trim()).find(x=>/^#{1,4}\s+/.test(x));
 const title=m.title||m.page_title||(heading?heading.replace(/^#{1,6}\s+/,"").replace(/[\x60*_]/g,"").trim():"")||((path.split("/").pop()||"Manual page").replace(/\.html?$/i,"").replace(/[-_]/g," "));
 const folder=path.split("/")[1]||"";
 const vehicle=[m.make,m.model].filter(Boolean).join(" ")||folder.replace(/-service-manual$/i,"").replace(/-/g," ").replace(/\b\w/g,x=>x.toUpperCase());
 const tokens=query.toLowerCase().split(/[^a-z0-9]+/).filter(x=>x.length>1);
 const cleanLine=line=>line.replace(/!\[[^\]]*\]\([^)]*\)/g," ").replace(/<img[^>]*>/gi," ").replace(/\[([^\]]+)\]\([^)]+\)/g,"$1").replace(/<[^>]+>/g," ").replace(/^\s*[-|:]{2,}\s*$/,"").replace(/^\s*#{1,6}\s*/,"").replace(/[\x60*_|]/g," ").replace(/\s+/g," ").trim();
 const lines=frontmatter.split(/\r?\n/).map(cleanLine).filter(x=>x.length>8&&!/^description:/i.test(x)&&!/repair manual for the .*including/i.test(x)&&!/^(home|scion|subaru|testing and inspection|expand all|collapse all)$/i.test(x));
 const ranked=lines.map((line,i)=>({line,i,hits:tokens.filter(t=>line.toLowerCase().includes(t)).length})).sort((a,b)=>b.hits-a.hits||a.i-b.i);
 const snippet=(ranked.find(x=>x.hits>0)?.line||lines[0]||title).slice(0,250);
 const matched=[...new Set(tokens.filter(t=>(title+" "+snippet).toLowerCase().includes(t)))];
 return{path,title,vehicle,text:snippet,matched,preview,hasImage:!!imageMatch,documentType:m.document_type||""};
}
function runSearch(q){
 lastQuery=q;status.classList.remove("mn-error");status.textContent="Searching the manual library…";results.innerHTML="";
 fetch("/api/search",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({query:q,topK:20})})
 .then(async r=>{const data=await r.json();if(!r.ok){const detail=[data.error,data.detail,...(Array.isArray(data.errors)?data.errors.map(x=>x.message||String(x)):[])].filter(Boolean).join(" — ");const error=new Error(detail||"Search service unavailable");error.status=r.status;throw error}if(Array.isArray(data.errors)&&data.errors.length)throw new Error(data.errors.map(x=>x.message||String(x)).join(" — ")||"Search returned an indexing error");return data})
 .then(data=>{
  const unique=new Map(),contentSeen=new Set();let duplicates=0;
  for(const chunk of (Array.isArray(data.chunks)?data.chunks:[])){
   const row=itemDetails(chunk,q);if(!row.path)continue;
   if(filter!=="all"&&!row.path.toLowerCase().includes(filter))continue;
   const key=row.path.toLowerCase();const signature=(row.vehicle+"|"+row.title+"|"+row.text.slice(0,120)).toLowerCase();if(unique.has(key)||contentSeen.has(signature)){duplicates++;continue}unique.set(key,row);contentSeen.add(signature);
  }
  const rows=[...unique.values()];
  status.textContent=rows.length+" distinct results"+(duplicates?" · "+duplicates+" duplicate copies grouped":"");
  if(!rows.length){results.innerHTML='<p class="mn-status">No matching indexed pages. Try another term or select All Manuals.</p>';return}
  results.innerHTML=rows.map((x,i)=>{
   const href="/"+x.path.replace(/^\/+/, "").split("/").map(encodeURIComponent).join("/");
   const rank=i===0?"Top search result":i<4?"Strong candidate":"Related passage";
   const tags=(x.matched.length?'<span class="mn-match-why">Matched: '+esc(x.matched.join(" · "))+'</span>':"")+(x.hasImage?'<span class="mn-result-tag">Diagram / image</span>':"");
   const page=(x.path.match(/(?:^|\/)pages\/(\d+)\.html?$/i)||[])[1]||x.path.split("/").pop();
   return '<a class="mn-result" href="'+esc(href)+'"><div class="mn-result-top"><span class="mn-result-rank">'+rank+'</span><span class="mn-result-tag">'+esc(x.documentType||"Factory manual")+'</span></div><div class="mn-result-main">'
    +(x.preview?'<img class="mn-result-thumb" src="'+esc(x.preview)+'" alt="" loading="lazy">':"")
    +'<div class="mn-result-copy"><strong>'+esc(x.title)+'</strong><small>'+esc(x.vehicle)+' · Page '+esc(page)+'</small><p>'+esc(x.text)+'</p></div></div><div class="mn-result-foot">'+tags+'</div></a>';
  }).join("");
 }).catch(e=>{status.classList.add("mn-error");status.textContent=(e.message||"Search failed.")+(e.status?" (HTTP "+e.status+")":"");results.innerHTML=""})
}
shell.querySelector(".mn-search-form").addEventListener("submit",e=>{e.preventDefault();const q=input.value.trim();if(q){rememberSearch(q);runSearch(q)}});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&backdrop.getAttribute("aria-hidden")==="false")close()});
window.MotorNoteSearch={open,close};
})();