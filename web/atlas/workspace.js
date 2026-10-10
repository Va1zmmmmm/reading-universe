import {coverUrl} from './workspace-core.mjs';
import {normalizeProject,projectFromFiles,packageProject,findEvidence as evidenceFor,materialLabel} from './workspace-core.mjs';
import {readZip} from './workspace-zip.mjs';
let themes=[],projectKey='',dirty=false;

const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clean=s=>s.replace(/（[^）]*）|【[^】]*】|\([^)]*\)/g,'').trim()||s;
let branch,nodes=new Map();
const sessions=new Map();
let project,steps=[],at=0,found=new Map(),edges=new Map(),pins=new Set(),notes=new Map(),noticeTimer,revisiting=false,navigationIndex=0;
const current=()=>nodes.get(steps[at]?.id);
const bookFor=n=>project.books.find(b=>String(b.id??b.bookId)===n.quote.bookId);
const edgeFor=(from,to)=>nodes.get(from)?.choices.find(c=>c.target===to);
const edgeKey=(from,to)=>`${from}|${to}`;
const motion=()=>matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth';

function cover(b){const url=coverUrl(b.cover);return `<span class="cover">${url?`<img data-cover src="${esc(url)}" alt="《${esc(b.title)}》封面" loading="lazy" decoding="async" referrerpolicy="no-referrer"><span class="cover-fallback" hidden>${esc(clean(b.title))}</span>`:`<span class="cover-fallback">${esc(clean(b.title))}</span>`}</span>`;}
function source(n){const b=bookFor(n),e=evidenceFor(project,n.quote).evidence;return `<div class="reader-source">${cover(b)}<span><strong>${esc(clean(b.title))}</strong><small>${esc(b.author)} · ${esc(materialLabel(e))}</small></span></div>`;}
function quotation(n,full=false){const e=evidenceFor(project,n.quote).evidence;return `<figure class="source-quote"><blockquote>${esc(n.quote.excerpt)}</blockquote><figcaption>${esc(clean(bookFor(n).title))} · ${esc(materialLabel(e))}</figcaption>${full?`<details><summary>展开完整原材料</summary><p>${esc(e.text)}</p></details>`:''}</figure>`;}
function choiceHTML(n,c,extra='choice'){return `<button class="${extra}" data-follow="${esc(c.target)}"><strong>${esc(c.label)} ↗</strong><small>${esc(c.hint)}</small><span>${found.has(c.target)?'回看已遇到的线索':'沿这条线索发现下一处'}</span></button>`;}
function updateDiscovery(step){
  if(!found.has(step.id))found.set(step.id,{depth:step.from?(found.get(step.from)?.depth??0)+1:0,parent:step.from||null});
  if(step.from)edges.set(edgeKey(step.from,step.id),{from:step.from,to:step.id});
}
function parseWalk(raw){
  const tokens=(raw||branch.start).split(',');
  if(tokens.length>80||tokens[0]!==branch.start)throw Error('这条路线暂时无法恢复，已回到本主题开场。');
  const result=[],seen=new Set();
  for(let i=0;i<tokens.length;i++){
    const revisit=tokens[i].startsWith('~'),id=revisit?tokens[i].slice(1):tokens[i];
    if(!nodes.has(id)||i===0&&revisit)throw Error('这条路线暂时无法恢复，已回到本主题开场。');
    const previous=result.at(-1)?.id;
    if(i&&(!revisit&&!edgeFor(previous,id)||revisit&&!seen.has(id)))throw Error('这条路线暂时无法恢复，已回到本主题开场。');
    result.push({id,from:i&&!revisit?previous:null,kind:i?(revisit?'revisit':'follow'):'start'});seen.add(id);
  }
  return result;
}
// Preserve the first traversal of each connection, and restore an old looping URL compactly.
function compactWalk(walk,index){
  const result=[],seen=new Set(),connections=new Map(),positions=[];
  for(const step of walk){
    const key=step.from&&edgeKey(step.from,step.id);
    if(!seen.has(step.id)||key&&!connections.has(key)){
      if(step.from&&result.at(-1)?.id!==step.from)result.push({id:step.from,from:null,kind:'revisit'});
      result.push(step);seen.add(step.id);if(key)connections.set(key,result.length-1);
    }
    positions.push(key?connections.get(key):result.findIndex(s=>s.id===step.id));
  }
  return {steps:result,at:positions[index]??result.length-1};
}
function encodeWalk(){return steps.map(s=>(s.kind==='revisit'?'~':'')+s.id).join(',');}
function writeURL(replace=false){
  const q=new URLSearchParams({theme:branch.id});if(steps.length>1)q.set('walk',encodeWalk());if(at!==steps.length-1)q.set('at',at);if(revisiting)q.set('view','review');
  const url=location.pathname+(q.size?'?'+q:'');
  if(!replace)navigationIndex++;
  window.history[replace?'replaceState':'pushState']({format:'workspace-journey',projectKey,theme:branch.id,walk:encodeWalk(),at,review:revisiting,position:navigationIndex},'',url);
  $('back').disabled=navigationIndex===0;
}
function saveTheme(){if(branch)sessions.set(branch.id,{steps,at,found,edges,pins,notes,revisiting});}
function activateTheme(id){
  if(branch?.id===id)return;
  saveTheme();const next=themes.find(t=>t.id===id)||themes[0];
  if(!next)return;
  branch=next;nodes=new Map(branch.nodes.map(n=>[n.id,n]));
  clearTimeout(noticeTimer);$('notice').hidden=true;
  const saved=sessions.get(branch.id);
  if(saved)({steps,at,found,edges,pins,notes,revisiting}=saved);
  else {steps=[{id:branch.start,from:null,kind:'start'}];at=0;found=new Map();edges=new Map();pins=new Set();notes=new Map();revisiting=false;updateDiscovery(steps[0]);}
  $('grown-map').open=false;document.body.classList.remove('menu-open','reader-open');
}
function renderThemeHeading(){
  document.title=`页间 · ${branch.name}`;
  $('theme-title').textContent=branch.title;$('opening').textContent=branch.opening;$('entry').textContent=branch.entry;
  $('route-heading').innerHTML=`${esc(branch.name)}<span>${esc(branch.title)}</span>`;
  $('full-theme').onclick=showCatalog;
  $('theme-switcher').innerHTML=themes.map(t=>`<button data-theme="${esc(t.id)}" class="${t.id===branch.id?'active':''}" aria-pressed="${t.id===branch.id}"><span>${esc(t.name)}</span><small>${t.id===branch.id?found.size:sessions.get(t.id)?.found.size||0} / ${t.nodes.length} 处</small></button>`).join('');
  $('theme-switcher').querySelectorAll('[data-theme]').forEach(button=>button.onclick=()=>{if(button.dataset.theme===branch.id)return;activateTheme(button.dataset.theme);render();resetReadingPosition();writeURL();});
}
function resetReadingPosition(){$('reader').scrollTop=0;$('workspace').scrollTop=0;}
function selectStep(index,push=true){if(!Number.isInteger(index)||!steps[index])return;dirty=true;at=index;revisiting=true;render();resetReadingPosition();if(push)writeURL();locateCurrent();}
function arrive(id,from=null){
  if(!nodes.has(id)||from&&!edgeFor(from,id))return;
  if(!from&&!found.has(id))return;
  if(!from&&steps.length&&id===current().id){locateCurrent();return;}
  const known=found.has(id);
  const existing=steps.findIndex(step=>step.id===id&&(!from||step.from===from));
  if(known&&existing>=0){selectStep(existing);document.body.classList.remove('menu-open');notice(`回看「${nodes.get(id).title}」`);return;}
  const checkpoint=from&&steps.at(-1)?.id!==from;
  if(steps.length+(checkpoint?2:1)>80){notice('这页已保留80次访问。可以从来路回看，或先下载这次探索。');return;}
  dirty=true;const step={id,from,kind:from?'follow':'revisit'};
  if(checkpoint)steps.push({id:from,from:null,kind:'revisit'});
  steps.push(step);at=steps.length-1;revisiting=known;updateDiscovery(step);render();resetReadingPosition();if(innerWidth<=950&&document.body.classList.contains('reader-open'))$('close-reader').focus({preventScroll:true});writeURL();locateCurrent();
  notice(known?`沿另一条路回看「${nodes.get(id).title}」`:`新遇到「${nodes.get(id).title}」`);
  document.body.classList.remove('menu-open');
}
function togglePin(id){dirty=true;if(pins.has(id))pins.delete(id);else pins.add(id);renderNavigation();document.querySelectorAll('[data-pin]').forEach(button=>{const held=pins.has(button.dataset.pin);button.setAttribute('aria-pressed',String(held));button.textContent=held?'◇ 已留在线索袋':'＋ 留下这处线索';});}
function bind(root){
  root.querySelectorAll('[data-follow]').forEach(el=>el.onclick=()=>arrive(el.dataset.follow,el.dataset.origin||current().id));
  root.querySelectorAll('[data-node]').forEach(el=>el.onclick=()=>{if(el.dataset.node!==current().id)arrive(el.dataset.node);if(innerWidth<=950)openReader();});
  root.querySelectorAll('[data-step]').forEach(el=>el.onclick=()=>{selectStep(Number(el.dataset.step));document.body.classList.remove('menu-open');});
  root.querySelectorAll('[data-pin]').forEach(el=>el.onclick=()=>togglePin(el.dataset.pin));
  root.querySelectorAll('[data-cover]').forEach(img=>{const fail=()=>{img.hidden=true;img.nextElementSibling.hidden=false;};img.addEventListener('error',fail,{once:true});if(img.complete&&!img.naturalWidth)fail();});
}
function renderNavigation(){
  const unique=steps.map((step,i)=>({step,i})).filter(({step,i})=>steps.findIndex(s=>s.id===step.id)===i);
  $('walk').innerHTML=unique.map(({step,i})=>`<button data-step="${i}" class="${step.id===current().id?'active':''}" aria-current="${step.id===current().id?'step':'false'}"><i aria-hidden="true"></i><span>${esc(nodes.get(step.id).title)}<small>${step.kind==='start'?'从这里出发':`从「${esc(nodes.get(step.from)?.title||'来路')}」发现`}</small></span></button>`).join('');
  $('pin-count').textContent=pins.size||'';
  $('bag').innerHTML=pins.size?[...pins].map(id=>`<button data-node="${id}"><span>◇ ${esc(nodes.get(id).title)}</span><span>↗</span></button>`).join(''):'<p>遇到想再看的地方，可以先留下来。</p>';
  bind($('walk'));bind($('bag'));
  locateNavigation();
  $('back').disabled=navigationIndex===0;
  $('trail').innerHTML=`<span>${esc(branch.name)}</span><span>›</span><button id="where">${esc(current().title)}</button>`;$('where').onclick=locateCurrent;
}
function renderMap(){
  const n=current(),pending=n.choices.filter(c=>!found.has(c.target)),layers=new Map();
  for(const [id,entry] of found){if(!layers.has(entry.depth))layers.set(entry.depth,[]);layers.get(entry.depth).push(id);}
  const pendingDepth=(found.get(n.id)?.depth??0)+1;
  if(pending.length&&!layers.has(pendingDepth))layers.set(pendingDepth,[]);
  const depths=[...layers.keys()].sort((a,b)=>a-b);
  $('columns').innerHTML=depths.map(depth=>`<div class="node-column ${layers.get(depth).length?'':'frontier-column'}" data-depth="${depth}">${layers.get(depth).map(id=>{
    const node=nodes.get(id),b=bookFor(node),selected=id===n.id;
    return `<article id="clue-${id}" class="clue-node ${selected?'active':''}" data-map-node="${id}"><button class="node-open" data-node="${id}" aria-pressed="${selected}"><span class="node-type"><span>${id===branch.start?'起点':'已经遇到'}</span><span>${selected?'正在看':'回看 ↗'}</span></span><h2>${esc(node.title)}</h2><p class="node-subtitle">${esc(node.subtitle)}</p><span class="node-source">${cover(b)}<span>${esc(clean(b.title))}<small>原文线索</small></span></span><p class="node-quote">“${esc(node.quote.excerpt.slice(0,85))}${node.quote.excerpt.length>85?'…':''}”</p></button><button class="node-pin" data-pin="${id}" aria-pressed="${pins.has(id)}">${pins.has(id)?'◇ 已留在线索袋':'＋ 留下这处线索'}</button></article>`;
  }).join('')}${depth===pendingDepth?pending.map(c=>`<button class="frontier" data-follow="${c.target}" data-frontier="${c.target}"><span>还可以追</span><strong>${esc(c.label)} ↗</strong><small>${esc(c.hint)}</small></button>`).join(''):''}</div>`).join('');
  const bookCount=new Set([...found.keys()].map(id=>nodes.get(id).quote.bookId)).size;
  $('discovery-status').textContent=`已经遇到 ${found.size} 处线索 · 来自 ${bookCount} 本书`;
  bind($('columns'));requestAnimationFrame(drawConnections);
}
function point(el,side){const b=el.getBoundingClientRect(),origin=$('map-inner').getBoundingClientRect();return {x:(side==='right'?b.right:b.left)-origin.left,y:(b.top+b.bottom)/2-origin.top};}
function drawConnections(){
  if(!steps.length||!$('grown-map').open)return;
  const svg=$('connections'),inner=$('map-inner'),active=steps[at];
  const width=inner.scrollWidth,height=inner.scrollHeight;svg.setAttribute('viewBox',`0 0 ${width} ${height}`);svg.style.width=width+'px';svg.style.height=height+'px';
  const path=(from,to,kind)=>{
    if(!from||!to)return '';
    const a=point(from,'right'),b=point(to,'left');
    const forward=b.x>a.x;
    const d=forward?`M${a.x} ${a.y} C${a.x+32} ${a.y},${b.x-32} ${b.y},${b.x} ${b.y}`:`M${a.x} ${a.y} C${a.x+50} ${Math.min(a.y,b.y)-95},${b.x-50} ${Math.min(a.y,b.y)-95},${b.x} ${b.y}`;
    return `<path d="${d}" class="connection ${forward?'':'revisit'} ${kind}"/>`;
  };
  let html='';
  for(const edge of edges.values())html+=path($('clue-'+edge.from),$('clue-'+edge.to),active.from===edge.from&&active.id===edge.to?'active':'');
  for(const option of current().choices){const to=$('columns').querySelector(`[data-frontier="${option.target}"]`);if(to)html+=path($('clue-'+current().id),to,'pending');}
  svg.innerHTML=html;
}
function locateCurrent(){const node=$('clue-'+current().id);if(!node||!$('grown-map').open)return;requestAnimationFrame(()=>{const origin=$('map-inner').getBoundingClientRect(),b=node.getBoundingClientRect();$('map-scroll').scrollTo({left:Math.max(0,b.left-origin.left-28),top:Math.max(0,b.top-origin.top-25),behavior:motion()});});}
function revealMap(){$('grown-map').open=true;$('grown-map').scrollIntoView({block:'start',behavior:motion()});drawConnections();locateCurrent();}
function renderStory(){
  const n=current(),step=steps[at],incoming=step.from&&edgeFor(step.from,n.id);
  $('opening').hidden=revisiting||step.kind!=='start';
  const lead=incoming?`<div class="why-next"><span>接着「${esc(nodes.get(step.from).title)}」往下想</span><p>${esc(incoming.bridge)}</p></div>`:'';
  $('story').innerHTML=`${lead}<p class="story-kicker">${branch.basis==='ai-draft'?'AI 整理草稿 · ':''}${revisiting?'回看这段原文':step.kind==='start'?'从这里读起':'这一段在讲什么'}</p><h2>${esc(n.title)}</h2><p class="scene">${esc(n.context)}</p>${quotation(n)}<p class="reading-thread">${esc(n.observation)}</p><button id="story-original" class="story-context-link">展开完整原文与笔记 ↗</button>`;
  $('story-original').onclick=openReader;
}
function locateNavigation(){
  const active=$('walk').querySelector('.active'),walk=$('walk');if(!active||!walk.getClientRects().length)return;
  const top=active.offsetTop,bottom=top+active.offsetHeight;
  if(bottom>walk.scrollTop+walk.clientHeight)walk.scrollTop=bottom-walk.clientHeight;
  if(top<walk.scrollTop)walk.scrollTop=top;
}
function renderReader(){
  const n=current(),step=steps[at],incoming=step.from&&edgeFor(step.from,n.id),e=evidenceFor(project,n.quote).evidence,b=bookFor(n);
  const material=Array.isArray(b.evidence)?b.evidence.filter(item=>item.included!==false&&typeof item.text==='string'&&item.text):[];
  $('reader').innerHTML=`<div class="reader-top"><span>原文与笔记</span><button id="close-reader" aria-label="收起阅读面板">收起 ×</button></div><div class="reader-content"><p class="story-source-head">可以在这里查完整材料，和上一段放在一起读；也可以留一句自己的想法。</p>${source(n)}<p class="context-summary">${esc(n.context)}</p>${quotation(n,true)}${incoming?`<details class="bridge-compare"><summary>对照上一段 · ${esc(nodes.get(step.from).title)}</summary>${quotation(nodes.get(step.from),true)}</details>`:''}<details class="archive"><summary>这本书的已带入材料 · ${material.length} 段</summary>${material.map(item=>`<details class="material"><summary>${esc(materialLabel(item))} · ${esc(item.text.slice(0,32))}${item.text.length>32?'…':''}</summary><p>${esc(item.text)}</p></details>`).join('')}</details><label class="note-label">此刻想到的，先留一句<textarea id="thought" maxlength="2000" placeholder="可以是疑问、一个联系，或暂时说不清的感觉。" aria-label="当前线索的个人笔记">${esc(notes.get(n.id)||'')}</textarea><small>不会发送或自动保存；保存项目包后，下次可继续。</small></label><div class="reader-tools"><button data-pin="${n.id}" aria-pressed="${pins.has(n.id)}">${pins.has(n.id)?'◇ 已留在线索袋':'＋ 留下这处线索'}</button><button id="save-note">↓ 下载路径与笔记</button></div><p class="source-note">引文可在已带入材料中回查；引入、衔接与提问来自本项目的线索整理。</p></div>`;
  $('close-reader').onclick=()=>{document.body.classList.remove('reader-open');$('open-reader').focus({preventScroll:true});};
  $('close-reader').hidden=innerWidth>950;
  $('thought').oninput=e=>{notes.set(n.id,e.target.value);dirty=true;};
  $('save-note').onclick=download;
  bind($('reader'));
}
function renderChoices(){
  const n=current(),fresh=n.choices.filter(c=>!found.has(c.target)),read=n.choices.filter(c=>found.has(c.target));
  let forward='';
  if(fresh.length)forward=`<div class="continue-heading"><span>接下来，发现新的线索</span></div><div class="choice-grid">${fresh.map(c=>choiceHTML(n,c)).join('')}</div>`;
  else {
    const remaining=[...found.keys()].flatMap(id=>nodes.get(id).choices.filter(c=>!found.has(c.target)).map(c=>({from:id,choice:c}))).filter((route,i,all)=>all.findIndex(r=>r.choice.target===route.choice.target)===i);
    forward=`<div class="branch-pause"><strong>${remaining.length?(n.choices.length?'这处相连的段落，已经读过了。':'这条线索先读到这里。'):esc(branch.endTitle)}</strong><p>${remaining.length?'如果还想继续，这个主题还有下面未读的方向。':esc(branch.endBody)}</p></div>`;
    if(remaining.length)forward+=`<div class="continue-heading"><span>换一条还没读过的方向</span></div><div class="choice-grid">${remaining.map(({from,choice:c})=>`<button class="choice" data-follow="${esc(c.target)}" data-origin="${esc(from)}"><strong>${esc(c.label)} ↗</strong><small>从「${esc(nodes.get(from).title)}」接着看 · ${esc(c.hint)}</small><span>未读线索</span></button>`).join('')}</div>`;
    else forward+=`<button class="other-materials" id="more-materials">去本项目书目与材料继续翻 ↗</button>`;
  }
  const review=read.length?`<details class="review-choices"><summary>回看与这里相连的原文 · ${read.length} 处</summary><p>这些是已读段落，回看不会新增线索。</p><div class="choice-grid">${read.map(c=>choiceHTML(n,c)).join('')}</div></details>`:'';
  $('choices').innerHTML=forward+review;bind($('choices'));if($('more-materials'))$('more-materials').onclick=showCatalog;
}
function render(){if(!branch)return;renderThemeHeading();renderNavigation();renderStory();renderMap();renderReader();renderChoices();}
function openReader(){document.body.classList.add('reader-open');if(innerWidth<=950)$('close-reader').focus({preventScroll:true});else {$('reader').scrollTop=0;$('reader').querySelector('.source-quote details').open=true;}}
function notice(text){$('notice').textContent=text;$('notice').hidden=false;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$('notice').hidden=true,3000);}
function download(){
  const route=[...found.entries()].map(([id,entry],i)=>`${i+1}. ${nodes.get(id).title} · 《${clean(bookFor(nodes.get(id)).title)}》${entry.parent?`（从「${nodes.get(entry.parent).title}」发现）`:''}`).join('\n');
  const entries=[...new Set([...pins,...notes.keys()])].filter(id=>pins.has(id)||(notes.get(id)||'').trim()).map(id=>{
    const n=nodes.get(id),e=evidenceFor(project,n.quote).evidence;
    return `### ${n.title}\n\n《${clean(bookFor(n).title)}》 · ${materialLabel(e)}\n\n> ${n.quote.excerpt}\n\n${notes.get(id)||'留待再看。'}`;
  }).join('\n\n');
  const body=`# ${branch.name} · 我的探索记录\n\n按本次首次发现的顺序记录，不重复列出回看，也不表示真实阅读时间顺序。\n\n## 发现的线索\n\n${route}\n\n## 留下的线索与笔记\n\n${entries||'本次尚未保留线索或填写笔记。'}\n\n材料范围：当前打开的阅读项目。记录可能含私人阅读材料与笔记，请自行决定分享范围。\n`;
  const url=URL.createObjectURL(new Blob([body],{type:'text/markdown;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=`页间-${branch.name}的探索记录.md`;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);notice('已下载这次路径与留下的笔记。');
}
$('download').onclick=download;$('home').onclick=()=>{arrive(branch.start);locateCurrent();};$('back').onclick=()=>{if(navigationIndex>0)history.back();};
$('menu').onclick=()=>{document.body.classList.toggle('menu-open');locateNavigation();};$('open-reader').onclick=openReader;$('fit-current').onclick=revealMap;
$('grown-map').addEventListener('toggle',()=>{if($('grown-map').open){drawConnections();locateCurrent();}});
$('night').onclick=()=>{const night=document.documentElement.dataset.theme!=='night';document.documentElement.dataset.theme=night?'night':'day';$('night').textContent=night?'☀':'☾';};
window.addEventListener('resize',()=>{if(branch)drawConnections();if($('close-reader'))$('close-reader').hidden=innerWidth>950;});
let pan=null;
$('map-scroll').addEventListener('pointerdown',event=>{
  if(event.pointerType!=='mouse'||event.button!==0||event.target.closest('button'))return;
  const scroller=$('map-scroll');pan={x:event.clientX,y:event.clientY,left:scroller.scrollLeft,top:scroller.scrollTop};
  scroller.setPointerCapture(event.pointerId);scroller.classList.add('panning');
});
$('map-scroll').addEventListener('pointermove',event=>{
  if(!pan)return;const scroller=$('map-scroll');scroller.scrollTo({left:pan.left+pan.x-event.clientX,top:pan.top+pan.y-event.clientY,behavior:'instant'});
});
for(const type of ['pointerup','pointercancel'])$('map-scroll').addEventListener(type,()=>{pan=null;$('map-scroll').classList.remove('panning');});
window.addEventListener('popstate',event=>{
  if(!project)return;
  if(event.state?.projectKey!==projectKey){
    navigationIndex=0;
    if(branch)writeURL(true);else history.replaceState({projectKey},'',location.pathname);
    notice('已打开另一份项目，旧项目来路不会带入这里。');return;
  }
  if(!branch)return;
  try{
    const q=new URL(location.href).searchParams;activateTheme(q.get('theme'));
    const incoming=parseWalk(q.get('walk'));
    const desired=Number(q.get('at')??incoming.length-1),requested=Number.isInteger(desired)&&desired>=0&&desired<incoming.length?desired:incoming.length-1;
    // Keep later discoveries when moving back in browser history, without repeating visits.
    const matches=incoming.every((step,i)=>steps[i]?.id===step.id&&steps[i]?.kind===step.kind&&steps[i]?.from===step.from);
    if(matches)at=requested;else {const restored=compactWalk([...steps,...incoming],steps.length+requested);steps=restored.steps;at=restored.at;}
    incoming.forEach(updateDiscovery);revisiting=q.get('view')==='review'||incoming.findIndex(s=>s.id===incoming[requested].id)<requested;navigationIndex=event.state?.format==='workspace-journey'?event.state.position:0;
    showJourney();resetReadingPosition();locateCurrent();writeURL(true);
  }catch(error){notice(error.message);}
});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){document.body.classList.remove('menu-open','reader-open');}
  if(e.key==='Tab'&&innerWidth<=950&&document.body.classList.contains('reader-open')){
    const items=[...$('reader').querySelectorAll('button,summary,textarea')].filter(el=>el.getClientRects().length),first=items[0],last=items.at(-1);
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
  }
});

