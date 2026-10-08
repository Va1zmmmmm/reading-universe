"""Browser end-to-end checks using a local fake AI transport (never real keys)."""
import importlib.util
import json
import os
import threading
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('reading_test_server',root/'server.py');s=importlib.util.module_from_spec(spec);spec.loader.exec_module(s)
calls=[]
def mock(provider,model,key,payload):
    calls.append(payload)
    if payload['stage']=='books':return {'books':[{'id':b['id'],'tags':['星体' if b['id'].startswith('a') else '文学'],'summary':'根据所提供的材料整理。','evidenceIds':[e['id'] for e in b['evidence']]} for b in payload['books']]}
    by_id={b['id']:b for b in payload['books']}
    return {'links':[{'source':a,'target':b,'type':'contrast','reason':'两段材料提出不同观察。','evidenceIds':[by_id[a]['evidence'][0]['id'],by_id[b]['evidence'][0]['id']]} for a,b in payload['pairs']]}
store=s.Jobs(mock);server=s.Server(('127.0.0.1',0),jobs=store);threading.Thread(target=server.serve_forever,daemon=True).start();url=f'http://127.0.0.1:{server.server_port}'
out=Path(os.environ.get('READING_TEST_OUTPUT',str(root.parents[2]/'tmp/reading-universe-online')));out.mkdir(parents=True,exist_ok=True)
errors=[]
with sync_playwright() as pw:
    try:browser=pw.chromium.launch()
    except Exception:browser=pw.chromium.launch(channel='msedge')
    context=browser.new_context(viewport={'width':1440,'height':1100},accept_downloads=True);page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(url);page.screenshot(path=str(out/'01-home-desktop.png'),full_page=True)
    assert page.locator('#workspace').is_hidden()
    data={'books':[{'bookId':'a1','title':'星体观察','author':'观察者','highlights':['PRIVATE_SENTINEL 星体观测的材料。']},{'bookId':'a2','title':'隐藏书名','author':'研究者','highlights':['另一个观点，观察的误差。']}]}
    page.locator('#files').set_input_files({'name':'books.json','mimeType':'application/json','buffer':json.dumps(data,ensure_ascii=False).encode()})
    page.wait_for_function('window.__readingViews?.graph.stats.books===2')
    frame=page.frame_locator('#viewer');frame.locator('#search').wait_for()
    assert page.evaluate('window.__readingViews.graph.nodes.some(n=>n.label.includes("父亲的解放"))') is False
    page.locator('#consent').check();page.locator('#key').fill('FAKE_BROWSER_TEST_KEY');page.locator('#generate').click();page.wait_for_function('document.querySelector("#progress span").textContent === "生成完成。"')
    assert len(calls)==2 and page.evaluate('window.__readingViews.graph.edges.filter(e=>!e.theme).length')==1
    assert all(j['key']=='' and j['payload'] is None for j in store.jobs.values())
    page.locator('#universe').click();frame.locator('#ucv').wait_for()
    page.screenshot(path=str(out/'02-universe-desktop.png'),full_page=True)
    page.locator('summary').click();page.locator('#book-select').select_option('a1');page.locator('#book-tags').fill('本人修订');page.locator('#edit-tags').click();page.locator('#card-text').fill('我的私人卡 PRIVATE_SENTINEL');page.locator('#edit-card').click()
    with page.expect_download() as d:page.locator('#save').click()
    private=d.value;private.save_as(out/'private-test.json');saved=json.loads((out/'private-test.json').read_text(encoding='utf-8'));assert 'FAKE_BROWSER_TEST_KEY' not in json.dumps(saved);assert saved['edits']['books']['a1']['tags']==['本人修订']
    page.locator('#share').click();page.locator('#share-books input[value="a2"]').uncheck();page.locator('#preview-public').click()
    assert page.evaluate('JSON.stringify(window.__readingViews).includes("PRIVATE_SENTINEL")') is False
    assert page.evaluate('JSON.stringify(window.__readingViews).includes("隐藏书名")') is False
    with page.expect_download() as d:page.locator('#download-public').click()
    d.value.save_as(out/'public-test.zip')
    import zipfile
    with zipfile.ZipFile(out/'public-test.zip') as z:
        combined=b''.join(z.read(name) for name in z.namelist());assert b'PRIVATE_SENTINEL' not in combined;assert '隐藏书名'.encode() not in combined;assert b'FAKE_BROWSER_TEST_KEY' not in combined;assert 'index.html' in z.namelist()
        z.extractall(out/'public-site')
    offline=context.new_page();offline.goto((out/'public-site/index.html').as_uri());offline.locator('#search').wait_for();offline.goto((out/'public-site/index.html').as_uri()+'?universe');offline.locator('#ucv').wait_for();offline.close()
    with page.expect_download() as d:page.locator('#download-image').click()
    d.value.save_as(out/'share-test.png')
    page.locator('#close-share').click();page.locator('#files').set_input_files(str(out/'private-test.json'));page.wait_for_function('window.__readingViews.graph.nodes.some(n=>n.label==="本人修订")')
    before=len(calls);page.locator('#key').fill('FAKE_BROWSER_TEST_KEY');page.locator('#generate').click();page.wait_for_function('document.querySelector("#progress span").textContent === "生成完成。"');assert len(calls)==before
    # Replace with user B, then import hostile content. Both are complete replacements.
    second={'books':[{'bookId':'b1','title':'第二用户的书','author':'作者乙'}]}
    with zipfile.ZipFile(out/'compressed-input.zip','w',zipfile.ZIP_DEFLATED) as z:z.writestr('data/books.json',json.dumps(second,ensure_ascii=False))
    page.locator('#files').set_input_files(str(out/'compressed-input.zip'));page.wait_for_function('window.__readingViews.graph.nodes[0].label === "第二用户的书"');assert page.evaluate('window.__readingViews.graph.stats.books')==1
    hostile={'books':[{'bookId':'x','title':'<img src=x onerror="parent.hacked=1">','author':'<script>parent.hacked=2</script>'}]}
    page.locator('#files').set_input_files({'name':'books.json','mimeType':'application/json','buffer':json.dumps(hostile).encode()});page.locator('#graph').click();page.wait_for_timeout(500);page.frames[1].evaluate('showPanel("book:x")');assert page.evaluate('window.hacked') is None
    page.locator('#theme').click();page.set_viewport_size({'width':390,'height':844});page.screenshot(path=str(out/'03-mobile-light.png'),full_page=True);assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth+1')
    # Explicit example selection, rather than default author data.
    page.locator('#example').click();page.wait_for_function('window.__readingViews.graph.stats.books>300');page.locator('#universe').click();page.frame_locator('#viewer').locator('#ucv').wait_for();page.screenshot(path=str(out/'04-author-example.png'),full_page=True)
    assert not errors,errors
    print(json.dumps({'browser':'passed','ai':'mock transport only','screenshots':str(out),'calls':len(calls),'errors':errors},ensure_ascii=False))
    browser.close()
store.closed=True;server.shutdown();server.server_close()
