import {emptyProject,normalize,buildViews,themeCards,tagsFor,validateAnalysis,validateLinks,fingerprint,publicProject,privatePackage,candidatePairs,updateProject} from './core.mjs';
import {readZip,makeZip} from './zip.mjs';
const $=id=>document.getElementById(id);
let project=emptyProject(),mode='graph',running=false,aborted=false,currentJob=null,preview=null,isExample=false,taskLimit=60,tasksUsed=0,stopReason='';
const notice=message=>{$('notice').textContent=message;};
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);}
function jsonDownload(value,name){download(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}),name);}
function guard(action){return async()=>{try{await action();}catch(e){notice(e.message||'操作未完成，请检查材料后重试。');}};}
async function loadFiles(selected) {
  if(running)throw Error('请先取消生成，再更换项目。');
  const files=Object.create(null);let total=0;
  if(selected.length>4000)throw Error('最多选择 4000 个资料文件。');
  for(const file of selected) {
    total+=file.size;if(total>20*1024*1024)throw Error('选择的文件总量不能超过 20 MB。');
    if(file.name.toLowerCase().endsWith('.zip')){const entries=await readZip(await file.arrayBuffer());for(const [name,content]of Object.entries(entries)){if(Object.hasOwn(files,name))throw Error(`文件名重复：${name}`);files[name]=content;}continue;}
    if(!/\.(json|md)$/i.test(file.name))throw Error('只接收 JSON、Markdown 和 ZIP。');
    const name=file.webkitRelativePath||file.name;
    if(Object.hasOwn(files,name))throw Error(`文件名重复：${name}`);
    files[name]=await file.text();
  }
  const candidates=Object.entries(files).filter(([name])=>name.endsWith('.json')).map(([name,content])=>{try{return[name,JSON.parse(content)];}catch{throw Error(`JSON 无法读取：${name}`);}});
  const restored=candidates.filter(([,v])=>v.format==='reading-universe-private');
  const bookFiles=candidates.filter(([name,v])=>name.split('/').at(-1)==='books.json'&&Array.isArray(v.books));
  const primary=restored.length?restored:bookFiles.length?bookFiles:candidates.filter(([,v])=>Array.isArray(v.books));
  if(primary.length!==1)throw Error(primary.length?'找到多份书目或项目包，请只选择一个人的一份数据。':'没有找到 books.json 或私人项目包。');
  const incoming=normalize(primary[0][1],files);project=$('update-existing').checked&&project.books.length&&!isExample?updateProject(project,incoming):incoming;preview=null;isExample=false;
  $('wordlist').value=project.settings.wordlist.join('，');$('aliases').value=Object.entries(project.settings.aliases).map(([a,b])=>a+'='+b).join('\n');render();notice(`已在本机读取 ${project.books.length} 本书。原始文件没有上传。`);
}
for(const id of ['files','folder'])$(id).addEventListener('change',guard(async()=>{const files=[...$(id).files];$(id).value='';if(files.length)await loadFiles(files);}));
$('example').onclick=guard(async()=>{if(running)throw Error('请先取消生成。');project=normalize(await(await fetch('examples/author-public.json')).json());isExample=true;preview=null;render();notice('正在浏览作者公开案例。创建自己的版图时会使用全新的项目。');});
$('reset').onclick=guard(async()=>{if(running)throw Error('请先取消生成。');if(project.books.length&&!confirm('清空当前项目？尚未下载的内容将丢失。'))return;project=emptyProject();preview=null;isExample=false;$('key').value='';$('sharing').hidden=true;render();notice('已清空浏览器中的当前项目。');});
function showView() {
  const views=buildViews(preview||project);window.__readingViews=views;
  const params=new URLSearchParams();if(mode==='universe')params.set('universe','');if(mode==='poster')params.set('poster','');params.set('revision',Date.now());
  $('viewer').src='viewer.html?'+params;
  for(const id of ['graph','universe','poster'])$(id).classList.toggle('active',id===mode);
}
for(const id of ['graph','universe','poster'])$(id).onclick=()=>{mode=id;showView();};
function fillSelect(el,rows,current){el.replaceChildren();for(const [value,label]of rows){const o=document.createElement('option');o.value=value;o.textContent=label;el.append(o);}if(rows.some(r=>r[0]===current))el.value=current;}
function render(){
  $('workspace').hidden=!project.books.length;
  if(!project.books.length){$('viewer').src='about:blank';return;}
  const evidence=project.books.reduce((s,b)=>s+b.evidence.length,0),cards=themeCards(project);
  const visibleLinks=buildViews(project).graph.edges.filter(e=>!e.theme).length;
  $('project-kind').textContent=isExample?'作者的公开案例':'我的阅读';$('counts').textContent=`${project.books.length} 本书 · ${Object.keys(cards).length} 个主题 · ${visibleLinks} 条具体关联`;
  $('estimate').textContent=`共有 ${evidence} 个材料片段。每本最多发送勾选的前 12 段，每段最多 1500 字、每本总共最多 6000 字；每批 8 本。最多分析 40 对候选关联。费用由你的 AI 服务商收取，失败重试也可能计费。已分析且未改变的书会跳过。`;
  const current=$('book-select').value;fillSelect($('book-select'),project.books.map(b=>[b.id,b.title]),current);fillSelect($('link-target'),project.books.map(b=>[b.id,b.title]),$('link-target').value);
  fillSelect($('card-select'),Object.keys(cards).map(t=>[t,t]),$('card-select').value);renderBook();renderCard();renderLinks();showView();
}
function renderBook(){const b=project.books.find(b=>b.id===$('book-select').value);if(!b)return;$('book-tags').value=tagsFor(project,b).join('，');const a=project.analysis[b.id];$('book-basis').textContent=project.edits.books[b.id]?'主题由本人修改；生成时保留。':a?.basis==='evidence'?`来自材料分析 · 证据 ${a.evidenceIds.length} 段`:a?.basis==='imported'?'来自已有整理；未回查原文。':a?'只有书名或未引用有效证据，结果属于推断。':'尚未分析。';$('evidence').replaceChildren();if(a?.summary){const p=document.createElement('p');p.textContent='整理结果：'+a.summary;$('evidence').append(p);}for(const e of b.evidence){const label=document.createElement('label'),check=document.createElement('input');check.type='checkbox';check.checked=e.included!==false;check.onchange=()=>{e.included=check.checked;};label.append(check,document.createTextNode('允许这个片段用于 AI 分析'));const p=document.createElement('p');p.textContent=`${e.kind} · ${e.id}\n${e.text}`;$('evidence').append(label,p);}}
function renderCard(){$('card-text').value=themeCards(project)[$('card-select').value]||'';}
function renderLinks(){const container=$('links-editor');container.replaceChildren();for(const [kind,rows]of [['generated',project.links],['manual',project.edits.links]])rows.forEach((l,index)=>{const row=document.createElement('div');row.className='link-row';const a=project.books.find(b=>b.id===l.source)?.title||l.source,b=project.books.find(b=>b.id===l.target)?.title||l.target;const desc=document.createElement('span');desc.textContent=`${a} → ${b}\n${l.reason}\n${l.basis==='manual'?'本人确认':l.basis==='imported'?'已有整理':'材料分析'} · ${(l.evidenceIds||[]).join('、')}`;const remove=document.createElement('button');remove.textContent='移除';remove.onclick=()=>{if(l.targetType==='book')project.edits.removedPairs.push([l.source,l.target].sort().join('|'));rows.splice(index,1);render();};row.append(desc,remove);container.append(row);});}
$('book-select').onchange=renderBook;$('card-select').onchange=renderCard;
$('edit-tags').onclick=guard(async()=>{const id=$('book-select').value;project.edits.books[id]={tags:[...new Set($('book-tags').value.split(/[,，]/).map(t=>t.trim()).filter(t=>t&&t.length<=60&&!['__proto__','constructor','prototype'].includes(t)))].slice(0,10)};preview=null;render();notice('主题修改已保留，请下载项目包保存。');});
$('edit-card').onclick=guard(async()=>{const theme=$('card-select').value;if(!theme)return;project.edits.cards[theme]=$('card-text').value.slice(0,20000);preview=null;render();notice('主题卡修改已保留，重新生成不会覆盖。');});
$('add-link').onclick=guard(async()=>{const source=$('book-select').value,target=$('link-target').value,reason=$('link-reason').value.trim();if(source===target||!reason)throw Error('请选择另一本书，并填写关联理由。');project.edits.links=validateLinks([...project.edits.links,{source,target,targetType:'book',type:$('link-type').value,reason,evidenceIds:[],basis:'manual'}],project,true);preview=null;render();notice('已保存本人确认的关联。');});
$('save').onclick=guard(async()=>{jsonDownload(privatePackage(project),'我的阅读宇宙-私人项目.json');notice('私人项目包已下载。不含 API key；请把它保存在私人位置。');});
$('provider').onchange=()=>{$('model').value=$('provider').value==='deepseek'?'deepseek-chat':'gpt-4.1-mini';};
const progress=(percent,message)=>{$('progress').hidden=false;$('progress').querySelector('progress').value=percent;$('progress').querySelector('span').textContent=message;};
async function api(path,options={}){const response=await fetch(path,{...options,headers:{'Content-Type':'application/json',...options.headers}});const body=await response.json();if(!response.ok)throw Error(body.error||'服务暂不可用。');return body;}
function fragments(b){let remaining=6000;const evidence=[];for(const e of b.evidence.filter(e=>e.included!==false).slice(0,12)){if(!remaining)break;const fragment=e.text.slice(0,Math.min(1500,remaining));remaining-=fragment.length;evidence.push({id:e.id,text:fragment});}return {id:b.id,title:b.title,author:b.author,evidence};}
async function job(stage,books,credentials,pairs=[]){
  if(aborted)throw Error('生成已取消。');
  if(tasksUsed>=taskLimit){aborted=true;stopReason='已达到本轮分析任务上限，已完成结果保留。';throw Error(stopReason);}
  tasksUsed++;
  const {id}=await api('/api/jobs',{method:'POST',body:JSON.stringify({...credentials,stage,books:books.map(fragments),pairs,wordlist:project.settings.wordlist})});currentJob=id;
  try{
    while(!aborted){const result=await api('/api/jobs/'+id);if(result.status==='complete')return result.result;if(result.status==='failed')throw Error(result.error);if(result.status==='cancelled')throw Error('生成已取消。');await new Promise(resolve=>setTimeout(resolve,700));}
    throw Error('生成已取消。');
  }finally{await api('/api/jobs/'+id,{method:'DELETE'}).catch(()=>{});if(currentJob===id)currentJob=null;}
}
$('generate').onclick=guard(async()=>{
  if(running)return;if(!$('consent').checked)throw Error('请先确认你允许发送待分析片段。');if(!$('key').value.trim())throw Error('请填写你自己的 API key。');
  const credentials={provider:$('provider').value,model:$('model').value.trim(),key:$('key').value.trim()};
  project.settings.wordlist=[...new Set($('wordlist').value.split(/[,，]/).map(t=>t.trim()).filter(t=>t&&!['__proto__','constructor','prototype'].includes(t)))].slice(0,100);
  project.settings.aliases={};for(const line of $('aliases').value.split('\n')){const [a,b]=line.split('=').map(v=>v.trim());if(a&&b&&a.length<=60&&b.length<=60&&!['__proto__','constructor','prototype'].includes(a)&&!['__proto__','constructor','prototype'].includes(b))project.settings.aliases[a]=b;}
  const todo=[];for(const b of project.books){const hash=await fingerprint(b,project.settings,credentials.model+'@'+credentials.provider);if(project.analysis[b.id]?.fingerprint!==hash)todo.push([b,hash]);}
  running=true;aborted=false;stopReason='';tasksUsed=0;taskLimit=Math.max(1,Math.min(300,Number($('task-budget').value)||60));$('generate').disabled=true;$('cancel').hidden=false;$('save').disabled=true;$('key').value='';
  notice(`待分析 ${todo.length} 本，书目分析约 ${Math.ceil(todo.length/8)} 个任务，关联分析最多 7 个任务。每任务最多 2 次调用；本轮上限 ${taskLimit} 个任务。`);
  let failures=[];
  try{
    await api('/api/session');
    for(let i=0;i<todo.length;i+=8){if(aborted)break;const batch=todo.slice(i,i+8);progress(Math.round(i/Math.max(todo.length,1)*70),`正在分析 ${i+1}–${Math.min(i+8,todo.length)} / ${todo.length} 本`);
      try{const result=await job('books',batch.map(([b])=>b),credentials);for(const [b,hash]of batch){const a=result.books?.find(a=>a.id===b.id);if(!a){failures.push(b.title);continue;}project.links=project.links.filter(l=>l.basis!=='evidence'||(l.source!==b.id&&l.target!==b.id));project.analysis[b.id]={...validateAnalysis(a,b,project.settings.wordlist),fingerprint:hash};}}
      catch(e){if(aborted)break;failures.push(...batch.map(([b])=>b.title));notice('这一批未完成：'+e.message+' 已完成的结果会保留。');}
    }
    if(!aborted){const pairs=candidatePairs(project);for(let i=0;i<pairs.length;i+=6){if(aborted)break;progress(75+Math.round(i/Math.max(pairs.length,1)*20),`正在核对关联 ${i+1}–${Math.min(i+6,pairs.length)} / ${pairs.length}`);const batch=pairs.slice(i,i+6),books=[...new Map(batch.flat().map(b=>[b.id,b])).values()];try{const result=await job('links',books,credentials,batch.map(([a,b])=>[a.id,b.id]));project.links=validateLinks([...project.links,...(result.links||[])],project,true);for(const pair of batch){const ids=pair.map(b=>b.id).sort();project.linkCache[ids.join('|')]=ids.map(id=>project.analysis[id]?.fingerprint||'').join('|');}}catch(e){if(!aborted)failures.push('关联批次 '+(i/6+1));}}}
    preview=null;render();progress(100,aborted?stopReason||'已取消，已完成结果保留。':failures.length?`部分完成：${failures.length} 项未完成。`:'生成完成。');notice(aborted?(stopReason||'生成已取消。')+' 请保存已完成的项目，再重新填写 key 续跑。':failures.length?`未完成：${failures.join('、')}。下载项目包保留成果，重新填写 key 可续跑。`:'主题与关联已生成。请检查依据、修订判断，再保存项目。');
  }finally{credentials.key='';running=false;$('generate').disabled=false;$('cancel').hidden=true;$('save').disabled=false;}
});
$('cancel').onclick=guard(async()=>{aborted=true;if(currentJob)await api('/api/jobs/'+currentJob,{method:'DELETE'}).catch(()=>{});notice('已请求取消；已经发出的 AI 调用可能仍会计费。');});
$('share').onclick=()=>{const container=$('share-books');container.replaceChildren();for(const b of project.books){const l=document.createElement('label'),check=document.createElement('input');check.type='checkbox';check.value=b.id;check.checked=true;l.append(check,document.createTextNode(b.title));container.append(l);}$('sharing').hidden=false;$('sharing').scrollIntoView({behavior:'smooth'});};
for(const [id,value]of [['select-all',true],['select-none',false]])$(id).onclick=()=>{for(const input of $('share-books').querySelectorAll('input'))input.checked=value;};
function selectedPublic(){const selected=[...$('share-books').querySelectorAll('input:checked')].map(e=>e.value);if(!selected.length)throw Error('请至少选择一本要公开的书。');return publicProject(project,selected,{metrics:$('share-metrics').checked,relations:$('share-relations').checked});}
$('preview-public').onclick=guard(async()=>{const result=selectedPublic();preview=result.project;showView();$('share-report').textContent=`预览 ${preview.books.length} 本，隐藏 ${result.report.excluded} 本。${result.report.notice}`;$('viewer').scrollIntoView({behavior:'smooth'});});
$('close-share').onclick=()=>{preview=null;$('sharing').hidden=true;showView();};
$('download-public').onclick=guard(async()=>{
  const result=selectedPublic(),views=buildViews(result.project),files={};
  for(const name of ['viewer.html','viewer-data.js','universe.js','lib/vis-network.min.js']){const response=await fetch(name);if(!response.ok)throw Error('公开包资源读取失败。');files[name==='viewer.html'?'index.html':name]=await response.text();}
  // Escape script delimiters even though these are external data scripts.
  const safeJSON=v=>JSON.stringify(v).replace(/</g,'\\u003c');
  files['graph_data.js']='window.GRAPH = '+safeJSON(views.graph)+';';files['universe_data.js']='window.UNIVERSE = '+safeJSON(views.universe)+';';
  files['README.txt']='这是你选择分享的阅读版图。打开 index.html 看图谱，index.html?universe 看星空。上传整个目录即可静态托管。包内每个文件均可公开访问。';
  download(makeZip(files),'我的阅读宇宙-公开网站.zip');$('share-report').textContent=result.report.notice+' '+result.report.rejected.join(' ');
});
$('download-image').onclick=guard(async()=>{
  const {project:p}=selectedPublic(),cards=themeCards(p),canvas=document.createElement('canvas');canvas.width=1080;canvas.height=1440;const ctx=canvas.getContext('2d');ctx.fillStyle='#0a0e15';ctx.fillRect(0,0,1080,1440);ctx.fillStyle='#e8b575';ctx.font='24px sans-serif';ctx.fillText('READING UNIVERSE',75,100);ctx.fillStyle='#edf0f5';ctx.font='58px serif';ctx.fillText('我的阅读宇宙',75,230);ctx.font='25px sans-serif';ctx.fillStyle='#9ca7b6';ctx.fillText(`${p.books.length} 本书 · ${Object.keys(cards).length} 个主题`,75,295);
  const names=Object.keys(cards).slice(0,16);names.forEach((name,i)=>{const x=160+(i%4)*240,y=460+Math.floor(i/4)*220;ctx.fillStyle='#83aaff';ctx.beginPath();ctx.arc(x,y,5+Math.min(20,p.books.filter(b=>tagsFor(p,b).includes(name)).length),0,Math.PI*2);ctx.fill();ctx.font='22px sans-serif';ctx.fillStyle='#edf0f5';ctx.fillText(name.slice(0,10),x-65,y+60);});ctx.font='24px sans-serif';ctx.fillStyle='#9ca7b6';ctx.fillText('读过的书，在这里相遇。',75,1340);canvas.toBlob(blob=>download(blob,'我的阅读宇宙-分享.png'));
});
$('theme').onclick=()=>{const light=document.documentElement.dataset.theme!=='light';document.documentElement.dataset.theme=light?'light':'dark';$('theme').textContent=light?'关灯':'开灯';try{localStorage.setItem('readingmap_theme',light?'light':'');}catch{}if(project.books.length)showView();};
try{if(localStorage.getItem('readingmap_theme')==='light')$('theme').click();}catch{}
window.addEventListener('beforeunload',event=>{if(project.books.length&&!isExample){event.preventDefault();event.returnValue='';}});
render();
