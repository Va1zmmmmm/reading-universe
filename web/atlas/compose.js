import {explorationWorkspace,addExploration} from './workspace.js?v=1';
import {materialLabel} from './workspace-core.mjs';
import {explorationRequest,validateExploration} from '../core.mjs';
const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let source=null,selected=new Map(),draft=null,active=null;
const materialKey=(book,evidence)=>JSON.stringify([book,evidence]);
function error(text){$('compose-error').textContent=text;$('compose-error').hidden=!text;if(text&&$('compose-dialog').open)requestAnimationFrame(()=>$('compose-error').scrollIntoView({block:'nearest',behavior:'instant'}));}
function eligible(){return source?.project.books.filter(b=>b.included!==false&&b.evidence.some(e=>e.included!==false))||[];}
function available(){$('open-compose').disabled=!explorationWorkspace()||!!active;}
function renderMaterials(){
  const tag=$('compose-tag').value,kind=$('compose-kind').value,query=$('compose-search').value.trim().toLocaleLowerCase();
  const materials=b=>b.evidence.filter(e=>e.included!==false&&(!kind||e.kind===kind));
  const books=eligible().filter(b=>(!tag||b.tags.includes(tag))&&(!query||(b.title+' '+b.author).toLocaleLowerCase().includes(query))&&materials(b).length);
  $('compose-materials').innerHTML=books.length?books.map((b,i)=>`<details class="source-pool" data-book="${esc(b.id)}" ${i===0?'open':''}><summary><span>${esc(b.title)}</span><small>${esc(b.author)} · ${materials(b).length} 段</small></summary><div class="material-list"></div></details>`).join(''):'<p>这里没有对应材料。可以换一个标签、材料类型，或先补充自己的资料。</p>';
  for(const pool of $('compose-materials').querySelectorAll('.source-pool')){
    const book=books.find(b=>b.id===pool.dataset.book),rows=materials(book);let page=0;
    function fill(){
      const start=page*20,visible=rows.slice(start,start+20);
      pool.querySelector('.material-list').innerHTML=visible.map(e=>{
        const key=materialKey(book.id,e.id),value=selected.get(key),excerpt=value?.text??e.text.slice(0,1500);
        return `<div class="select-material" data-material="${esc(key)}"><label><input type="checkbox" ${value?'checked':''}><span>${esc(materialLabel(e))} · ${esc(e.text.slice(0,65))}${e.text.length>65?'…':''}</span></label><textarea maxlength="1500" aria-label="本次提交的材料片段">${esc(excerpt)}</textarea><small>${e.text.length>1500?'这是长材料的前1500字；可换成原材料中的其他连续片段。':'完整材料在此，可原样提交或改选连续片段。'}</small><details><summary>对照完整本机材料</summary><p>${esc(e.text)}</p></details></div>`;
      }).join('')+(rows.length>20?`<div class="material-pages"><button data-page="previous" ${page===0?'disabled':''}>上一组</button><span>${start+1}–${Math.min(start+20,rows.length)} / ${rows.length} 段</span><button data-page="next" ${start+20>=rows.length?'disabled':''}>下一组</button></div>`:'');
      pool.querySelectorAll('[data-material]').forEach(el=>{
        const [bookId,evidenceId]=JSON.parse(el.dataset.material),check=el.querySelector('input'),field=el.querySelector('textarea');
        const update=()=>{if(check.checked)selected.set(el.dataset.material,{bookId,evidenceId,text:field.value});else selected.delete(el.dataset.material);updateSelection();};check.onchange=update;field.oninput=update;
      });
      pool.querySelectorAll('[data-page]').forEach(button=>button.onclick=()=>{page+=button.dataset.page==='next'?1:-1;fill();pool.scrollIntoView({block:'start',behavior:'instant'});});
    }
    if(pool.open)fill();pool.addEventListener('toggle',()=>{if(pool.open&&!pool.querySelector('.material-list').children.length)fill();});
  }
  updateSelection();
}
function updateSelection(){
  const values=[...selected.values()],count=values.length,length=values.reduce((n,v)=>n+v.text.length,0),books=new Set(values.map(v=>v.bookId)).size;
  let problem='';
  if(count>32||books>8||length>24000)problem='超过单次范围：最多8本、32段、24000字。';
  else if(values.some(v=>{const b=source.project.books.find(b=>b.id===v.bookId),e=b.evidence.find(e=>e.id===v.evidenceId);return !v.text.trim()||!e.text.includes(v.text)||v.text.length>1500;}))problem='改选片段必须是原材料里的一段连续原文，不能改写。';
  else if([...new Set(values.map(v=>v.bookId))].some(id=>values.filter(v=>v.bookId===id).length>12))problem='同一本书最多12段，请减少勾选。';
  $('selection-count').textContent=`本次勾选 ${books} 本书 · ${count} 段 · ${length} 字。`+(problem?' '+problem:count<2?' 至少选两段，才能展开问题。':' 可以开始整理。');
  $('generate-trail').disabled=!!problem||count<2;
  $('selected-materials').innerHTML=values.length?'<p>本次提交的全部片段（换标签或翻页不会清空勾选）</p>'+values.map(v=>{
    const b=source.project.books.find(b=>b.id===v.bookId),e=b.evidence.find(e=>e.id===v.evidenceId);
    return `<div><span>《${esc(b.title)}》 · ${esc(materialLabel(e))}<small>${esc(v.text.slice(0,60))}${v.text.length>60?'…':''}</small></span><button data-remove="${esc(materialKey(v.bookId,v.evidenceId))}" aria-label="移除这段已选材料">×</button></div>`;
  }).join(''):'';
  $('selected-materials').querySelectorAll('[data-remove]').forEach(button=>button.onclick=()=>{
    const key=button.dataset.remove;selected.delete(key);for(const el of $('compose-materials').querySelectorAll('[data-material]'))if(el.dataset.material===key)el.querySelector('input').checked=false;updateSelection();
  });
}
function open(){
  source=explorationWorkspace();if(!source)return;
  selected.clear();draft=null;error('');$('compose-form').hidden=false;$('draft-preview').hidden=true;$('compose-progress').hidden=true;
  document.querySelector('.compose-connection').open=false;
  $('compose-key').value='';$('compose-name').value=source.themeName;$('compose-question').value='';
  $('compose-kind').value='';$('compose-search').value='';
  const tags=[...new Set(eligible().flatMap(b=>b.tags))];$('compose-tag').innerHTML='<option value="">全部有材料的书</option>'+tags.map(t=>`<option value="${esc(t)}">${esc(t)}</option>`).join('');
  if(tags.includes(source.themeName))$('compose-tag').value=source.themeName;
  renderMaterials();$('compose-dialog').showModal();
}
async function api(path,options={}){
  let response;
  try{response=await fetch(path,{...options,credentials:'same-origin',headers:{'Content-Type':'application/json',...options.headers}});}catch{throw Error('临时服务暂时连不上，请保留当前项目后重试。');}
  let body;try{body=await response.json();}catch{throw Error('临时服务返回异常，当前项目没有改变。');}
  if(!response.ok)throw Error(body.error||'临时任务未完成，请重试。');return body;
}
async function stop(){
  const run=active;if(!run)return;run.aborted=true;$('compose-progress-text').textContent='已请求停止，当前项目没有改变。';
  if(run.id)await api('/api/jobs/'+run.id,{method:'DELETE'}).catch(()=>{});
}
function renderDraft(nodeId=draft.theme.start,from=null){
  const theme=draft.theme,node=theme.nodes.find(n=>n.id===nodeId),previous=theme.nodes.find(n=>n.id===from),bridge=previous?.choices.find(c=>c.target===nodeId)?.bridge;
  const book=draft.project.books.find(b=>b.id===node.quote.bookId),e=book.evidence.find(e=>e.id===node.quote.evidenceId);
  $('draft-title').textContent=theme.title;$('draft-opening').textContent=theme.opening;
  $('draft-story').innerHTML=`${bridge?`<p class="draft-bridge">接着「${esc(previous.title)}」往下想：${esc(bridge)}</p>`:''}<h3>${esc(node.title)}</h3><p>${esc(node.context)}</p><blockquote>${esc(node.quote.excerpt)}</blockquote><div class="draft-source">《${esc(book.title)}》 · ${esc(materialLabel(e))}</div><p>${esc(node.observation)}</p>`;
  $('draft-choices').innerHTML=node.choices.length?node.choices.map(c=>`<button data-preview="${esc(c.target)}"><strong>${esc(c.label)} ↗</strong><small>${esc(c.hint)}</small></button>`).join(''):`<div><strong>${esc(theme.endTitle)}</strong><p>${esc(theme.endBody)}</p><button data-preview="${esc(theme.start)}">回到草稿开场 ↶</button></div>`;
  $('draft-choices').querySelectorAll('[data-preview]').forEach(button=>button.onclick=()=>renderDraft(button.dataset.preview,node.id));
}
async function generate(){
  if(active)return;error('');
  const current=explorationWorkspace();
  if(!source||!current||current.key!==source.key){error('项目已经改变，请重新打开线索整理。');return;}
  let request;
  try{
    request=explorationRequest(source.project,[...selected.values()],{id:'trail-'+crypto.randomUUID(),name:$('compose-name').value.trim(),question:$('compose-question').value.trim()});
    if(!$('compose-model').value.trim()||!$('compose-key').value.trim())throw Error('请展开“本次使用的 AI 服务”，填写模型名和你自己的 API key。');
  }catch(e){error(e.message);document.querySelector('.compose-connection').open=true;return;}
  const credentials={provider:$('compose-provider').value,model:$('compose-model').value.trim(),key:$('compose-key').value.trim()};
  $('compose-key').value='';draft=null;const run={aborted:false,id:null};active=run;available();
  $('compose-form').hidden=true;$('draft-preview').hidden=true;$('compose-progress').hidden=false;$('compose-progress-text').textContent='正在整理所选材料，现有项目保持原样…';
  try{
    const session=await api('/api/session');if(!session.stages?.includes('exploration'))throw Error('当前临时服务还未接入问题线索整理，请使用新版服务。');
    if(run.aborted)return;
    const job=await api('/api/jobs',{method:'POST',body:JSON.stringify({...request,...credentials})});run.id=job.id;credentials.key='';
    const deadline=Date.now()+210000;
    while(!run.aborted){
      if(Date.now()>deadline)throw Error('整理等待超时，任务将停止；当前项目没有改变。请稍后重试。');
      const result=await api('/api/jobs/'+run.id);if(run.aborted)break;
      if(result.status==='complete'){
        const theme=validateExploration(result.result,source.project,request);
        if(explorationWorkspace()?.key!==source.key)throw Error('当前项目已变化，这份草稿没有加入。');
        draft={theme,key:source.key,project:source.project};renderDraft();$('draft-preview').hidden=false;$('compose-dialog').scrollTop=0;break;
      }
      if(result.status==='failed')throw Error(result.error||'草稿未通过核对，请重新选材料。');
      if(result.status==='cancelled')throw Error('整理已经停止。');
      await new Promise(resolve=>setTimeout(resolve,650));
    }
    if(run.aborted)error('已停止整理。当前项目和笔记保留；再次整理需重新填写 key。');
  }catch(e){if(!run.aborted)error(e.message);}
  finally{
    credentials.key='';if(run.id)await api('/api/jobs/'+run.id,{method:'DELETE'}).catch(()=>{});
    if(active===run)active=null;available();$('compose-progress').hidden=true;
    if(!draft)$('compose-form').hidden=false;
  }
}
$('open-compose').onclick=open;$('compose-tag').onchange=renderMaterials;$('generate-trail').onclick=generate;$('cancel-trail').onclick=stop;
$('compose-kind').onchange=renderMaterials;$('compose-search').oninput=renderMaterials;
$('close-compose').onclick=()=>{stop();$('compose-key').value='';draft=null;$('compose-dialog').close();};
$('compose-dialog').addEventListener('cancel',()=>{stop();$('compose-key').value='';draft=null;});
$('revise-trail').onclick=()=>{draft=null;$('draft-preview').hidden=true;$('compose-form').hidden=false;error('');};
$('accept-trail').onclick=()=>{if(!draft)return;try{const {theme,key}=draft;addExploration(theme,key);draft=null;$('compose-dialog').close();}catch(e){error(e.message);}};
window.addEventListener('reading-project-change',()=>{if(active)stop();draft=null;source=null;selected.clear();$('compose-key').value='';for(const id of ['compose-materials','selected-materials','draft-story','draft-choices'])$(id).replaceChildren();$('draft-title').textContent='';$('draft-opening').textContent='';if($('compose-dialog').open)$('compose-dialog').close();available();});
window.addEventListener('pagehide',()=>{if(active){active.aborted=true;if(active.id)fetch('/api/jobs/'+active.id,{method:'DELETE',credentials:'same-origin',keepalive:true}).catch(()=>{});}});
available();
