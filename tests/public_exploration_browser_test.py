from pathlib import Path
import asyncio
import importlib.util
import json
import os
import shutil
import subprocess
import tempfile
import threading
import zipfile
from playwright.async_api import async_playwright

REPO=Path(__file__).resolve().parents[1]
OUT=Path(os.environ.get('READING_TEST_OUTPUT',tempfile.mkdtemp(prefix='reading-public-tests-')))
OUT.mkdir(parents=True,exist_ok=True)
fixture=(REPO/'tests/fixtures/atlas-project.mjs').as_uri()
script="""const {atlasFixture}=await import(FIXTURE);const p=atlasFixture(),t=p.exploration.themes[0];
t.nodes.push({...structuredClone(t.nodes[1]),id:'side',title:'停下来再看看',choices:[]});
t.nodes.push({...structuredClone(t.nodes[1]),id:'private-branch',title:'PRIVATE_BRANCH_TITLE',context:'PRIVATE_BRANCH_PROSE',choices:[]});
t.nodes[0].choices.push({target:'side',label:'留下来，会看见什么？',hint:'回到出发前的停留。',bridge:'把上车换成停留，重新看这段材料。'},{target:'private-branch',label:'PRIVATE_BRANCH_LABEL',hint:'PRIVATE_BRANCH_HINT',bridge:'PRIVATE_BRANCH_BRIDGE'});
t.nodes[1].choices.push({target:'door',label:'回到门口',hint:'换一次方向',bridge:'从车窗回到出发之前。'});
t.nodes[0].observation+='<img src=x onerror="window.UNSAFE=true">';
const second=structuredClone(t);second.id='second-private-theme';second.name='换一个位置';second.title='同一段材料，能不能换一种读法？';p.exploration.themes.push(second);
process.stdout.write(JSON.stringify(p));""".replace('FIXTURE',json.dumps(fixture))
generated=subprocess.run(['node','--input-type=module','-e',script],capture_output=True,text=True,encoding='utf-8',check=True)
(OUT/'public-fixture.json').write_text(generated.stdout,encoding='utf-8')