function snapshotJourney(){
  saveTheme();
  return {activeTheme:branch?.id||'',sessions:[...sessions].map(([theme,s])=>({theme,steps:s.steps,at:s.at,pins:[...s.pins],notes:[...s.notes],revisiting:s.revisiting}))};
}
function install(input,isExample=false){
  const next=normalizeProject(input); // Reject everything before replacing the current project.
  project=next;themes=next.exploration.themes;branch=null;nodes=new Map();sessions.clear();
  projectKey=crypto.randomUUID();navigationIndex=0;dirty=false;
  steps=[];at=0;found=new Map();edges=new Map();pins=new Set();notes=new Map();
  for(const s of next.journey.sessions){
    const f=new Map(),es=new Map();
    for(const step of s.steps){if(!f.has(step.id))f.set(step.id,{depth:step.from?(f.get(step.from)?.depth??0)+1:0,parent:step.from||null});if(step.from)es.set(edgeKey(step.from,step.id),{from:step.from,to:step.id});}
    sessions.set(s.theme,{steps:s.steps,at:s.at,found:f,edges:es,pins:new Set(s.pins),notes:new Map(s.notes),revisiting:s.revisiting});
  }
  $('project-status').textContent=(isExample?'作者样板 · ':'')+next.name;
  $('save-project').disabled=false;$('landing').hidden=true;$('replace-hint').hidden=false;
  $('book-search').value='';$('tag-filter').innerHTML='<option value="">全部书目</option>';
  const tags=[...new Set(next.books.filter(b=>b.included!==false).flatMap(b=>b.tags))];
  $('tag-filter').insertAdjacentHTML('beforeend',tags.map(t=>`<option value="${esc(t)}">${esc(t)}</option>`).join(''));
  document.body.classList.remove('reader-open','menu-open');
  if(themes.length){activateTheme(next.journey.activeTheme||themes[0].id);showJourney();writeURL(true);}
  else {showCatalog();history.replaceState({projectKey},'',location.pathname);}
  $('project-dialog').close();$('import-error').hidden=true;
  notice(isExample?'作者样板已打开。导入你的项目会整份替换它。':`已打开「${next.name}」。材料留在当前浏览器中。`);
  window.dispatchEvent(new Event('reading-project-change'));
}
function showJourney(){
  if(!branch)return;
  $('catalog').hidden=true;$('journey-layout').hidden=false;render();
  $('menu').style.visibility='';
}
function showCatalog(){
  if(!project){openProject();return;}
  saveTheme();$('landing').hidden=true;$('journey-layout').hidden=true;$('catalog').hidden=false;
  document.body.classList.remove('menu-open','reader-open');$('menu').style.visibility='hidden';
  $('catalog-title').textContent=project.name;
  const books=project.books.filter(b=>b.included!==false),materials=books.flatMap(b=>b.evidence.filter(e=>e.included!==false));
  $('catalog-description').textContent=`${books.length} 本可显示书目 · ${materials.length} 段已带入材料 · ${themes.length} 条已整理的主题线索。`+(themes.length?'书目与标签不限制探索；可以随时回来翻材料。':'目前还没有问题线索。先翻自己的材料；引入、衔接和选择方向需要依据这些材料整理。');
  $('resume').hidden=!themes.length;renderCatalog();
}
function renderCatalog(){
  if(!project)return;
  const query=$('book-search').value.trim().toLocaleLowerCase(),tag=$('tag-filter').value;
  const books=project.books.filter(b=>b.included!==false&&(!query||(b.title+' '+b.author).toLocaleLowerCase().includes(query))&&(!tag||b.tags.includes(tag)));
  $('catalog-books').innerHTML=books.length?books.map(b=>`<button class="catalog-book" data-book="${esc(b.id)}">${cover(b)}<span><strong>${esc(clean(b.title))}</strong><small>${esc(b.author||'作者资料未带入')}</small><small>${esc(b.tags.join(' / '))}</small><small class="material-count">${b.evidence.filter(e=>e.included!==false).length} 段材料 · 打开看看 ↗</small></span></button>`).join(''):'<p class="quiet-state">这里暂时没有可显示的书目。可以换一个标签，或调整搜索。</p>';
  $('catalog-books').querySelectorAll('[data-book]').forEach(el=>el.onclick=()=>showBook(el.dataset.book));bind($('catalog-books'));
}
function showBook(id){
  const book=project.books.find(b=>b.id===id&&b.included!==false);if(!book)return;
  const materials=book.evidence.filter(e=>e.included!==false);
  $('book-materials').innerHTML=`<header>${cover(book)}<div><h3>${esc(clean(book.title))}</h3><p>${esc(book.author||'作者资料未带入')}</p><p>${esc(book.tags.join(' / '))}</p></div></header>${materials.length?materials.map(e=>`<details><summary>${esc(materialLabel(e))} · ${esc(e.text.slice(0,70))}${e.text.length>70?'…':''}</summary><p>${esc(e.text)}</p></details>`).join(''):'<p>这次带入的资料里，尚没有这本书的划线、书评或读书卡。可以把对应材料与书目一起导入，再从这里读。</p>'}`;
  bind($('book-materials'));$('book-dialog').showModal();
}
function openProject(){
  $('replace-hint').hidden=!project;$('import-error').hidden=true;
  if(!$('project-dialog').open)$('project-dialog').showModal();
}
function saveProject(){
  if(!project)return;
  const payload=packageProject(project,snapshotJourney()),body=JSON.stringify(payload,null,2);
  if(new TextEncoder().encode(body).length>20*1024*1024){notice('项目超过 20 MB，无法按当前限制重新打开；请先拆分资料。');return;}
  const url=URL.createObjectURL(new Blob([body],{type:'application/json;charset=utf-8'})),a=document.createElement('a');
  a.href=url;a.download=`页间-${project.name.replace(/[\\/:*?"<>|]/g,'_')}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);dirty=false;
  notice('已下载项目包，含书目、材料、主题线索、来路和笔记。下次打开它继续。');
}
let busy=false,pending=null;
function installOrStage(data,isExample=false){
  const next=normalizeProject(data);
  if(project&&dirty){
    pending={next,isExample};openProject();
    $('import-error').hidden=false;$('import-error').textContent='当前探索有未保存的记录。你可以先保存，再打开另一份项目。';
    const actions=document.createElement('div');actions.className='import-options';
    const save=document.createElement('button');save.textContent='先保存当前项目';save.onclick=saveProject;
    const proceed=document.createElement('button');proceed.textContent='打开新项目';proceed.onclick=()=>{const p=pending;pending=null;actions.remove();install(p.next,p.isExample);};
    actions.id='pending-actions';$('pending-actions')?.remove();actions.append(save,proceed);$('import-error').after(actions);return;
  }
  pending=null;$('pending-actions')?.remove();install(next,isExample);
}
function importError(error){openProject();$('import-error').hidden=false;$('import-error').textContent=error.message||'资料暂时未能打开，请检查文件。';}
async function withImport(action){
  if(busy)return;busy=true;
  const buttons=['choose-files','choose-folder','load-example','first-example','first-import'];buttons.forEach(id=>$(id).disabled=true);
  try{await action();}catch(error){importError(error);}finally{busy=false;buttons.forEach(id=>$(id).disabled=false);}
}
async function loadFiles(selected){
  const all=[...selected];if(!all.length)return;
  if(all.length>4000||all.reduce((sum,f)=>sum+f.size,0)>20*1024*1024)throw Error('一次最多 4000 份文件，合计不能超过 20 MB。');
  const files=Object.create(null);let size=0;
  const add=(name,value)=>{
    if(Object.hasOwn(files,name))throw Error('资料里有重复文件名，请一次打开一个项目。');
    size+=new TextEncoder().encode(value).length;
    if(size>40*1024*1024||Object.keys(files).length>=4000)throw Error('资料解开后超过限制，请拆成几个项目。');files[name]=value;
  };
  for(const f of all){
    const name=f.webkitRelativePath||f.name;
    if(/\.zip$/i.test(name)){for(const [n,v]of Object.entries(await readZip(await f.arrayBuffer())))add(n,v);}
    else if(/\.(json|md)$/i.test(name))add(name,await f.text());
  }
  installOrStage(projectFromFiles(files));
}
async function loadExample(){
  const response=await fetch('../examples/author-public.json');if(!response.ok)throw Error('公开案例暂时未能打开。');
  const input=await response.json();input.name='作者公开案例';installOrStage(input,true);
}
$('first-import').onclick=openProject;$('manage-project').onclick=()=>project?showCatalog():openProject();
// From the catalog, the same action also offers opening a different project.
const openAnother=document.createElement('button');openAnother.id='open-another';openAnother.textContent='打开另一份项目';openAnother.onclick=openProject;
document.querySelector('.catalog-tools').append(openAnother);
$('project-home').onclick=()=>project?showCatalog():openProject();
$('first-example').onclick=()=>withImport(loadExample);$('load-example').onclick=()=>withImport(loadExample);
$('choose-files').onclick=()=>$('import-files').click();$('choose-folder').onclick=()=>$('import-folder').click();
for(const id of ['import-files','import-folder'])$(id).onchange=()=>{const files=[...$(id).files];$(id).value='';withImport(()=>loadFiles(files));};
$('close-project').onclick=()=>{$('project-dialog').close();pending=null;$('pending-actions')?.remove();};
$('project-dialog').addEventListener('cancel',()=>{pending=null;$('pending-actions')?.remove();});
$('close-book').onclick=()=>$('book-dialog').close();$('resume').onclick=showJourney;
$('save-project').onclick=saveProject;$('book-search').oninput=renderCatalog;$('tag-filter').onchange=renderCatalog;
window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
$('menu').style.visibility='hidden';

// The separate compose entry uses this small API; ordinary workspace stays local-only.
export function explorationWorkspace(){return project?{key:projectKey,project:packageProject(project,snapshotJourney()),themeName:branch?.name||''}:null;}
export function addExploration(theme,expectedKey){
  if(!project||projectKey!==expectedKey)throw Error('当前项目已变化，这份草稿没有加入。请在新项目中重新选择材料。');
  const next=packageProject(project,snapshotJourney());
  if(next.exploration.themes.some(t=>t.id===theme.id))throw Error('这个草稿已经加入过项目。');
  next.exploration.themes.push(theme);next.journey.activeTheme=theme.id;
  // Both schema and source validation finish before touching the open project.
  const validated=normalizeProject(next);install(validated);dirty=true;
  notice('新线索已加入；之前的来路和笔记保留。保存项目包，下次继续。');
}

export function openTransferredProject(value){installOrStage(value);}
export function projectNotice(message){notice(message);}
export function markProjectSaved(){dirty=false;}
