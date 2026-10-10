import {explorationWorkspace,openTransferredProject,projectNotice} from './atlas/workspace.js?v=1';
const $=id=>document.getElementById(id);
const actions=document.querySelector('.landing-actions');
const trial=document.createElement('button');trial.id='try-demo';trial.className='primary-action';trial.textContent='先试玩一条线索';
actions.prepend(trial);$('first-import').classList.remove('primary-action');
const links=document.createElement('p');links.className='start-links';
links.innerHTML='<button id="start-paste">没有导出文件？粘贴文字开始</button><a href="../guide.html" target="_blank" rel="noopener">怎么用 ↗</a><a href="../index.html" target="_blank" rel="noopener">图谱与星空 ↗</a><a href="https://github.com/Va1zmmmmm/reading-universe" target="_blank" rel="noopener">开源代码 ↗</a>';
actions.after(links);
document.querySelector('.landing-detail').innerHTML='<span>完整工具 · 公开测试版</span><h2>先走一小段，再带入自己的阅读。</h2><p>试玩里有独处、记忆、选择三条线索。每处都有引入、原材料和不同去路，可以回头，也可以留下想法。</p><h2>自己的项目，慢慢往里长。</h2><p>导入书目、划线和笔记，或粘贴几段文字。选材料、整理草稿，再把认可的线索留下。图谱、星空和精选分享也都可用。</p><small>试玩无需 API key；用自己的材料生成新线索，需要填写自己的 key，费用由所选 AI 服务商收取。DeepSeek 已做真实小样本验证；OpenAI 生成仍未验证。</small>';
$('first-example').textContent='作者公开书目 ↗';
const caption=document.createElement('p');caption.id='trial-caption';caption.className='trial-caption';caption.hidden=true;
caption.textContent='试玩项目 · 6份原创示例手记，3条线索、18处可探索。文字和衔接由 AI 协助编写并逐处审阅，不是真实书摘或作者私人笔记。可写笔记、保存和分享；打开自己的项目会替换这份示例。';
$('workspace').prepend(caption);
window.addEventListener('reading-project-change',()=>{caption.hidden=explorationWorkspace()?.project.name!=='试玩 · 原创手记里的三条线索';});
async function openDemo(theme){
  trial.disabled=true;
  try{
    const response=await fetch('../examples/demo-project.json');if(!response.ok)throw Error('试玩材料暂时没有读到，可以稍后再试。');
    const project=await response.json();
    if(project.exploration.themes.some(t=>t.id===theme))project.journey.activeTheme=theme;
    openTransferredProject(project);
    projectNotice('试玩已打开。先读开场，再选一个想追问的方向；离开前可以保存项目。');
  }catch(e){projectNotice(e.message);}finally{trial.disabled=false;}
}
trial.onclick=()=>openDemo();
const paste=document.createElement('dialog');paste.id='paste-dialog';paste.className='project-dialog';
paste.innerHTML='<form id="paste-form"><div class="dialog-head"><h2>从几段文字开始</h2><button type="button" id="close-paste" aria-label="关闭文字导入">×</button></div><p>可以带入自己的读书笔记，或你有权使用的摘录。文字只在当前浏览器读取；之后只有你选中的片段才会提交给 AI。</p><label>书名或这份笔记的名字<input id="paste-title" required maxlength="300" placeholder="例如：我的阅读摘记"></label><label>作者或记录者<input id="paste-author" maxlength="200" placeholder="可留空"></label><label>这些文字来自哪里？<select id="paste-kind"><option value="note">我的笔记或批注</option><option value="highlight">书中的摘录或划线</option><option value="review">我的书评</option><option value="card">读书卡</option></select></label><label>文字内容<textarea id="paste-text" required maxlength="20000" rows="8" placeholder="每段之间空一行，会分成独立材料。至少两段可以整理问题线索。"></textarea></label><p>这是新项目；打开后可浏览材料、整理线索、保存续用。已有项目有未保存记录时，会先提示你保存。</p><p id="paste-error" role="alert" hidden></p><button class="primary-action" type="submit">带入文字，打开项目</button></form>';
document.body.append(paste);
const pasteButton=document.createElement('button');pasteButton.type='button';pasteButton.textContent='粘贴文字开始';pasteButton.id='choose-paste';
document.querySelector('.import-options').append(pasteButton);
function openPaste(){$('project-dialog').close();$('paste-error').hidden=true;paste.showModal();}
$('start-paste').onclick=openPaste;pasteButton.onclick=openPaste;$('close-paste').onclick=()=>paste.close();
$('paste-form').onsubmit=event=>{
  event.preventDefault();
  try{
    const title=$('paste-title').value.trim(),author=$('paste-author').value.trim(),paragraphs=$('paste-text').value.trim().split(/\n\s*\n/).map(t=>t.trim()).filter(Boolean);
    if(!title||!paragraphs.length)throw Error('请填写名字，并带入至少一段文字。');
    if(paragraphs.length>100)throw Error('这次最多带入100段，请分开整理。');
    const id='local-'+crypto.randomUUID();
    const project={name:title,books:[{id,title,author,evidence:paragraphs.map((text,i)=>({id:`${id}-${i+1}`,kind:$('paste-kind').value,text,sourceLocator:{ordinal:i+1}}))}]};
    openTransferredProject(project);paste.close();$('paste-title').value='';$('paste-author').value='';$('paste-text').value='';
  }catch(e){$('paste-error').hidden=false;$('paste-error').textContent=e.message;}
};
const requested=new URLSearchParams(location.search).get('demo');
if(requested&&!explorationWorkspace())await openDemo(requested);
