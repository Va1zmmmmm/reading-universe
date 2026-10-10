// Generated public-only offline reader; rebuild with tools/build_public_reader.mjs.
(function(){
// Pure public-only contract, also bundled into the offline reader. No private-project imports.
function validatePublicAtlas(input){
  const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
  const array=(v,max)=>{if(!Array.isArray(v)||v.length>max)throw Error('公开内容格式或数量不正确。');return v;};
  const text=(v,max=12000)=>{if(typeof v!=='string'||!v.trim()||v.length>max)throw Error('公开内容缺少文字或超过长度限制。');return v;};
  const id=(v,max=200)=>{if(typeof v!=='string'||!v||v.length>max||/[|\u0000-\u001f]/.test(v)||['__proto__','constructor','prototype'].includes(v))throw Error('公开内容标识不正确。');return v;};
  const routeId=v=>{id(v);if(!/^[A-Za-z0-9_-]+$/.test(v))throw Error('公开线索标识不能含路径分隔符。');return v;};
  if(!object(input)||input.format!=='reading-atlas-public'||input.version!==1)throw Error('公开探索版本不受支持。');
  const out={format:'reading-atlas-public',version:1,title:'页间 · 公开探索',books:[],themes:[]},bookIds=new Set();
  out.books=array(input.books,1500).map(b=>{if(!object(b))throw Error('公开书目格式不正确。');const bid=id(b.id);if(bookIds.has(bid))throw Error('公开书目重复。');bookIds.add(bid);return {id:bid,title:text(b.title,300),author:typeof b.author==='string'?b.author.slice(0,300):''};});
  const themeIds=new Set();out.themes=array(input.themes,100).map(t=>{
    if(!object(t))throw Error('公开主题格式不正确。');const tid=routeId(t.id);if(themeIds.has(tid))throw Error('公开主题重复。');themeIds.add(tid);
    const theme={id:tid,basis:t.basis==='ai-draft'?'ai-draft':'curated',name:text(t.name,100),title:text(t.title),opening:text(t.opening),entry:text(t.entry),start:routeId(t.start),endTitle:text(t.endTitle),endBody:text(t.endBody),nodes:[]};
    const nodeIds=new Set();theme.nodes=array(t.nodes,200).map(n=>{
      if(!object(n))throw Error('公开线索格式不正确。');const nid=routeId(n.id);if(nodeIds.has(nid))throw Error('公开线索重复。');nodeIds.add(nid);
      const node={id:nid,title:text(n.title),subtitle:text(n.subtitle),context:text(n.context),observation:text(n.observation),bookId:id(n.bookId),materialKind:['highlight','review','card','note'].includes(n.materialKind)?n.materialKind:'note',choices:[]};
      if(!bookIds.has(node.bookId))throw Error('公开线索指向未公开的书。');
      if(n.quote!=null)node.quote={excerpt:text(n.quote.excerpt,20000)};
      node.choices=array(n.choices,12).map(c=>({target:routeId(c.target),label:text(c.label,300),hint:text(c.hint,2000),bridge:text(c.bridge)}));
      if(new Set(node.choices.map(c=>c.target)).size!==node.choices.length)throw Error('公开方向重复。');return node;
    });
    if(!nodeIds.has(theme.start))throw Error('公开主题缺少开场。');
    for(const n of theme.nodes)for(const c of n.choices)if(!nodeIds.has(c.target))throw Error('公开方向断路。');
    const byId=new Map(theme.nodes.map(n=>[n.id,n])),seen=new Set(),visit=nid=>{if(seen.has(nid))return;seen.add(nid);byId.get(nid).choices.forEach(c=>visit(c.target));};visit(theme.start);
    if(seen.size!==theme.nodes.length)throw Error('公开主题存在不可达线索。');return theme;
  });
  if(!out.themes.length)throw Error('请至少选择一个公开探索主题。');return out;
}

// Bundled after public-atlas-contract.mjs by tools/build_public_reader.mjs.
const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const kindLabel=k=>({highlight:'划线',review:'读者书评',card:'读书卡',note:'笔记与批注'})[k]||'材料';
let data=null,theme=null,state=null;const sessions=new Map();
function first(t){return {current:t.start,visits:[{id:t.start,from:null}]};}
function readLocation(){
  const q=new URLSearchParams(location.search),t=data.themes.find(t=>t.id===q.get('theme'))||data.themes[0],byId=new Map(t.nodes.map(n=>[n.id,n]));
  const walk=(q.get('walk')||'').split(',').filter(Boolean),visits=[],seen=new Set();
  try{
    if(walk.length>200)throw Error();
    for(const item of walk){const [id,from]=item.split('~');if(!byId.has(id)||seen.has(id)||!visits.length&&(id!==t.start||from)||visits.length&&(!seen.has(from)||!byId.get(from).choices.some(c=>c.target===id)))throw Error();seen.add(id);visits.push({id,from:from||null});}
    const current=q.get('node')||t.start;if(!seen.has(current)||!visits.length)throw Error();return {t,s:{current,visits}};
  }catch{return {t,s:sessions.get(t.id)||first(t)};}
}
function writeLocation(replace=false){const q=new URLSearchParams({theme:theme.id,node:state.current,walk:state.visits.map(v=>v.id+(v.from?'~'+v.from:'')).join(',')});history[replace?'replaceState':'pushState']({},'',location.pathname+'?'+q);}
function activate(t,s,replace=false){theme=t;state=s||sessions.get(t.id)||first(t);sessions.set(t.id,state);writeLocation(replace);render();window.scrollTo(0,0);}
function go(id,from=null){
  if(!theme.nodes.some(n=>n.id===id))return;
  if(!state.visits.some(v=>v.id===id)){
    if(!from||!state.visits.some(v=>v.id===from)||!theme.nodes.find(n=>n.id===from)?.choices.some(c=>c.target===id))return;
    state.visits.push({id,from});
  }
  state.current=id;writeLocation();render();if(id===theme.start)window.scrollTo(0,0);else $('public-story').scrollIntoView({block:'start'});
}
function buttons(container,rows){container.innerHTML=rows.map(r=>`<button data-node="${esc(r.target)}" ${r.from?`data-from="${esc(r.from)}"`:''}><strong>${esc(r.label)}</strong>${r.hint?`<small>${esc(r.hint)}</small>`:''}</button>`).join('');container.querySelectorAll('button').forEach(b=>b.onclick=()=>go(b.dataset.node,b.dataset.from||null));}
function render(){
  const node=theme.nodes.find(n=>n.id===state.current),seen=new Set(state.visits.map(v=>v.id)),book=data.books.find(b=>b.id===node.bookId),visit=state.visits.find(v=>v.id===node.id),previous=theme.nodes.find(n=>n.id===visit.from),bridge=previous?.choices.find(c=>c.target===node.id)?.bridge;
  $('public-entry').textContent=theme.entry;$('public-title').textContent=theme.title;$('public-opening').textContent=theme.opening;
  $('public-range').textContent=`公开精选 · ${theme.nodes.length} 处线索 · 已遇见 ${seen.size} 处`;
  $('public-breadcrumb').textContent=theme.name+' › '+node.title;
  $('public-story').innerHTML=`${bridge?`<p class="bridge">从「${esc(previous.title)}」来到这里：${esc(bridge)}</p>`:''}<small class="citation">${theme.basis==='ai-draft'?'AI 整理草稿 · 主人选择公开':'主人整理的阅读线索'}</small><h2>${esc(node.title)}</h2><small class="citation">${esc(node.subtitle)}</small><p>${esc(node.context)}</p>${node.quote?`<blockquote>${esc(node.quote.excerpt)}</blockquote><div class="citation">《${esc(book.title)}》 · ${esc(kindLabel(node.materialKind))}</div>`:'<p class="withheld">这段原文没有公开。这里保留主人选择分享的解读与出处。</p>'}<p>${esc(node.observation)}</p>`;
  $('public-book').textContent=book.title;$('public-author').textContent=book.author||'作者资料未公开';$('public-kind').textContent=kindLabel(node.materialKind)+(node.quote?' · 仅展示所选引文':' · 原文未公开');
  buttons($('public-choices'),node.choices.filter(c=>!seen.has(c.target)).map(c=>({...c,from:node.id})));
  const read=node.choices.filter(c=>seen.has(c.target));$('public-seen').hidden=!read.length;buttons($('public-seen').querySelector('div'),read);$('public-seen').open=false;
  const frontier=[];if(!node.choices.some(c=>!seen.has(c.target)))for(const v of state.visits)for(const c of theme.nodes.find(n=>n.id===v.id).choices)if(!seen.has(c.target)&&!frontier.some(row=>row.target===c.target))frontier.push({...c,from:v.id,hint:`从「${theme.nodes.find(n=>n.id===v.id).title}」继续：${c.hint}`});
  buttons($('public-frontier'),frontier);if(frontier.length){const p=document.createElement('p');p.textContent='这条去路先停在这里，还可以回到已遇见的位置，继续另一种方向。';$('public-frontier').prepend(p);}
  const stopped=!node.choices.some(c=>!seen.has(c.target));$('public-ending').hidden=!stopped;
  $('public-ending').innerHTML=`<h3>${esc(theme.endTitle)}</h3><p>${esc(theme.endBody)}</p><small>${seen.size===theme.nodes.length?'本次公开的线索已经全部遇见，可以回看或换一个主题。':'这里只展示主人选出的公开部分，可以带着问题停下，也可以换路。'}</small>`;
  buttons($('public-walk'),state.visits.map(v=>({target:v.id,label:theme.nodes.find(n=>n.id===v.id).title})));
  $('public-walk').querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.dataset.node===node.id));
  $('public-themes').innerHTML=data.themes.map(t=>`<button data-theme="${esc(t.id)}" class="${t.id===theme.id?'active':''}">${esc(t.name)}<small>${t.nodes.length} 处公开线索</small></button>`).join('');
  $('public-themes').querySelectorAll('button').forEach(b=>b.onclick=()=>activate(data.themes.find(t=>t.id===b.dataset.theme)));
}
function start(value){try{data=validatePublicAtlas(value);$('public-layout').hidden=false;$('public-error').hidden=true;const initial=readLocation();activate(initial.t,initial.s,true);}catch{$('public-layout').hidden=true;$('public-error').hidden=false;$('public-error').textContent='这份公开探索暂时无法打开：格式、书目或线索连接不完整。没有加载私人项目。';}}
$('public-restart').onclick=()=>go(theme.start);$('public-night').onclick=()=>document.body.classList.toggle('dark');
$('public-home').onclick=event=>{if(data){event.preventDefault();go(theme.start);}};
window.addEventListener('popstate',()=>{if(data){const next=readLocation();theme=next.t;state=next.s;sessions.set(theme.id,state);render();}});
if(window.parent!==window){$('public-graph').hidden=true;try{start(window.parent.__publicAtlas);}catch{start(null);}}
else{const script=document.createElement('script');script.src='public-data.js';script.onload=()=>start(window.READING_ATLAS_PUBLIC);script.onerror=()=>start(null);document.head.append(script);}

})();
