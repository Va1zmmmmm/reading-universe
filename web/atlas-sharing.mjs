import {normalizeProject} from './atlas-project.mjs';
import {validatePublicAtlas} from './public-atlas-contract.mjs';

export function makePublicAtlas(input,publicBooks,permissions){
  const source=normalizeProject(input);
  if(!Array.isArray(permissions)||!permissions.length||permissions.length>100)throw Error('请选择要公开的探索主题。');
  const visible=new Set(publicBooks.map(b=>b.id)),hiddenTitles=source.books.filter(b=>!visible.has(b.id)).map(b=>b.title),usedThemes=new Set();
  const approvedText=value=>{if(hiddenTitles.some(title=>value.includes(title)))throw Error('选中的探索文字提到了未公开的书。请把该书纳入公开范围，或先修订这段文字。');return value;};
  const themes=permissions.map((permission,ti)=>{
    const original=source.exploration.themes.find(t=>t.id===permission?.id);
    if(!original||usedThemes.has(original.id)||permission.introduction!==true)throw Error('主题缺失、重复，或尚未选择公开开场与停留说明。');usedThemes.add(original.id);
    if(!Array.isArray(permission.nodes)||!permission.nodes.length)throw Error('请选择要公开的线索。');
    const selected=new Map();for(const item of permission.nodes){if(!original.nodes.some(n=>n.id===item?.id)||selected.has(item.id)||item.interpretation!==true)throw Error('选中的线索必须逐项确认公开解读，不能重复或指向缺失内容。');selected.set(item.id,item);}
    if(!selected.has(original.start))throw Error('公开探索必须包含开场线索；可取消其他分支，保留一条完整去路。');
    const ordered=original.nodes.filter(n=>selected.has(n.id)),ids=new Map(ordered.map((n,i)=>[n.id,'n-'+(i+1)]));
    const theme={id:'theme-'+(ti+1),basis:original.basis==='ai-draft'?'ai-draft':'curated',start:ids.get(original.start),nodes:[]};
    for(const key of ['name','title','opening','entry','endTitle','endBody'])theme[key]=approvedText(original[key]);
    theme.nodes=ordered.map(n=>{
      if(!visible.has(n.quote.bookId))throw Error('公开线索所对应的书尚未纳入公开书目。');
      const book=source.books.find(b=>b.id===n.quote.bookId),material=book.evidence.find(e=>e.id===n.quote.evidenceId);
      const node={id:ids.get(n.id),bookId:book.id,materialKind:material.kind,choices:n.choices.filter(c=>selected.has(c.target)).map(c=>({target:ids.get(c.target),label:approvedText(c.label),hint:approvedText(c.hint),bridge:approvedText(c.bridge)}))};
      for(const key of ['title','subtitle','context','observation'])node[key]=approvedText(n[key]);
      if(selected.get(n.id).quote===true)node.quote={excerpt:approvedText(n.quote.excerpt)};
      return node;
    });
    return theme;
  });
  // Only selected public metadata and approved prose. No evidence IDs, source locators or private state.
  return validatePublicAtlas({format:'reading-atlas-public',version:1,books:publicBooks.map(b=>({id:b.id,title:b.title,author:b.author})),themes});
}
