import {explorationWorkspace,openTransferredProject,projectNotice,markProjectSaved} from './atlas/workspace.js?v=1';
import {privatePackage,publicProject,publicExploration,buildViews} from './core.mjs';
import {makeZip} from './zip.mjs';
const $=id=>document.getElementById(id);
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);}
function current(){const snapshot=explorationWorkspace();if(!snapshot)throw Error('请先打开自己的项目。');return privatePackage(snapshot.project);}
function guard(action){return async()=>{try{await action();}catch(e){projectNotice(e.message||'操作未完成，当前项目保留。');}};}
const bar=document.querySelector('.top-actions');
const share=document.createElement('button');share.id='share-project';share.textContent='分享精选';share.disabled=true;bar.insertBefore(share,$('night'));
const back=document.createElement('button');back.id='return-universe';back.textContent='带回图谱';back.hidden=true;bar.insertBefore(back,$('night'));
const more=document.createElement('details');more.id='atlas-more';more.innerHTML='<summary aria-label="更多项目操作">更多</summary><div></div>';bar.insertBefore(more,$('night'));
const mobile=matchMedia('(max-width:650px)');
function arrangeActions(){
  more.hidden=!mobile.matches;
  for(const id of ['manage-project','share-project','return-universe']){if(mobile.matches)more.querySelector('div').append($(id));else bar.insertBefore($(id),more);}
  $('open-compose').textContent=mobile.matches?'＋ 整理线索':'＋ 整理新线索';$('save-project').textContent=mobile.matches?'↓ 保存':'↓ 保存项目';
}
mobile.addEventListener('change',arrangeActions);arrangeActions();
more.addEventListener('click',event=>{if(event.target.closest('button'))more.open=false;});
$('save-project').onclick=guard(async()=>{const project=current(),body=JSON.stringify(project,null,2);if(new TextEncoder().encode(body).length>20*1024*1024)throw Error('项目超过20 MB，请保留当前项目并拆分资料。');download(new Blob([body],{type:'application/json;charset=utf-8'}),'页间-私人项目.json');markProjectSaved();projectNotice('已保存完整私人项目：材料、线索、笔记、关联和原有修订均保留。');});
window.addEventListener('reading-project-change',()=>{share.disabled=!explorationWorkspace();});

