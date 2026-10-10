from pathlib import Path
import asyncio
import importlib.util
import json
import shutil
import tempfile
import subprocess
import os
import threading
import zipfile
from playwright.async_api import async_playwright

REPO=Path(__file__).resolve().parents[1]
OUT=Path(os.environ.get('READING_TEST_OUTPUT',tempfile.mkdtemp(prefix='reading-atlas-tests-')))
OUT.mkdir(parents=True,exist_ok=True)
fixture_module=(REPO/'tests/fixtures/atlas-project.mjs').as_uri()
core_module=(REPO/'web/core.mjs').as_uri()
script=f"const {{atlasFixture}}=await import({json.dumps(fixture_module)});const {{normalize}}=await import({json.dumps(core_module)});process.stdout.write(JSON.stringify(normalize(atlasFixture())));"
generated=subprocess.run(['node','--input-type=module','-e',script],capture_output=True,text=True,encoding='utf-8',check=True)
(OUT/'bridge-fixture.json').write_text(generated.stdout,encoding='utf-8')
spec=importlib.util.spec_from_file_location('standalone_server',REPO/'server.py');s=importlib.util.module_from_spec(spec);spec.loader.exec_module(s)
async def run():
    checks={};errors=[];requests=[]
    # A clean temporary checkout contains only the deployable web/service files, no cc/private preview.
    with tempfile.TemporaryDirectory() as temporary:
        isolated=Path(temporary)/'standalone';isolated.mkdir();shutil.copytree(REPO/'web',isolated/'web')
        shutil.copyfile(REPO/'server.py',isolated/'server.py');shutil.copyfile(REPO/'exploration.py',isolated/'exploration.py')
        isolated_spec=importlib.util.spec_from_file_location('isolated_atlas_server',isolated/'server.py');server_module=importlib.util.module_from_spec(isolated_spec);isolated_spec.loader.exec_module(server_module)
        def no_model(*args):raise AssertionError('No AI call authorized by this browser test')
        store=server_module.Jobs(no_model);server=server_module.Server(('127.0.0.1',0),jobs=store)
        threading.Thread(target=server.serve_forever,daemon=True).start();base=f'http://127.0.0.1:{server.server_port}'
        try:
            async with async_playwright() as pw:
                browser=await pw.chromium.launch(channel='msedge',headless=True)
                page=await browser.new_page(viewport={'width':1500,'height':1000},accept_downloads=True)
                page.on('pageerror',lambda e:errors.append(str(e)));page.on('request',lambda r:requests.append((r.method,r.url)))
                page.on('dialog',lambda dialog:asyncio.create_task(dialog.dismiss()))
                await page.goto(base+'/atlas/index.html');await page.locator('#landing h1').wait_for()
                assert await page.locator('#share-project').is_disabled()
                assert (await page.request.get(base+'/explore/themes-project.json')).status==404
                assert (await page.request.get(base+'/atlas/themes-project.json')).status==404
                await page.locator('#first-example').click();await page.locator('#catalog-title').wait_for()
                assert '公开案例' in await page.locator('#catalog-title').inner_text()
                assert '私人材料' not in await page.locator('#project-dialog').inner_text()
                assert not any('/themes-project.json' in url for method,url in requests)
                checks['isolated_checkout_empty_by_default_and_public_example_only']=True
                await page.goto(base+'/');await page.locator('#files').set_input_files(str(OUT/'bridge-fixture.json'));await page.locator('#workspace').wait_for()
                async with page.expect_popup() as popup:await page.locator('#open-atlas').click()
                atlas=await popup.value;atlas.on('pageerror',lambda e:errors.append(str(e)));atlas.on('request',lambda r:requests.append((r.method,r.url)))
                await atlas.locator('#story').wait_for();assert await atlas.locator('#thought').input_value()=='PRIVATE_NOTE_SECOND'
                assert await atlas.locator('#return-universe').is_visible();assert await atlas.locator('#walk button').count()==2
                await atlas.locator('#thought').fill('PRIVATE_NOTE_CHANGED_IN_EXPLORATION')
                await atlas.locator('#return-universe').click();await page.wait_for_function('document.querySelector("#notice").textContent.includes("探索线索与笔记已带回")')
                async with page.expect_download() as dl:await page.locator('#save').click()
                downloaded=await dl.value;await downloaded.save_as(str(OUT/'bridge-formal-return.json'))
                saved=json.loads((OUT/'bridge-formal-return.json').read_text(encoding='utf-8'))
                assert saved['format']=='reading-universe-private' and saved['books'][0]['evidence'][0]['id']=='stable-door'
                assert saved['journey']['sessions'][0]['notes'][1][1]=='PRIVATE_NOTE_CHANGED_IN_EXPLORATION'
                assert saved['links'][0]['reason']=='PRIVATE_LINK_REASON' and saved['settings']['aliases']=={'出发':'远行'}
                assert saved['edits']['cards']['远行']=='PRIVATE_EDIT_CARD' and saved['books'][0]['rating']=='4'
                checks['graph_to_exploration_and_explicit_return_preserve_original_metadata']=True
                # Alter both pages; returning must keep the current graph and leave the exploration downloadable.
                await page.locator('details.card summary').click()
                await page.locator('#book-tags').fill('图谱页新的修改');await page.locator('#edit-tags').click()
                await atlas.locator('#thought').fill('PRIVATE_NOTE_SECOND_CHANGE');await atlas.locator('#return-universe').click()
                await atlas.wait_for_function('document.querySelector("#notice").textContent.includes("图谱页面已经改变")')
                assert await page.locator('#book-tags').input_value()=='图谱页新的修改'
                checks['concurrent_graph_changes_block_overwrite']=True
                async with atlas.expect_download() as dl:await atlas.locator('#save-project').click()
                await (await dl.value).save_as(str(OUT/'bridge-exploration-save.json'))
                preserved=json.loads((OUT/'bridge-exploration-save.json').read_text(encoding='utf-8'))
                assert preserved['format']=='reading-universe-private' and preserved['journey']['sessions'][0]['notes'][1][1]=='PRIVATE_NOTE_SECOND_CHANGE'
                await atlas.close()
                await page.locator('#files').set_input_files(str(OUT/'bridge-exploration-save.json'))
                async with page.expect_popup() as popup:await page.locator('#open-atlas').click()
                atlas=await popup.value;atlas.on('pageerror',lambda e:errors.append(str(e)));await atlas.locator('#story').wait_for()
                assert await atlas.locator('#thought').input_value()=='PRIVATE_NOTE_SECOND_CHANGE'
                assert await atlas.locator('#reader [data-pin="door"]').count()==0  # reader at the train; pin remains on its own node
                await atlas.locator('#walk [data-step="0"]').click();assert await atlas.locator('#thought').input_value()=='PRIVATE_NOTE_FIRST'
                assert await atlas.locator('#reader [data-pin="door"]').get_attribute('aria-pressed')=='true'
                checks['cross_entry_save_reopen_restores_notes_pins_and_route']=True
                await atlas.locator('#share-project').click();assert await atlas.locator('#share-books input').count()==2
                await atlas.locator('#preview-share').click();await atlas.frame_locator('#share-viewer').locator('canvas').first.wait_for()
                assert '公开2本' in await atlas.locator('#share-report').inner_text()
                await atlas.screenshot(path=str(OUT/'69-atlas-public-preview.png'))
                await atlas.locator('#share-books input[value="other"]').uncheck()
                assert await atlas.locator('#share-viewer').is_hidden()
                async with atlas.expect_download() as dl:await atlas.locator('#download-share').click()
                await (await dl.value).save_as(str(OUT/'bridge-public.zip'))
                with zipfile.ZipFile(OUT/'bridge-public.zip') as package:
                    assert set(package.namelist())=={'index.html','viewer-data.js','universe.js','lib/vis-network.min.js','graph_data.js','universe_data.js','README.txt'}
                    combined='\n'.join(package.read(name).decode('utf-8') for name in package.namelist())
                    for token in ['PRIVATE_','EXCLUDED_BOOK_TITLE','另一段旅程','stable-door','门口停了一会儿','own-theme','2026-01-02','SECRET_TOKEN']:assert token not in combined,token
                    public_dir=OUT/'bridge-public-offline';public_dir.mkdir(exist_ok=True);package.extractall(public_dir)
                checks['public_zip_every_file_excludes_private_material_notes_and_hidden_book']=True
                await atlas.locator('#close-share').click()
                offline=await browser.new_page();offline.on('pageerror',lambda e:errors.append(str(e)));await offline.goto((public_dir/'index.html').as_uri());await offline.locator('canvas').first.wait_for()
                await offline.screenshot(path=str(OUT/'70-atlas-public-offline.png'));await offline.close()
                checks['public_zip_opens_offline']=True
                await atlas.set_viewport_size({'width':390,'height':844});await atlas.screenshot(path=str(OUT/'71-atlas-mobile.png'))
                assert await atlas.evaluate('document.documentElement.scrollWidth<=innerWidth')
                assert await atlas.locator('#open-compose').evaluate('e=>parseFloat(getComputedStyle(e).fontSize)>=12')
                await atlas.locator('#atlas-more summary').click();await atlas.locator('#share-project').click();assert await atlas.evaluate('document.documentElement.scrollWidth<=innerWidth')
                await atlas.screenshot(path=str(OUT/'72-atlas-mobile-sharing.png'))
                await atlas.locator('#close-share').click();await atlas.locator('#night').click();assert await atlas.evaluate('document.documentElement.scrollWidth<=innerWidth')
                checks['mobile_exploration_sharing_and_night_no_overflow']=True
                await atlas.evaluate("window.postMessage({type:'reading-atlas-load',project:{books:[]}},location.origin)")
                assert await atlas.locator('#story').is_visible()
                checks['unsolicited_window_transfer_does_not_replace_current_project']=True
                checks['no_page_errors_or_model_calls']=not errors and not store.jobs
                checks['no_private_data_in_url_and_no_exploration_persistent_storage']=all('PRIVATE_' not in url and 'stable-door' not in url for _,url in requests) and await atlas.evaluate('localStorage.length===0&&sessionStorage.length===0')
                report={'checks':checks,'errors':errors,'real_ai_calls':0,'private_preview_directory_present':False}
                (OUT/'project-bridge-browser-verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(report,ensure_ascii=False));assert all(checks.values())
                await browser.close()
        finally:store.closed=True;server.shutdown();server.server_close()
asyncio.run(run())
