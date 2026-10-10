// Question-trail generation contract, shared through the existing core entrypoint.
const obj=v=>v&&typeof v==='object'&&!Array.isArray(v);
const str=(v,max,required=true)=>{if(typeof v!=='string'||v.length>max||required&&!v.trim())throw Error('线索文字缺失或超过限制。');return v;};
const id=(v,node=false)=>{if(typeof v!=='string'||!v||v.length>(node?80:250)||/[|\u0000-\u001f]/.test(v)||['__proto__','constructor','prototype'].includes(v)||node&&!/^[A-Za-z0-9_-]+$/.test(v))throw Error('线索或材料标识无效。');return v;};
const array=(v,max)=>{if(!Array.isArray(v)||v.length>max)throw Error('线索或材料数量超过限制。');return v;};
export function explorationRequest(project,selections,topic){
  if(!obj(topic))throw Error('请填写想整理的主题。');
  const cleanTopic={id:id(topic.id,true),name:str(topic.name,60).trim(),question:str(topic.question??'',300,false).trim()};
  const books=new Map(),seen=new Set();let length=0;
  for(const s of array(selections,32)){
    const book=project.books.find(b=>b.id===s?.bookId&&b.included!==false),e=book?.evidence?.find(e=>e.id===s.evidenceId&&e.included!==false);
    const fragment=str(s?.text,1500),key=JSON.stringify([s.bookId,s.evidenceId]);
    if(!book||!e||!e.text.includes(fragment)||seen.has(key))throw Error('所选片段重复、已排除或与原材料不符。');
    seen.add(key);length+=fragment.length;if(length>24000)throw Error('一次最多提交 24000 字，请减少勾选的材料。');
    if(!books.has(book.id))books.set(book.id,{id:id(book.id),title:str(book.title,300),author:str(book.author??'',300,false),evidence:[]});
    const row=books.get(book.id);row.evidence.push({id:id(e.id),text:fragment,kind:['highlight','note','review','card'].includes(e.kind)?e.kind:'note'});
    if(row.evidence.length>12||books.size>8)throw Error('一次最多 8 本书，每本最多 12 段。');
  }
  if(seen.size<2)throw Error('请至少勾选两段原材料，让问题能够往下展开。');
  return {stage:'exploration',topic:cleanTopic,books:[...books.values()],wordlist:[],pairs:[]};
}
export function validateExploration(result,project,request){
  const t=result?.theme;if(!obj(t))throw Error('模型未返回可读取的问题线索。');
  const out={id:id(t.id,true),basis:'ai-draft'};
  if(out.id!==request.topic.id)throw Error('草稿不属于本次整理任务。');
  for(const [k,max]of [['name',60],['title',180],['opening',3000],['entry',300],['endTitle',180],['endBody',2000]])out[k]=str(t[k],max);
  out.start=id(t.start,true);
  const allowed=new Map(request.books.flatMap(b=>b.evidence.map(e=>[JSON.stringify([b.id,e.id]),e]))),quotes=new Set();
  out.nodes=array(t.nodes,12).map(n=>{
    if(!obj(n)||!obj(n.quote))throw Error('有一处线索缺少原文依据。');
    const node={id:id(n.id,true)};
    for(const [k,max]of [['title',180],['subtitle',300],['context',1200],['observation',1200]])node[k]=str(n[k],max);
    const q=n.quote;node.quote={bookId:id(q.bookId),evidenceId:id(q.evidenceId),excerpt:str(q.excerpt,1500)};
    const e=allowed.get(JSON.stringify([q.bookId,q.evidenceId])),b=project.books.find(b=>b.id===q.bookId&&b.included!==false),original=b?.evidence.find(e=>e.id===q.evidenceId&&e.included!==false);
    if(!e?.text.includes(q.excerpt)||!original?.text.includes(q.excerpt))throw Error('草稿引文与本次所选原材料不符，未加入项目。');
    const key=JSON.stringify([q.bookId,q.evidenceId,q.excerpt]);if(quotes.has(key))throw Error('草稿重复使用同一段引文，缺少新的探索内容。');quotes.add(key);
    node.choices=array(n.choices,3).map(c=>({target:id(c?.target,true),label:str(c?.label,180),hint:str(c?.hint,400),bridge:str(c?.bridge,1000)}));
    if(new Set(node.choices.map(c=>c.target)).size!==node.choices.length)throw Error('草稿有重复的探索方向。');return node;
  });
  const nodes=new Map(out.nodes.map(n=>[n.id,n]));
  if(nodes.size!==out.nodes.length||nodes.size<2||!nodes.has(out.start))throw Error('草稿起点缺失、线索太少或标识重复。');
  for(const n of nodes.values())for(const c of n.choices)if(!nodes.has(c.target))throw Error('草稿有尚未展开的空方向。');
  const seen=new Set(),visit=x=>{if(seen.has(x))return;seen.add(x);nodes.get(x).choices.forEach(c=>visit(c.target));};visit(out.start);
  if(seen.size!==nodes.size||!out.nodes.some(n=>!n.choices.length))throw Error('草稿有不可到达的线索或缺少明确停留点。');
  if(nodes.size>=3&&!out.nodes.some(n=>n.choices.length>=2))throw Error('草稿只有单一路线，请重试整理出可以自选的方向。');
  return out;
}
