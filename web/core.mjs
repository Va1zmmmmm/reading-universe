// Pure project transformations shared by the browser, tests and offline tools.
export const VERSION = 1;
export {explorationRequest,validateExploration} from './exploration.mjs';
import {coverUrl as atlasCover,normalizeProject as atlasProject,FORMAT as ATLAS_FORMAT} from './atlas-project.mjs';
import {universeFields,validateAnalysis,validateLinks} from './universe-fields.mjs';
export {validateAnalysis,validateLinks} from './universe-fields.mjs';
export {normalizeProject as explorationProject} from './atlas-project.mjs';
import {makePublicAtlas} from './atlas-sharing.mjs';
export function publicExploration(p,selected,permissions){return makePublicAtlas(p,publicProject(p,selected).project.books,permissions);}
const MAX_BOOKS = 1500, MAX_TEXT = 20000;
export const text = (v, max = MAX_TEXT) => typeof v === 'string' ? v.slice(0, max) : '';
const list = v => Array.isArray(v) ? v : [];
const unique = v => [...new Set(v)];
const safeName = v => !['__proto__','constructor','prototype'].includes(v);
const numeric = v => Number.isFinite(Number(v)) ? Math.max(0, Number(v)) : 0;
function resolveBook(books,title) {
  const norm=s=>s.replace(/\s+/g,''),base=s=>norm(s.replace(/[（(].*?[）)]/g,'').split(/[：:]/)[0]);
  let matches=books.filter(b=>norm(b.title)===norm(title));if(matches.length===1)return matches[0];
  matches=books.filter(b=>base(b.title)===base(title));if(matches.length===1)return matches[0];
  return undefined;
}
export function emptyProject() {
  return {format:'reading-universe-private', version:VERSION, books:[], analysis:{}, links:[], linkCache:{}, cards:{}, edits:{books:{}, cards:{}, links:[],removedPairs:[]}, settings:{wordlist:[],aliases:{}}};
}
export function normalize(input, files = {}) {
  if (!input || typeof input !== 'object') throw Error('请选择包含 books 数组的书目文件。');
  if(input.format===ATLAS_FORMAT){const atlas=atlasProject(input);input={...atlas,...atlas.universe,books:atlas.books.map(b=>({...b,tags:atlas.universe.bookTags[b.id]??b.tags})),format:'reading-universe-private'};}
  const restore = input.format === 'reading-universe-private';
  if (restore && input.version !== VERSION) throw Error('这个项目包版本暂不支持。');
  if (!Array.isArray(input.books) || input.books.length > MAX_BOOKS) throw Error(`书目应为数组，最多 ${MAX_BOOKS} 本。`);
  const p = emptyProject(), seen = new Set();
  if(typeof input.name==='string')p.name=text(input.name,150);
  let materialCount=0;
  p.books = input.books.filter(b=>!b.mergedInto).map((b, i) => {
    const id = String(b.id ?? b.bookId ?? '').trim(), title = text(b.title, 300).trim();
    if (!id || id.length>200 || /[|\u0000-\u001f]/.test(id) || !title || !safeName(id)) throw Error(`第 ${i+1} 本缺少有效 bookId/id 或 title。`);
    if (seen.has(id)) throw Error(`书籍 ID 重复：${id}。请先确认版本或合并关系。`);
    seen.add(id);
    const evidence = [], add = (value, kind, source) => {
      const content = text(typeof value === 'string' ? value : value?.text || value?.markText || value?.content || value?.abstract).trim();
      if (!content) return;
      if (evidence.length < 100) evidence.push({id:`${id}:e${evidence.length}`, text:content, kind, source:text(source,500),included:true});
      else if (kind === 'review' || kind === 'card') {
        // A long highlight cache must not crowd out the reader's review/card.
        // Replace only a sampled note/highlight, retaining unique evidence IDs.
        const slot=evidence.findLastIndex(e=>e.kind!=='review'&&e.kind!=='card');
        if(slot>=0)evidence[slot]={id:`${id}:e${slot}`,text:content,kind,source:text(source,500),included:true};
      }
    };
    if (restore) {
      const rows=b.evidence??[];
      if(!Array.isArray(rows)||rows.length>2000)throw Error('单书材料最多2000条，请保留原项目。');
      const evidenceIds=new Set();
      for(const [n,e]of rows.entries()){
        const eid=e.id??`${id}:e${n}`;
        if(typeof eid!=='string'||!eid||eid.length>250||/[|\u0000-\u001f]/.test(eid)||!safeName(eid)||evidenceIds.has(eid)||typeof e.text!=='string'||!e.text.trim()||e.text.length>100000)throw Error('材料标识重复、文字缺失或超过限制。');
        evidenceIds.add(eid);const out={id:eid,text:e.text,kind:['highlight','note','card','review'].includes(e.kind)?e.kind:'note',source:text(e.source,500),included:e.included!==false};
        if(e.sourceLocator&&typeof e.sourceLocator==='object'){
          out.sourceLocator={};if(Number.isSafeInteger(e.sourceLocator.ordinal)&&e.sourceLocator.ordinal>0)out.sourceLocator.ordinal=e.sourceLocator.ordinal;
          if(typeof e.sourceLocator.bookmarkId==='string')out.sourceLocator.bookmarkId=text(e.sourceLocator.bookmarkId,200);
        }
        evidence.push(out);
      }
    }
    else {
      list(b.highlights).forEach(e=>add(e,'highlight','书目内划线'));
      list(b.annotations).forEach(e=>add(e,'note','书目内笔记'));
      if(Array.isArray(b.notes))b.notes.forEach(e=>add(e,'note','书目内笔记'));
      const hf = Object.entries(files).find(([name])=>name.endsWith(`/highlights/${id}.json`) || name===`highlights/${id}.json`);
      if (hf) { const h = JSON.parse(hf[1]); list(Array.isArray(h)?h:h.items).forEach(e=>add(e,'highlight',hf[0])); }
      add(b.myReview || b.review,'review','本人书评');
      for(const [name,content]of Object.entries(files))if(name.endsWith(`/notes/${id}.md`)||name===`notes/${id}.md`)add(content,'note',name);
      for (const [name, content] of Object.entries(files)) if (name.endsWith(`/cards/${id}.md`) || name===`cards/${id}.md`) add(content,'card',name);
    }
    materialCount+=evidence.length;if(materialCount>100000)throw Error('材料数量超过限制，请保留原项目。');
    return {id,title,author:text(b.author,300),included:b.included!==false,cover:atlasCover(b.cover),tags:unique(list(b.tags).map(v=>text(v,100)).filter(v=>v&&safeName(v))).slice(0,100),readingTime:numeric(b.readingTime),notes:numeric(typeof b.notes==='object'?b.notes?.total:b.notes),finished:Boolean(b.finished ?? b.finishTime),finishTime:text(String(b.finishTime || ''),80),rating:text(String(b.rating ?? b.affectionScore ?? ''),80),evidence};
  });
  p.settings.wordlist = unique(list(input.settings?.wordlist).map(t=>text(t,60).trim()).filter(t=>t&&safeName(t))).slice(0,100);
  for(const [alias,canonical]of Object.entries(input.settings?.aliases||{}))if(safeName(alias)&&typeof canonical==='string'&&canonical.length<=60&&safeName(canonical))p.settings.aliases[text(alias,60)]=canonical;
  if (restore) {
    Object.assign(p,universeFields(input,p.books));
  } else {
    // Legacy author/agent data is imported only when it belongs to the current IDs.
    const tagsFile = Object.entries(files).find(([name])=>name.endsWith('theme_tags.json'));
    if (tagsFile) {
      const tags=JSON.parse(tagsFile[1]);
      for(const b of p.books) if(tags[b.id]) p.analysis[b.id]={tags:list(tags[b.id].tags).map(t=>text(t,60)).filter(safeName),summary:'',evidenceIds:[],basis:'imported',fingerprint:''};
    }
    const active = new Set(p.books.flatMap(b=>p.analysis[b.id]?.tags||[]));
    for (const [name,content] of Object.entries(files)) if (/\/themes\/[^/]+\.md$/.test('/'+name)) {
      const theme=name.split('/').at(-1).slice(0,-3); if(active.has(theme))p.cards[theme]=text(content);
    }
    const linksFile=Object.entries(files).find(([name])=>name.endsWith('links.json'));
    if(linksFile) {
      const old=JSON.parse(linksFile[1]), titles=new Map(p.books.map(b=>[b.title,b.id]));
      const imported=[];
      for(const row of list(old)) {
        const source=titles.get(row.source); if(!source)continue;
        for(const l of list(row.links)) imported.push({source,target:titles.get(l.target)||text(l.target,300),targetType:titles.has(l.target)?'book':l.type==='concept'?'concept':'external',type:'reference',reason:text(l.desc),evidenceIds:[],basis:'imported'});
      }
      p.links=validateLinks(imported,p,true);
    }
    for(const [name,content] of Object.entries(files)) if(/\/cards\/links\/[^/]+\.md$/.test('/'+name)) {
      const src=/关联记录[：:]\s*《(.+?)》/.exec(content)?.[1], fileId=name.split('/').at(-1).slice(0,-3),book=p.books.find(b=>b.id===fileId)||(src?resolveBook(p.books,src):undefined); if(!book)continue;
      for(const line of content.split('\n').filter(l=>l.startsWith('- '))) {
        const refs=[...line.matchAll(/《(.+?)》/g)],body=line.slice(2),parts=body.split(/[：:]|——|—/),reason=text(parts.slice(1).join('：').trim());
        if(refs.length)for(const ref of refs){const target=resolveBook(p.books,ref[1]);if(target?.id!==book.id)p.links.push({source:book.id,target:target?.id||ref[1],targetType:target?'book':'external',type:'reference',reason,evidenceIds:[],basis:'imported'});}
        else if(parts[0].trim().length<=16&&parts[0].trim())p.links.push({source:book.id,target:parts[0].trim(),targetType:'concept',type:'reference',reason,evidenceIds:[],basis:'imported'});
      }
    }
    p.links=validateLinks(p.links,p,true);
  }
  if(input.exploration!=null||input.journey!=null){
    const atlas=atlasProject({...p,exploration:input.exploration,journey:input.journey});
    p.exploration=atlas.exploration;p.journey=atlas.journey;
  }
  return p;
}
export async function fingerprint(b, settings, model) {
  const value=JSON.stringify({b,settings,model,prompt:'reading-v1'});
  const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
  return Array.from(new Uint8Array(hash),x=>x.toString(16).padStart(2,'0')).join('');
}
export function tagsFor(p,b) { return unique((p.edits.books[b.id]?.tags ?? p.analysis[b.id]?.tags ?? b.tags ?? []).map(t=>p.settings.aliases?.[t]||t).filter(t=>t&&safeName(t))); }
export function tagCategory(p,tag) {
  if(p.books.some(b=>b.author===tag))return '作者';
  if(/^(华语|欧美|日本|韩国).*文学$/.test(tag))return '地域';
  if(['推理悬疑','科幻与幻想','轻小说与漫画','生活随笔','传记与回忆录','文学批评'].includes(tag))return '体裁';
  return '主题';
}
export function themeCards(p) {
  p=visibleProject(p);
  const groups=Object.create(null);for(const b of p.books)for(const t of tagsFor(p,b))if(safeName(t))(groups[t]??=[]).push(b);
  const cards={};for(const [t,books]of Object.entries(groups)) {
    cards[t]=p.edits.cards[t] ?? p.cards[t] ?? `# ${t}\n\n- 相关书目：${books.length} 本\n${books.map(b=>`  - 《${b.title}》`).join('\n')}\n\n## 观点与问题\n${books.map(b=>`- 《${b.title}》：${p.analysis[b.id]?.summary||'尚无充分材料，等待补充。'}`).join('\n')}\n\n## 分歧与关联\n${[...p.links,...p.edits.links].filter(l=>books.some(b=>b.id===l.source)).map(l=>`- ${l.reason}`).join('\n')||'尚未确认具体关联。'}\n\n## 未解问题\n- 哪些判断仍需要更多材料或本人确认？`;
  }return cards;
}
export function buildViews(p) {
  p=visibleProject(p);
  const cards=themeCards(p), nodes=p.books.map(b=>({id:`book:${b.id}`,label:b.title,group:'book',author:b.author,mentions:0})), edges=[], themes=[];
  for(const t of Object.keys(cards)) {
    const books=p.books.filter(b=>tagsFor(p,b).includes(t)),category=tagCategory(p,t);nodes.push({id:`theme:${t}`,label:t,group:'theme',category,mentions:books.length,card:cards[t]});themes.push({name:t,count:books.length,card:cards[t],category});
    for(const b of books)edges.push({from:`book:${b.id}`,to:`theme:${t}`,title:`主题：${t}`,theme:true,internal:false});
  }
  const allLinks=[...p.links,...p.edits.links],conceptSources=new Map();
  for(const l of allLinks)if(l.targetType==='concept'){if(!conceptSources.has(l.target))conceptSources.set(l.target,new Set());conceptSources.get(l.target).add(l.source);}
  for(const l of allLinks) {
    if(l.targetType==='concept'&&l.basis!=='manual'&&conceptSources.get(l.target).size<2)continue;
    if(!p.books.some(b=>b.id===l.source))continue;
    const target=l.targetType==='book'?`book:${l.target}`:`${l.targetType}:${l.target}`;
    if(!nodes.some(n=>n.id===target))nodes.push({id:target,label:l.target,group:l.targetType==='concept'?'concept':'ext_book',mentions:0});
    edges.push({from:`book:${l.source}`,to:target,title:`${({same_topic:'同题',complement:'补充',contrast:'对照',reference:'引用'})[l.type]} · ${l.reason}\n来源：${l.basis==='manual'?'本人确认':l.basis==='imported'?'已有整理':'材料分析'}`,internal:l.targetType==='book',theme:false});
  }
  const counts=new Map(themes.map(t=>[t.name,t.count]));
  const books=p.books.map(b=>{const tags=tagsFor(p,b);return {id:b.id,title:b.title,author:b.author,rt:b.readingTime,notes:b.notes,finished:b.finished,tags:tags.length?tags:['未分类'],theme:tags.length?[...tags].sort((a,c)=>counts.get(a)-counts.get(c))[0]:'未分类',comet:0};});
  if(books.some(b=>b.theme==='未分类'))themes.push({name:'未分类',count:books.filter(b=>b.theme==='未分类').length,card:'# 未分类\n\n可补充标签；这些书仍属于你的书架。'});
  const pairCounts=new Map();
  for(const b of books){const tags=[...b.tags].sort();for(let i=0;i<tags.length;i++)for(let j=i+1;j<tags.length;j++){const key=JSON.stringify([tags[i],tags[j]]);pairCounts.set(key,(pairCounts.get(key)||0)+1);}}
  const rarity=b=>{const tags=[...b.tags].sort(),scores=[];for(let i=0;i<tags.length;i++)for(let j=i+1;j<tags.length;j++)scores.push((pairCounts.get(JSON.stringify([tags[i],tags[j]]))||0)/Math.sqrt((counts.get(tags[i])||1)*(counts.get(tags[j])||1)));return scores.reduce((s,n)=>s+n,0)/scores.length;};
  const tagged=books.filter(b=>b.tags.length>1).sort((a,b)=>rarity(a)-rarity(b));for(const b of tagged.slice(0,3))b.comet=1;
  for(const node of nodes)if(node.group==='book')node.mentions=edges.filter(e=>!e.theme&&(e.from===node.id||e.to===node.id)).length;
  const stats={books:p.books.length,read:0,finished:p.books.filter(b=>b.finished).length,withoutCard:p.books.filter(b=>b.finished&&!b.evidence.some(e=>e.kind==='card')).length,external:nodes.filter(n=>['concept','ext_book'].includes(n.group)).length,themes:Object.keys(cards).length,edges:edges.length};
  return {graph:{nodes,edges,stats},universe:{books,themes,stats:{books:books.length,themes:themes.length,comets:books.filter(b=>b.comet).length,totalHours:Math.round(books.reduce((s,b)=>s+b.rt,0)/3600),totalNotes:books.reduce((s,b)=>s+b.notes,0)}}};
}
export function publicProject(p, selected, options={}) {
  selected=selected.filter(id=>p.books.some(b=>b.id===id&&b.included!==false));
  const chosen=new Set(selected), out=emptyProject(), rejected=[];
  // Free-form summaries/cards may refer to hidden books or personal events. Rebuild from allowed fields by default.
  out.books=p.books.filter(b=>chosen.has(b.id)).map(b=>({id:b.id,title:b.title,author:b.author,readingTime:options.metrics?b.readingTime:0,notes:options.metrics?b.notes:0,finished:false,finishTime:'',rating:'',evidence:[]}));
  for(const b of out.books)out.analysis[b.id]={tags:tagsFor(p,b),summary:'',evidenceIds:[],basis:'imported',fingerprint:''};
  const hidden=p.books.filter(b=>!chosen.has(b.id)), blocked=hidden.map(b=>b.title).filter(Boolean);
  out.books=out.books.filter(b=>!blocked.some(word=>b.title.includes(word)));
  for(const b of out.books)if(blocked.some(word=>b.author.includes(word)))b.author='';
  const effective=new Set(out.books.map(b=>b.id));
  for(const b of out.books)out.analysis[b.id].tags=out.analysis[b.id].tags.filter(t=>!blocked.some(word=>t.includes(word)));
  if(options.relations)for(const l of [...p.links,...p.edits.links]) {
    if(!effective.has(l.source)||l.targetType!=='book'||!effective.has(l.target))continue;
    if(blocked.some(word=>l.reason.includes(word)||l.target.includes(word))){rejected.push('一条关联包含隐藏书目的引用，已移除。');continue;}
    // Sharing topology need not disclose the private explanation/evidence.
    out.links.push({...l,reason:'使用者选择分享的关联',evidenceIds:[],basis:'manual'});
  }
  return {project:out,report:{excluded:p.books.length-out.books.length,rejected,notice:'专题卡由公开书目重建，未导出私人原文、自由文本、日期或评分。'}};
}
function visibleProject(p){
  const books=p.books.filter(b=>b.included!==false),ids=new Set(books.map(b=>b.id)),valid=l=>ids.has(l.source)&&(l.targetType!=='book'||ids.has(l.target));
  return {...p,books,links:p.links.filter(valid),edits:{...p.edits,links:p.edits.links.filter(valid)}};
}
export function privatePackage(p) { return normalize(p); }
export function updateProject(previous,incoming) {
  // A current complete book list replaces the collection; retained IDs keep human work.
  const p=privatePackage(incoming),ids=new Set(p.books.map(b=>b.id));
  p.settings=previous.settings;
  for(const b of p.books){if(previous.analysis[b.id])p.analysis[b.id]=previous.analysis[b.id];if(previous.edits.books[b.id])p.edits.books[b.id]=previous.edits.books[b.id];}
  const unchanged=new Set(p.books.filter(b=>JSON.stringify(b)===JSON.stringify(previous.books.find(old=>old.id===b.id))).map(b=>b.id));
  p.links=validateLinks(previous.links.filter(l=>l.basis!=='evidence'||(unchanged.has(l.source)&&unchanged.has(l.target))),p,true);p.edits.links=validateLinks(previous.edits.links,p,true);
  const removedTitles=previous.books.filter(b=>!ids.has(b.id)).map(b=>b.title);
  p.cards={...Object.fromEntries(Object.entries(previous.cards).filter(([,c])=>!removedTitles.some(t=>c.includes(t)))),...p.cards};p.edits.cards={...previous.edits.cards};
  p.edits.removedPairs=previous.edits.removedPairs.filter(k=>k.split('|').every(id=>ids.has(id)));
  p.linkCache=Object.fromEntries(Object.entries(previous.linkCache).filter(([k])=>k.split('|').every(id=>ids.has(id))));
  if(previous.exploration?.themes.length){
    try{const atlas=atlasProject({...p,exploration:previous.exploration,journey:previous.journey});p.exploration=atlas.exploration;p.journey=atlas.journey;}
    catch{throw Error('新书单改变了探索引用的材料。当前项目保留；请取消“最新完整书单”另开项目，或先整理受影响的线索。');}
  }
  return p;
}
export function candidatePairs(p,limit=40) {
  const pairs=[],seen=new Set([...p.links,...p.edits.links].filter(l=>l.targetType==='book').map(l=>[l.source,l.target].sort().join('|'))), buckets=new Map();
  for(const key of p.edits.removedPairs)seen.add(key);
  for(const [key,hash]of Object.entries(p.linkCache))if(hash===key.split('|').map(id=>p.analysis[id]?.fingerprint||'').join('|'))seen.add(key);
  for(const b of p.books)if(b.included!==false&&b.evidence.some(e=>e.included!==false))for(const t of tagsFor(p,b)){const pool=buckets.get(t)||[];for(const other of pool.slice(-8)){const key=[other.id,b.id].sort().join('|');if(!seen.has(key)){seen.add(key);pairs.push([other,b]);if(pairs.length>=limit)return pairs;}}pool.push(b);buckets.set(t,pool);}return pairs;
}
