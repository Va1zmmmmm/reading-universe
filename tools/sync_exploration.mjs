// Build the standalone exploratory UI from the approved local template, without author data.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const repo=path.dirname(path.dirname(fileURLToPath(import.meta.url))),web=path.join(repo,'web'),preview=path.resolve(repo,'../../design-preview'),atlas=path.join(web,'atlas');
await fs.access(path.join(preview,'compose.html'));await fs.mkdir(atlas,{recursive:true});
for(const file of ['atlas-project.mjs','universe-fields.mjs'])await fs.copyFile(path.join(web,file),path.join(preview,file==='atlas-project.mjs'?'workspace-core.mjs':file));
for(const file of ['explore.css','trail.css','trail-story.css','themes.css','workspace.css','compose.css','compose.js','workspace-zip.mjs'])await fs.copyFile(path.join(preview,file),path.join(atlas,file));
await fs.writeFile(path.join(atlas,'workspace-core.mjs'),"export * from '../atlas-project.mjs';\n");
let html=await fs.readFile(path.join(preview,'compose.html'),'utf8');
html=html.replace('先看看作者样板 ↗','浏览作者公开案例 ↗').replace('作者的阅读样板','作者公开案例').replace('<script type="module" src="compose.js?v=1"></script>','<script type="module" src="compose.js?v=1"></script>\n<script type="module" src="../project-actions.mjs"></script>');
html=html.replace('旧版关系图和设置暂不迁入。','已定义的旧关联、修订、设置和阅读指标也会保留。').replace('含选定私人材料，仅供本机对照。与你的项目分开打开。','仅含已经公开的书目与主题，不加载作者私人原文。与你的项目分开打开。').replace('加载作者样板','加载作者公开案例');
html=html.replace('</head>','<link rel="stylesheet" href="../atlas-onboarding.css?v=1"></head>').replace('</body>','<script type="module" src="../atlas-onboarding.mjs?v=1"></script>\n</body>').replace(/[ \t]+(?=\r?$)/gm,'');
await fs.writeFile(path.join(atlas,'index.html'),html);
let script=await fs.readFile(path.join(preview,'workspace.js'),'utf8');
const start=script.indexOf('async function loadExample(){'),end=script.indexOf("$('first-import').onclick",start);
if(start<0||end<0)throw Error('Approved template entry changed; inspect before syncing.');
script=script.slice(0,start)+`async function loadExample(){
  const response=await fetch('../examples/author-public.json');if(!response.ok)throw Error('公开案例暂时未能打开。');
  const input=await response.json();input.name='作者公开案例';installOrStage(input,true);
}
`+script.slice(end);
script+="\nexport function openTransferredProject(value){installOrStage(value);}\nexport function projectNotice(message){notice(message);}\nexport function markProjectSaved(){dirty=false;}\n";
await fs.writeFile(path.join(atlas,'workspace.js'),script);
console.log('Standalone atlas UI built; no themes-project.json, author branches or private sample included.');