async def run():
    checks={};errors=[];requests=[];downloads=[]
    with tempfile.TemporaryDirectory() as directory:
        isolated=Path(directory)/'clean';isolated.mkdir();shutil.copytree(REPO/'web',isolated/'web')
        for name in ['server.py','exploration.py']:shutil.copyfile(REPO/name,isolated/name)
        spec=importlib.util.spec_from_file_location('public_server',isolated/'server.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        def no_model(*args):raise AssertionError('No AI request authorized')
        store=module.Jobs(no_model);server=module.Server(('127.0.0.1',0),jobs=store);threading.Thread(target=server.serve_forever,daemon=True).start()
        base=f'http://127.0.0.1:{server.server_port}'
        try:
            async with async_playwright() as pw:
                browser=await pw.chromium.launch(channel='msedge',headless=True)
                page=await browser.new_page(viewport={'width':1440,'height':1000},accept_downloads=True)
                page.on('pageerror',lambda e:errors.append(str(e)));page.on('request',lambda r:requests.append((r.method,r.url)));page.on('download',lambda d:downloads.append(d))
                await page.goto(base+'/atlas/index.html')
                await page.locator('#import-files').set_input_files(str(OUT/'public-fixture.json'))
                await page.locator('#story').wait_for();await page.locator('#share-project').click()
                await page.locator('#share-books input[value="other"]').uncheck()
                await page.locator('#share-exploration').check()
                await page.locator('#preview-share').click()
                assert '请选择要公开' in await page.locator('#share-report').inner_text(),await page.locator('#share-report').inner_text()
                assert await page.locator('#share-viewer').is_hidden()
                themes=page.locator('#share-permissions details')
                for i in range(2):
                    theme=themes.nth(i);await theme.locator('summary').click();await theme.locator('[data-publish-theme]').check()
                    await page.locator('#preview-share').click();assert '开场' in await page.locator('#share-report').inner_text()
                    await theme.locator('[data-introduction]').check()
                    await theme.locator('[data-node="private-branch"] [data-publish-node]').uncheck()
                    await page.locator('#preview-share').click();assert '解读' in await page.locator('#share-report').inner_text()
                    for nid in ['door','train','side']:await theme.locator(f'[data-node="{nid}"] [data-interpretation]').check()
                    # Explicitly publish only the train excerpt, not the start or side.
                    await theme.locator('[data-node="train"] [data-quote]').check()
                    await theme.locator('summary').click()
                checks['explicit_per_theme_introduction_and_node_interpretation_gates']=True
                await page.locator('#preview-share').click()
                frame=page.frame_locator('#share-viewer');await frame.locator('#public-story').wait_for()
                assert await frame.locator('#public-walk button').count()==1
                assert '原文没有公开' in await frame.locator('#public-story').inner_text()
                assert await frame.locator('#public-choices button').count()==2
                assert not await frame.locator('#public-story img').count()
                assert await frame.locator('#public-graph').is_hidden()
                await page.screenshot(path=str(OUT/'73-selected-public-preview.png'))
                await frame.locator('#public-choices [data-node="n-2"]').click()
                assert '车窗外有一棵树。' in await frame.locator('#public-story blockquote').inner_text()
                assert '从「门口的停留」来到这里' in await frame.locator('.bridge').inner_text()
                assert await frame.locator('#public-frontier button').count()==1
                checks['visitor_starts_fresh_with_optional_quotes_and_remaining_branches']=True
                # Changing permissions must remove the old preview immediately.
                await themes.nth(0).locator('summary').click();await themes.nth(0).locator('[data-node="train"] [data-quote]').uncheck()
                assert await page.locator('#share-viewer').is_hidden();assert await page.evaluate('window.__publicAtlas===undefined')
                await themes.nth(0).locator('[data-node="train"] [data-quote]').check();await themes.nth(0).locator('summary').click()
                checks['permission_changes_invalidate_preview']=True
                # A scope change while resources are being read cannot export the older selection.
                reached=asyncio.Event();release=asyncio.Event()
                async def slow(route):reached.set();await release.wait();await route.continue_()
                await page.route('**/public-reader.js',slow);await page.locator('#download-share').click();await reached.wait()
                await page.locator('#share-metrics').check();release.set()
                await page.wait_for_function('document.querySelector("#share-report").textContent.includes("下载准备期间")')
                assert not downloads
                await page.unroute('**/public-reader.js',slow);await page.locator('#share-metrics').uncheck()
                checks['selection_changes_during_export_cancel_stale_download']=True
                async with page.expect_download() as pending:await page.locator('#download-share').click()
                await (await pending.value).save_as(str(OUT/'selected-public.zip'))
                public_dir=OUT/'selected-public-offline';public_dir.mkdir(exist_ok=True)
                with zipfile.ZipFile(OUT/'selected-public.zip') as package:
                    expected={'index.html','public-reader.css','public-reader.js','public-data.js','graph.html','viewer-data.js','universe.js','lib/vis-network.min.js','graph_data.js','universe_data.js','README.txt'}
                    assert set(package.namelist())==expected
                    combined='\n'.join(package.read(n).decode('utf-8') for n in package.namelist())
                    for token in ['PRIVATE_','SECRET_TOKEN','stable-door','stable-train','bookmark-door','own-theme','second-private-theme','今天出发','它向后移动','门口停了一会儿。','EXCLUDED_BOOK_TITLE','另一段旅程','2026-01-02']:assert token not in combined,token
                    assert '车窗外有一棵树。' in combined
                    package.extractall(public_dir)
                checks['every_export_file_excludes_private_notes_unselected_sources_and_branch_ids']=True
                offline=await browser.new_page(viewport={'width':1440,'height':1000});offline.on('pageerror',lambda e:errors.append(str(e)));offline.on('request',lambda r:requests.append((r.method,r.url)))
                await offline.goto((public_dir/'index.html').as_uri());await offline.locator('#public-story').wait_for()
                await offline.screenshot(path=str(OUT/'74-public-offline-desktop.png'))
                assert await offline.locator('#public-walk button').count()==1
                assert not await offline.evaluate('window.UNSAFE')
                await offline.locator('#public-choices [data-node="n-2"]').click();await offline.locator('#public-restart').click()
                for _ in range(30):
                    await offline.locator('#public-seen summary').click()
                    await offline.locator('#public-seen [data-node="n-2"]').click()
                    await offline.locator('#public-restart').click()
                assert await offline.locator('#public-walk button').count()==2
                await offline.locator('#public-seen summary').click();await offline.locator('#public-seen [data-node="n-2"]').click()
                assert '桥' not in await offline.locator('.bridge').inner_text()  # actual bridge prose, not a placeholder
                await offline.locator('#public-frontier [data-node="n-3"]').click()
                assert await offline.locator('#public-walk button').count()==3
                assert '全部遇见' in await offline.locator('#public-ending').inner_text()
                final_url=offline.url;await offline.reload();await offline.locator('#public-story').wait_for()
                assert '停下来再看看' in await offline.locator('#public-story h2').inner_text()
                assert await offline.locator('#public-walk button').count()==3
                await offline.locator('#public-themes [data-theme="theme-2"]').click();assert await offline.locator('#public-walk button').count()==1
                await offline.locator('#public-themes [data-theme="theme-1"]').click();assert await offline.locator('#public-walk button').count()==3
                await offline.go_back();assert '换一个位置' in await offline.locator('#public-breadcrumb').inner_text()
                await offline.go_forward();assert await offline.locator('#public-walk button').count()==3
                fresh=await browser.new_page();await fresh.goto((public_dir/'index.html').as_uri());await fresh.locator('#public-story').wait_for();assert await fresh.locator('#public-walk button').count()==1;await fresh.close()
                checks['offline_loops_are_bounded_refresh_history_and_theme_sessions_work']=True
                await offline.set_viewport_size({'width':390,'height':844});await offline.locator('#public-restart').click()
                assert await offline.evaluate('document.documentElement.scrollWidth<=innerWidth')
                await offline.screenshot(path=str(OUT/'75-public-offline-mobile.png'))
                await offline.locator('#public-seen summary').click();await offline.locator('#public-seen [data-node="n-2"]').click();await offline.locator('#public-night').click()
                assert await offline.evaluate('document.documentElement.scrollWidth<=innerWidth')
                await offline.screenshot(path=str(OUT/'76-public-offline-mobile-night.png'))
                await offline.locator('#public-graph').click();await offline.locator('canvas').first.wait_for()
                await offline.goto((public_dir/'graph.html').as_uri()+'?universe');await offline.locator('canvas').first.wait_for()
                checks['offline_mobile_night_graph_and_universe_render']=True
                await page.set_viewport_size({'width':390,'height':844});await themes.nth(0).locator('summary').click()
                assert await page.evaluate('document.documentElement.scrollWidth<=innerWidth')
                await page.screenshot(path=str(OUT/'77-mobile-public-permissions.png'))
                checks['owner_mobile_permissions_readable_without_overflow']=True
                # Corrupt public routes fail closed and never attempt to load a private project.
                broken=OUT/'broken-public';broken.mkdir(exist_ok=True)
                for name in ['index.html','public-reader.js','public-reader.css']:shutil.copyfile(public_dir/name,broken/name)
                (broken/'public-data.js').write_text('window.READING_ATLAS_PUBLIC={format:"reading-atlas-public",version:1,books:[],themes:[]};',encoding='utf-8')
                await offline.goto((broken/'index.html').as_uri());await offline.locator('#public-error').wait_for()
                assert await offline.locator('#public-layout').is_hidden()
                checks['invalid_public_package_fails_closed']=True
                checks['no_page_errors_model_requests_or_persistent_visitor_storage']=not errors and not store.jobs and all(method=='GET' for method,url in requests) and await offline.evaluate('localStorage.length===0&&sessionStorage.length===0')
                report={'checks':checks,'errors':errors,'real_ai_calls':0,'standalone_without_private_preview':True}
                (OUT/'public-exploration-browser-verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(report,ensure_ascii=False));assert all(checks.values())
                await browser.close()
        finally:store.closed=True;server.shutdown();server.server_close()
asyncio.run(run())
