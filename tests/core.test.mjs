import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalize,buildViews,publicProject,privatePackage,validateLinks,fingerprint,updateProject,candidatePairs} from '../web/core.mjs';
import {makeZip,readZip} from '../web/zip.mjs';

test('large highlight caches retain the complete reader review and card',()=>{
  const highlights=Array.from({length:130},(_,i)=>({markText:`划线${i}`}));
  const p=normalize({books:[{bookId:'many',title:'材料多的书',myReview:{content:'读者的未解问题'}}]},
    {'highlights/many.json':JSON.stringify(highlights),'cards/many.md':'# 卡片\n\n人物的对白不能变成一般处方。'});
  const evidence=p.books[0].evidence;
  assert.equal(evidence.length,100);assert.equal(new Set(evidence.map(e=>e.id)).size,100);
  assert.equal(evidence.find(e=>e.kind==='review').text,'读者的未解问题');
  assert.equal(evidence.find(e=>e.kind==='card').text,'# 卡片\n\n人物的对白不能变成一般处方。');
  assert.equal(privatePackage(p).books[0].evidence.find(e=>e.kind==='card').text,evidence.find(e=>e.kind==='card').text);
});

test('view counts distinguish complete books, finished books and missing cards',()=>{
  const p=normalize({books:[{id:'card',title:'有卡',finishTime:'2026-01-01'},{id:'no-card',title:'留待整理',finishTime:'2026-02-01'},{id:'unread',title:'未读'}]}, {'cards/card.md':'# 读后卡'});
  const stats=buildViews(p).graph.stats;
  assert.equal(stats.books,3);assert.equal(stats.finished,2);assert.equal(stats.withoutCard,1);
  assert.equal(buildViews(publicProject(p,['card'],{}).project).graph.stats.finished,0);
});
test('new user never inherits author tags/cards; untagged books stay visible',()=>{
  const a=normalize({books:[{id:'a',title:'A'}]},{'theme_tags.json':'{"a":{"tags":["主题A"]},"other":{"tags":["作者主题"]}}','themes/主题A.md':'卡A'});
  const b=normalize({books:[{id:'b',title:'B'}]});
  assert.equal(buildViews(a).graph.stats.books,1);assert.equal(buildViews(b).universe.books[0].title,'B');assert.equal(buildViews(b).graph.nodes.length,1);assert(!JSON.stringify(b).includes('作者主题'));
});
test('private packages whitelist fields and retain manual work across rebuild',()=>{
  const p=normalize({books:[{id:'a',title:'A',highlights:['材料']}]});p.edits.books.a={tags:['手改']};p.edits.cards['手改']='我的卡';p.key='SECRET';p.cookie='SESSION';
  const restored=privatePackage(p);assert(!JSON.stringify(restored).includes('SECRET'));assert.equal(buildViews(restored).graph.nodes.find(n=>n.group==='theme').card,'我的卡');assert.equal(restored.books[0].evidence[0].text,'材料');
});
test('public export removes hidden-book references, all private prose and evidence',()=>{
  const p=normalize({books:[{id:'a',title:'Public',highlights:['PRIVATE_SENTINEL']},{id:'b',title:'HiddenBook'}]});p.analysis.a={tags:['Topic','HiddenBook'],summary:'HiddenBook PRIVATE_SENTINEL'};p.cards.Topic='HiddenBook PRIVATE_SENTINEL';p.edits.cards.Topic='MY_SECRET';p.links=[{source:'a',target:'b',targetType:'book',type:'contrast',reason:'HiddenBook',evidenceIds:[],basis:'manual'}];
  const out=publicProject(p,['a'],{relations:true});const serialized=JSON.stringify(buildViews(out.project));for(const token of ['HiddenBook','PRIVATE_SENTINEL','MY_SECRET'])assert(!serialized.includes(token));assert.equal(out.project.books[0].evidence.length,0);
});
test('forged evidence and orphan relations are rejected',()=>{
  const p=normalize({books:[{id:'a',title:'A',highlights:['test']},{id:'b',title:'B'}]});assert.deepEqual(validateLinks([{source:'a',target:'b',targetType:'book',evidenceIds:['fake']}],p),[]);
});
test('duplicates rejected and cache changes with input, prompt settings and model',async()=>{
  assert.throws(()=>normalize({books:[{id:'a',title:'A'},{id:'a',title:'B'}]}));const b=normalize({books:[{id:'a',title:'A'}]}).books[0];assert.notEqual(await fingerprint(b,{},'m1'),await fingerprint(b,{},'m2'));assert.notEqual(await fingerprint(b,{},'m1'),await fingerprint({...b,title:'changed'},{},'m1'));
});
test('ZIP roundtrip and path traversal rejected',async()=>{
  const blob=makeZip({'books.json':'{"books":[]}','cards/a.md':'# 中文'});const out=await readZip(await blob.arrayBuffer());assert.equal(out['cards/a.md'],'# 中文');await assert.rejects(readZip(await makeZip({'../escape.json':'{}'}).arrayBuffer()));
});
test('prototype-looking names cannot mutate theme containers',()=>{
  const p=normalize({books:[{id:'safe',title:'Safe'}]},{'theme_tags.json':'{"safe":{"tags":["__proto__","constructor","Topic"]}}'});assert.equal(buildViews(p).graph.stats.themes,1);
});
test('book-list update removes deleted books and keeps manual tags',()=>{
  const p=normalize({books:[{id:'a',title:'A'},{id:'b',title:'Deleted'}]});p.edits.books.a={tags:['Human']};p.analysis.a={tags:['Generated'],fingerprint:'old'};p.cards.Generated='Contains Deleted';
  const next=updateProject(p,normalize({books:[{id:'a',title:'A changed'}]}));assert.equal(next.books.length,1);assert.deepEqual(next.edits.books.a.tags,['Human']);assert(!Object.values(next.cards).some(c=>c.includes('Deleted')));
});
test('negative pair analysis is cached; changed evidence invalidates it',()=>{
  const p=normalize({books:[{id:'a',title:'A',highlights:['A']},{id:'b',title:'B',highlights:['B']}]});p.analysis.a={tags:['Same'],fingerprint:'hash-a'};p.analysis.b={tags:['Same'],fingerprint:'hash-b'};assert.equal(candidatePairs(p).length,1);p.linkCache['a|b']='hash-a|hash-b';assert.equal(candidatePairs(p).length,0);p.analysis.b.fingerprint='new';assert.equal(candidatePairs(p).length,1);
});
