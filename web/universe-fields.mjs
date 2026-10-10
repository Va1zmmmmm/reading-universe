// Shared whitelist for the original universe project and exploratory workspace.
const text=(v,max=20000)=>typeof v==='string'?v.slice(0,max):'';
const list=v=>Array.isArray(v)?v:[];
const unique=v=>[...new Set(v)];
const safeName=v=>!['__proto__','constructor','prototype'].includes(v);
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

export function universeFields(input,books){
  const p={books,analysis:{},links:[],linkCache:{},cards:{},edits:{books:{},cards:{},links:[],removedPairs:[]},settings:{wordlist:[],aliases:{}}};
  p.settings.wordlist=unique(list(input.settings?.wordlist).map(t=>text(t,60).trim()).filter(t=>t&&safeName(t))).slice(0,100);
  for(const [alias,canonical]of Object.entries(input.settings?.aliases||{}))if(safeName(alias)&&alias.length<=60&&typeof canonical==='string'&&canonical.length<=60&&safeName(canonical))p.settings.aliases[alias]=canonical;
  const seen=new Set(books.map(b=>b.id));
  for(const b of books)if(input.analysis?.[b.id])p.analysis[b.id]=validateAnalysis(input.analysis[b.id],b,p.settings.wordlist);
  p.links=validateLinks(input.links,p);
  for(const [name,card]of Object.entries(input.cards||{}))if(safeName(name))p.cards[text(name,60)]=text(card);
  for(const b of books)if(input.edits?.books?.[b.id])p.edits.books[b.id]={tags:unique(list(input.edits.books[b.id].tags).map(t=>text(t,60)).filter(t=>t&&safeName(t))).slice(0,10)};
  for(const [name,card]of Object.entries(input.edits?.cards||{}))if(safeName(name))p.edits.cards[text(name,60)]=text(card);
  p.edits.links=validateLinks(input.edits?.links,p,true);
  p.edits.removedPairs=list(input.edits?.removedPairs).filter(k=>typeof k==='string'&&k.split('|').every(id=>seen.has(id))).slice(0,5000);
  for(const [key,value]of Object.entries(input.linkCache||{}))if(key.split('|').every(id=>seen.has(id))&&typeof value==='string'&&value.length<300)p.linkCache[key]=value;
  const {books:ignored,...out}=p;return out;
}