const dialog=document.createElement('dialog');dialog.id='share-dialog';dialog.className='compose-dialog';
dialog.innerHTML='<header class="dialog-head"><div><h2>选一部分，邀请别人来探索</h2><p>先选书目，再决定是否分享其中的探索线索。个人笔记和未选原文留在私人项目。</p></div><button id="close-share" aria-label="关闭分享">×</button></header><div id="share-books" class="share-books"></div><label><input id="share-metrics" type="checkbox">公开阅读时长与笔记数量</label><label><input id="share-relations" type="checkbox" checked>公开选中书籍的关联结构</label><label><input id="share-exploration" type="checkbox">让访客沿精选线索探索</label><section id="share-trails" hidden><p>选一个主题，再确认开场和每处解读。引文可以分别公开。保留的分支必须从开场走得到；其他分支会从访客的选择里移除。下载包中的公开内容均可被读取。</p><div id="share-permissions"></div></section><div class="draft-actions"><button id="preview-share">看看公开版</button><button id="download-share" class="primary-action">下载公开网站包</button></div><p id="share-report" role="status"></p><iframe id="share-viewer" title="公开内容预览" hidden style="width:100%;height:620px;border:0"></iframe>';
document.body.append(dialog);
const style=document.createElement('style');style.textContent='.share-books{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;margin:22px 0}.share-books label,#share-dialog>label{display:flex;gap:10px;align-items:center;margin:8px 0}#share-dialog input[type=checkbox]{width:auto}#share-dialog .dialog-head{align-items:flex-start}#close-share{border:0;background:transparent;font-size:22px;color:var(--ink)}#atlas-more{position:relative}#atlas-more summary{list-style:none;cursor:pointer;padding:10px 5px}#atlas-more>div{position:absolute;right:0;top:44px;width:160px;padding:8px;background:var(--surface);border:1px solid var(--line);border-radius:6px;box-shadow:0 6px 20px #0002;z-index:50}#atlas-more>div button{display:block;width:100%;text-align:left;padding:12px!important;font-size:14px!important}@media(max-width:650px){.top-actions{gap:5px;flex-wrap:nowrap}.top-actions>button{font-size:12px!important;min-height:40px;padding:6px 4px}.top-actions #night{font-size:18px!important}.topbar .brand{flex-shrink:0}#atlas-more summary{font-size:12px;min-height:40px;display:flex;align-items:center}}';document.head.append(style);
let sharingKey=null,scopeVersion=0;
const sharingStyle=document.createElement('style');sharingStyle.textContent='#share-trails{margin:24px 0;border-top:1px solid var(--line);padding-top:16px}#share-permissions details{border:1px solid var(--line);padding:14px;margin:12px 0}#share-permissions summary{cursor:pointer}#share-permissions label{display:flex;gap:10px;align-items:flex-start;margin:12px 0}#share-permissions p{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.8}#share-permissions blockquote{margin:12px 0;padding:10px 16px;border-left:2px solid var(--line);white-space:pre-wrap}#share-permissions .share-node{border-top:1px solid var(--line);margin-top:18px;padding-top:8px}#share-permissions .share-copy{color:var(--muted);font-size:14px}#share-report:empty{display:none}#share-report{white-space:pre-wrap}';document.head.append(sharingStyle);
sharingStyle.textContent+='#share-permissions summary{font-size:14px;line-height:1.7}';
function clearPreview(){scopeVersion++;delete window.__readingViews;delete window.__publicAtlas;$('share-viewer').src='about:blank';$('share-viewer').hidden=true;}
function check(parent,attribute,value,label,checked=false){const row=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.dataset[attribute]=value;input.checked=checked;row.append(input,document.createTextNode(label));parent.append(row);return input;}
function prose(parent,text,cls='share-copy'){const p=document.createElement('p');p.className=cls;p.textContent=text;parent.append(p);}
function permissionsUI(project){
  $('share-permissions').replaceChildren();
  for(const theme of project.exploration?.themes||[]){
    const details=document.createElement('details');details.dataset.theme=theme.id;
    const summary=document.createElement('summary');summary.textContent=theme.name+' · '+theme.title;details.append(summary);
    check(details,'publishTheme',theme.id,'分享这个主题');
    prose(details,theme.entry+'\n'+theme.opening+'\n\n'+theme.endTitle+'\n'+theme.endBody);
    check(details,'introduction',theme.id,'公开以上开场与停留说明');
    for(const node of theme.nodes){
      const block=document.createElement('div');block.className='share-node';block.dataset.node=node.id;
      check(block,'publishNode',node.id,node.title+(node.id===theme.start?'（开场，必须保留）':''),true);
      prose(block,node.subtitle+'\n'+node.context+'\n'+node.observation);
      for(const choice of node.choices)prose(block,'→ '+choice.label+' · '+choice.hint+'\n'+choice.bridge);
      check(block,'interpretation',node.id,'公开这处解读与去路说明');
      const book=project.books.find(b=>b.id===node.quote.bookId),material=book?.evidence.find(e=>e.id===node.quote.evidenceId);
      prose(block,'出处：《'+(book?.title||'')+'》 · '+(material?.kind==='review'?'读者书评':'阅读材料'));
      const quote=document.createElement('blockquote');quote.textContent=node.quote.excerpt;block.append(quote);
      check(block,'quote',node.id,'同时公开以上引文');details.append(block);
    }
    $('share-permissions').append(details);
  }
  if(!$('share-permissions').children.length)prose($('share-permissions'),'当前项目尚无线索。可以先整理一条，再选择公开；也可以直接分享书目。');
}
share.onclick=guard(async()=>{const snapshot=explorationWorkspace();if(!snapshot)return;sharingKey=snapshot.key;$('share-books').replaceChildren();clearPreview();$('share-report').textContent='';$('share-metrics').checked=false;$('share-relations').checked=true;$('share-exploration').checked=false;$('share-trails').hidden=true;for(const b of snapshot.project.books.filter(b=>b.included!==false)){const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.value=b.id;input.checked=true;label.append(input,document.createTextNode(b.title));$('share-books').append(label);}permissionsUI(snapshot.project);dialog.showModal();});
function selectedPublic(){const snapshot=explorationWorkspace();if(!snapshot||snapshot.key!==sharingKey)throw Error('项目已经改变，请重新选择公开范围。');const ids=[...$('share-books').querySelectorAll('input:checked')].map(e=>e.value);if(!ids.length)throw Error('至少选一本要公开的书。');return publicProject(privatePackage(snapshot.project),ids,{metrics:$('share-metrics').checked,relations:$('share-relations').checked});}
function selectedAtlas(){
  const snapshot=explorationWorkspace(),ids=[...$('share-books').querySelectorAll('input:checked')].map(e=>e.value);
  const permissions=[...$('share-permissions').querySelectorAll('details')].filter(d=>d.querySelector('[data-publish-theme]').checked).map(d=>({id:d.dataset.theme,introduction:d.querySelector('[data-introduction]').checked,nodes:[...d.querySelectorAll('.share-node')].filter(n=>n.querySelector('[data-publish-node]').checked).map(n=>({id:n.dataset.node,interpretation:n.querySelector('[data-interpretation]').checked,quote:n.querySelector('[data-quote]').checked}))}));
  return publicExploration(privatePackage(snapshot.project),ids,permissions);
}
function shareGuard(action){return async()=>{try{await action();}catch(e){clearPreview();$('share-report').textContent=e.message||'操作未完成，当前项目保留。';}};}
function description(result,atlas){return `公开${result.project.books.length}本，隐藏${result.report.excluded}本。`+(atlas?`公开${atlas.themes.length}个主题、${atlas.themes.reduce((sum,t)=>sum+t.nodes.length,0)}处解读、${atlas.themes.reduce((sum,t)=>sum+t.nodes.filter(n=>n.quote).length,0)}处引文。书目主题卡由公开书目重建；完整原材料、个人笔记、日期与评分不包含。访客从开场探索。`:result.report.notice+' 探索文字和个人笔记未公开。');}
$('preview-share').onclick=shareGuard(async()=>{const result=selectedPublic(),atlas=$('share-exploration').checked?selectedAtlas():null;clearPreview();if(atlas)window.__publicAtlas=atlas;else window.__readingViews=buildViews(result.project);$('share-viewer').hidden=false;$('share-viewer').src='../'+(atlas?'public-reader.html':'viewer.html')+'?revision='+Date.now();$('share-report').textContent=description(result,atlas);});
for(const id of ['share-books','share-metrics','share-relations','share-exploration','share-permissions'])$(id).addEventListener('change',()=>{clearPreview();$('share-trails').hidden=!$('share-exploration').checked;$('share-report').textContent='公开范围已改变，请重新预览。';});
$('download-share').onclick=shareGuard(async()=>{
  const result=selectedPublic(),atlas=$('share-exploration').checked?selectedAtlas():null,views=buildViews(result.project),files={},version=scopeVersion;
  for(const name of ['viewer.html','viewer-data.js','universe.js','lib/vis-network.min.js',...(atlas?['public-reader.html','public-reader.css','public-reader.js']:[])]){
    const response=await fetch('../'+name);if(!response.ok)throw Error('公开包资源暂时读取失败。');
    files[name==='viewer.html'?(atlas?'graph.html':'index.html'):name==='public-reader.html'?'index.html':name]=await response.text();
  }
  if(version!==scopeVersion||!dialog.open)throw Error('下载准备期间公开范围已改变，请按当前选择重新下载。');
  const safe=v=>JSON.stringify(v).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
  files['graph_data.js']='window.GRAPH = '+safe(views.graph)+';';files['universe_data.js']='window.UNIVERSE = '+safe(views.universe)+';';
  if(atlas)files['public-data.js']='window.READING_ATLAS_PUBLIC = '+safe(atlas)+';';
  files['README.txt']=atlas?'打开index.html，沿主人精选的线索探索。graph.html查看图谱，graph.html?universe查看星空。仅包含选中的书目、确认的解读与引文；个人笔记、完整原材料和私人探索历史未包含。公开包中所有内容都可以被读取。':'仅含你选中的公开书目、主题和关联结构。打开index.html查看图谱，index.html?universe查看星空。原材料、探索文字和个人笔记未包含。';
  download(makeZip(files),atlas?'页间-公开探索网站.zip':'页间-公开书目网站.zip');$('share-report').textContent=description(result,atlas);
});
$('close-share').onclick=()=>dialog.close();dialog.addEventListener('close',clearPreview);
window.addEventListener('reading-project-change',()=>{if(dialog.open)dialog.close();sharingKey=null;clearPreview();$('share-books').replaceChildren();});

let transferToken=null;
window.addEventListener('message',event=>{
  if(event.origin!==location.origin||event.source!==window.opener||!window.opener)return;
  if(event.data?.type==='reading-atlas-load'){
    try{openTransferredProject(event.data.project);transferToken=event.data.token;back.hidden=false;}catch(e){projectNotice(e.message||'图谱项目暂时无法打开。');}
  }else if(event.data?.type==='reading-atlas-result'&&event.data.token===transferToken)projectNotice(event.data.ok?'已带回图谱页面；请保存项目，刷新前记得下载。':'图谱页面已经改变，未覆盖。请先保存两边的项目再合并。');
});
back.onclick=guard(async()=>{if(!window.opener||!transferToken)throw Error('图谱页面已关闭，请保存项目后重新打开。');window.opener.postMessage({type:'reading-atlas-return',token:transferToken,project:current()},location.origin);});
if(window.opener)window.opener.postMessage({type:'reading-atlas-ready'},location.origin);
