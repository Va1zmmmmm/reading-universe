// Pure public-only contract, also bundled into the offline reader. No private-project imports.
export function validatePublicAtlas(input){
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
