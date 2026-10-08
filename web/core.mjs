// Pure project transformations shared by the browser, tests and offline tools.
export const VERSION = 1;
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
  const restore = input.format === 'reading-universe-private';
  if (restore && input.version !== VERSION) throw Error('这个项目包版本暂不支持。');
  if (!Array.isArray(input.books) || input.books.length > MAX_BOOKS) throw Error(`书目应为数组，最多 ${MAX_BOOKS} 本。`);
  const p = emptyProject(), seen = new Set();
  p.books = input.books.filter(b=>!b.mergedInto).map((b, i) => {
    const id = String(b.id ?? b.bookId ?? '').trim(), title = text(b.title, 300).trim();
    if (!id || id.length>200 || /[|\u0000-\u001f]/.test(id) || !title || !safeName(id)) throw Error(`第 ${i+1} 本缺少有效 bookId/id 或 title。`);
    if (seen.has(id)) throw Error(`书籍 ID 重复：${id}。请先确认版本或合并关系。`);
    seen.add(id);
    const evidence = [], add = (value, kind, source) => {
      const content = text(typeof value === 'string' ? value : value?.text || value?.markText || value?.content || value?.abstract).trim();
      if (content && evidence.length < 100) evidence.push({id:`${id}:e${evidence.length}`, text:content, kind, source:text(source,500),included:true});
    };
    if (restore) list(b.evidence).forEach((e, n) => {
      if (text(e.text)) evidence.push({id:`${id}:e${n}`,text:text(e.text),kind:['highlight','note','card','review'].includes(e.kind)?e.kind:'note',source:text(e.source,500),included:e.included!==false});
    });
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
    return {id,title,author:text(b.author,300),readingTime:numeric(b.readingTime),notes:numeric(typeof b.notes==='object'?b.notes?.total:b.notes),finished:Boolean(b.finished ?? b.finishTime),finishTime:text(String(b.finishTime || ''),80),rating:text(String(b.rating ?? b.affectionScore ?? ''),80),evidence};
  });
  p.settings.wordlist = unique(list(input.settings?.wordlist).map(t=>text(t,60).trim()).filter(t=>t&&safeName(t))).slice(0,100);
  for(const [alias,canonical]of Object.entries(input.settings?.aliases||{}))if(safeName(alias)&&typeof canonical==='string'&&canonical.length<=60&&safeName(canonical))p.settings.aliases[text(alias,60)]=canonical;
  if (restore) {
    for (const b of p.books) if (input.analysis?.[b.id]) p.analysis[b.id] = validateAnalysis(input.analysis[b.id],b,p.settings.wordlist);
    p.links = validateLinks(input.links,p);
    for (const [name,card] of Object.entries(input.cards || {})) if(safeName(name))p.cards[text(name,60)] = text(card);
    // Only editable fields are restored. Secrets and server credentials are never retained.
    for (const b of p.books) if (input.edits?.books?.[b.id]) p.edits.books[b.id] = {tags:unique(list(input.edits.books[b.id].tags).map(t=>text(t,60)).filter(Boolean)).slice(0,10)};
    for (const [name,card] of Object.entries(input.edits?.cards || {})) if(safeName(name))p.edits.cards[text(name,60)] = text(card);
    p.edits.links = validateLinks(input.edits?.links,p,true);
    p.edits.removedPairs=list(input.edits?.removedPairs).filter(k=>typeof k==='string'&&k.split('|').every(id=>seen.has(id))).slice(0,5000);
    for(const [key,value]of Object.entries(input.linkCache||{}))if(key.split('|').every(id=>seen.has(id))&&typeof value==='string'&&value.length<300)p.linkCache[key]=value;
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
  return p;
}
export async function fingerprint(b, settings, model) {
  const value=JSON.stringify({b,settings,model,prompt:'reading-v1'});
  const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
  return Array.from(new Uint8Array(hash),x=>x.toString(16).padStart(2,'0')).join('');
}
export function validateAnalysis(a,b,wordlist=[]) {
  const valid=new Set(b.evidence.map(e=>e.id));
  const evidenceIds=unique(list(a.evidenceIds).filter(id=>valid.has(id)));
  return {tags:unique(list(a.tags).map(t=>text(t,60).trim()).filter(t=>t&&safeName(t)&&(!wordlist.length||wordlist.includes(t)))).slice(0,8),summary:text(a.summary,2000),evidenceIds,basis:evidenceIds.length?'evidence':a.basis==='imported'?'imported':'inferred',fingerprint:text(a.fingerprint,100)};
}
export function validateLinks(rows,p,allowImported=false) {
  const ids=new Set(p.books.map(b=>b.id)), evidence=new Map(p.books.flatMap(b=>b.evidence.map(e=>[e.id,b.id]))), seen=new Set();
  return list(rows).filter(l=>{
    if(!ids.has(l.source)||l.source===l.target)return false;
    if(l.targetType==='book'&&!ids.has(l.target))return false;
    const ev=list(l.evidenceIds).filter(e=>evidence.get(e)===l.source||evidence.get(e)===l.target);
    if(!ev.length && !(allowImported||['manual','imported'].includes(l.basis)))return false;
    const key=`${l.source}|${l.target}|${l.type}`;if(seen.has(key))return false;seen.add(key);return true;
  }).map(l=>({source:l.source,target:text(String(l.target),300),targetType:['book','concept','external'].includes(l.targetType)?l.targetType:'book',type:['same_topic','complement','contrast','reference'].includes(l.type)?l.type:'same_topic',reason:text(l.reason,2000),evidenceIds:unique(list(l.evidenceIds).filter(e=>evidence.has(e))),basis:['manual','imported'].includes(l.basis)?l.basis:'evidence'}));
}
export function tagsFor(p,b) { return unique((p.edits.books[b.id]?.tags ?? p.analysis[b.id]?.tags ?? []).map(t=>p.settings.aliases?.[t]||t).filter(t=>t&&safeName(t))); }
export function tagCategory(p,tag) {
  if(p.books.some(b=>b.author===tag))return '作者';
  if(/^(华语|欧美|日本|韩国).*文学$/.test(tag))return '地域';
  if(['推理悬疑','科幻与幻想','轻小说与漫画','生活随笔','传记与回忆录','文学批评'].includes(tag))return '体裁';
  return '主题';
}
export function themeCards(p) {
  const groups=Object.create(null);for(const b of p.books)for(const t of tagsFor(p,b))if(safeName(t))(groups[t]??=[]).push(b);
  const cards={};for(const [t,books]of Object.entries(groups)) {
    cards[t]=p.edits.cards[t] ?? p.cards[t] ?? `# ${t}\n\n- 相关书目：${books.length} 本\n${books.map(b=>`  - 《${b.title}》`).join('\n')}\n\n## 观点与问题\n${books.map(b=>`- 《${b.title}》：${p.analysis[b.id]?.summary||'尚无充分材料，等待补充。'}`).join('\n')}\n\n## 分歧与关联\n${[...p.links,...p.edits.links].filter(l=>books.some(b=>b.id===l.source)).map(l=>`- ${l.reason}`).join('\n')||'尚未确认具体关联。'}\n\n## 未解问题\n- 哪些判断仍需要更多材料或本人确认？`;
  }return cards;
}
export function buildViews(p) {
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
  const stats={books:p.books.length,read:0,external:nodes.filter(n=>['concept','ext_book'].includes(n.group)).length,themes:Object.keys(cards).length,edges:edges.length};
  return {graph:{nodes,edges,stats},universe:{books,themes,stats:{books:books.length,themes:themes.length,comets:books.filter(b=>b.comet).length,totalHours:Math.round(books.reduce((s,b)=>s+b.rt,0)/3600),totalNotes:books.reduce((s,b)=>s+b.notes,0)}}};
}
export function publicProject(p, selected, options={}) {
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
  p.linkCache=Object.fromEntries(Object.entries(previous.linkCache).filter(([k])=>k.split('|').every(id=>ids.has(id))));return p;
}
export function candidatePairs(p,limit=40) {
  const pairs=[],seen=new Set([...p.links,...p.edits.links].filter(l=>l.targetType==='book').map(l=>[l.source,l.target].sort().join('|'))), buckets=new Map();
  for(const key of p.edits.removedPairs)seen.add(key);
  for(const [key,hash]of Object.entries(p.linkCache))if(hash===key.split('|').map(id=>p.analysis[id]?.fingerprint||'').join('|'))seen.add(key);
  for(const b of p.books)if(b.evidence.length)for(const t of tagsFor(p,b)){const pool=buckets.get(t)||[];for(const other of pool.slice(-8)){const key=[other.id,b.id].sort().join('|');if(!seen.has(key)){seen.add(key);pairs.push([other,b]);if(pairs.length>=limit)return pairs;}}pool.push(b);buckets.set(t,pool);}return pairs;
}
