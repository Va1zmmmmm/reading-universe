import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {normalize,buildViews,themeCards,publicProject,tagsFor,privatePackage} from '../web/core.mjs';
const args=process.argv.slice(2),get=name=>args[args.indexOf(name)+1];
if(!args.includes('--workspace'))throw Error('请显式指定 --workspace <私人工作区>，不会默认使用作者数据。');
const workspace=path.resolve(get('--workspace')),root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
await fs.mkdir(workspace,{recursive:true});
let project;
if(args.includes('--import')){
  const source=path.resolve(get('--import')),files=Object.create(null);
  async function scan(dir){for(const e of await fs.readdir(dir,{withFileTypes:true})){const file=path.join(dir,e.name);if(e.isSymbolicLink())continue;if(e.isDirectory()){if(['highlights','cards','links','themes','notes'].includes(e.name)||dir!==source)await scan(file);}else if(/\.(json|md)$/.test(e.name))files[path.relative(source,file).split(path.sep).join('/')]=await fs.readFile(file,'utf8');}}
  await scan(source);
  if(args.includes('--extra')){const extra=path.resolve(get('--extra'));for(const name of ['theme_tags.json'])files[name]=await fs.readFile(path.join(extra,name),'utf8');for(const name of await fs.readdir(path.join(extra,'themes')))if(name.endsWith('.md'))files['themes/'+name]=await fs.readFile(path.join(extra,'themes',name),'utf8');}
  project=normalize(JSON.parse(files['books.json']),files);
  await fs.writeFile(path.join(workspace,'project.json'),JSON.stringify(privatePackage(project)));
}else project=normalize(JSON.parse(await fs.readFile(path.join(workspace,'project.json'),'utf8')));
if(args.includes('--public')){const excluded=args.includes('--exclude')?get('--exclude').split(','):[];project=publicProject(project,project.books.filter(b=>!excluded.includes(b.id)).map(b=>b.id),{metrics:true,relations:true}).project;}
const output=path.resolve(args.includes('--out')?get('--out'):path.join(workspace,'preview'));await fs.mkdir(output,{recursive:true});
const views=buildViews(project),safe=value=>JSON.stringify(value).replace(/</g,'\\u003c');
await fs.writeFile(path.join(output,'graph_data.js'),'window.GRAPH = '+safe(views.graph)+';');
await fs.writeFile(path.join(output,'universe_data.js'),'window.UNIVERSE = '+safe(views.universe)+';');
for(const name of ['viewer-data.js','universe.js'])await fs.copyFile(path.join(root,'web',name),path.join(output,name));
await fs.copyFile(path.join(root,'web/viewer.html'),path.join(output,'index.html'));
await fs.mkdir(path.join(output,'lib'),{recursive:true});await fs.copyFile(path.join(root,'web/lib/vis-network.min.js'),path.join(output,'lib/vis-network.min.js'));
if(args.includes('--compat')){
  const target=path.resolve(get('--compat'));await fs.mkdir(path.join(target,'themes'),{recursive:true});
  await fs.writeFile(path.join(target,'theme_tags.json'),JSON.stringify(Object.fromEntries(project.books.map(b=>[b.id,{title:b.title,tags:tagsFor(project,b)}])),null,1));
  for(const [theme,card]of Object.entries(themeCards(project)))if(!/[\\/:]/.test(theme))await fs.writeFile(path.join(target,'themes',theme+'.md'),card);
}
console.log(JSON.stringify({books:project.books.length,themes:views.graph.stats.themes,links:project.links.length,output}));
