"""Synthetic regression: while a model job is pending, the parent must reject an
exploration-return message instead of replacing the active project.

Uses the real atlas page in a second tab and a controlled server-side job delay.
No real data, no model/network.
"""
import importlib.util
import json
import os
import tempfile
import threading
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = Path(os.environ.get('READING_TEST_OUTPUT', tempfile.mkdtemp(prefix='generation-return-race-')))
OUT.mkdir(parents=True, exist_ok=True)

def project(name, books):
    return {'format': 'reading-universe-private', 'version': 1, 'name': name, 'books': books,
            'analysis': {}, 'links': [], 'linkCache': {}, 'cards': {},
            'edits': {'books': {}, 'cards': {}, 'links': [], 'removedPairs': []},
            'settings': {'wordlist': [], 'aliases': {}}}

a = project('虚构原项目', [
    {'id': 'a1', 'title': '虚构书A一', 'author': '虚构作者',
     'evidence': [{'id': 'a1:e1', 'text': '虚构引文一：门口停了一会儿。', 'kind': 'highlight'}]},
    {'id': 'a2', 'title': '虚构书A二', 'author': '虚构作者',
     'evidence': [{'id': 'a2:e1', 'text': '虚构引文二：风从窗边经过。', 'kind': 'highlight'}]},
])
b = project('虚构探索替换项目', [{'id': 'r1', 'title': '虚构探索书', 'author': '虚构作者', 'evidence': []}])
(OUT / 'a.json').write_text(json.dumps(a, ensure_ascii=False), encoding='utf-8')

spec = importlib.util.spec_from_file_location('return_server', ROOT / 'server.py')
sm = importlib.util.module_from_spec(spec); spec.loader.exec_module(sm)
calls = []
def mock(provider, model, key, payload):
    calls.append(payload)
    if payload['stage'] == 'books':
        time.sleep(1.8)
        return {'books': [{'id': x['id'], 'tags': ['合成主题'], 'summary': '合成摘要',
                           'evidenceIds': [e['id'] for e in x['evidence']]} for x in payload['books']]}
    return {'links': []}
store = sm.Jobs(mock); server = sm.Server(('127.0.0.1', 0), jobs=store)
threading.Thread(target=server.serve_forever, daemon=True).start()
base = f'http://127.0.0.1:{server.server_port}'
errors = []
try:
    with sync_playwright() as pw:
        try: browser = pw.chromium.launch()
        except Exception: browser = pw.chromium.launch(channel='msedge')
        context = browser.new_context(viewport={'width': 1440, 'height': 1000}, accept_downloads=True)
        context.add_init_script("window.addEventListener('message',e=>{if(e.data?.type==='reading-atlas-load')window.__atlasToken=e.data.token;});")
        page = context.new_page(); page.on('pageerror', lambda e: errors.append(str(e)))
        page.goto(base)
        page.locator('#files').set_input_files(str(OUT / 'a.json'))
        page.wait_for_function('window.__readingViews?.graph.stats.books===2')
        with context.expect_page() as pinfo:
            page.locator('#open-atlas').click()
        atlas = pinfo.value
        atlas.wait_for_load_state('domcontentloaded')
        deadline = time.time() + 10
        while not atlas.evaluate('window.__atlasToken') and time.time() < deadline:
            atlas.wait_for_timeout(100)
        token = atlas.evaluate('window.__atlasToken')
        assert token, 'atlas token was not received'
        page.locator('#consent').check(); page.locator('#key').fill('FAKE_RACE_KEY')
        page.evaluate('document.querySelector("#generate").click()')
        page.wait_for_function('document.querySelector("#generate").disabled===true')
        page.wait_for_function('document.querySelector("#notice").textContent.includes("待分析")')
        deadline = time.time() + 5
        while not calls and time.time() < deadline:
            page.wait_for_timeout(100)
        assert calls, 'server did not receive held job'
        page.wait_for_timeout(250)
        atlas.evaluate("window.opener.postMessage({type:'reading-atlas-return',token:window.__atlasToken,project:%s}, location.origin)" % json.dumps(b, ensure_ascii=False))
        page.wait_for_timeout(700)
        notice = page.locator('#notice').inner_text()
        assert '图谱项目已变化' in notice, notice
        page.wait_for_function('document.querySelector("#progress span").textContent === "生成完成。"', timeout=20000)
        page.wait_for_timeout(300)
        with page.expect_download(timeout=5000) as info:
            page.locator('#save').click()
        p = OUT / 'saved-return.json'; info.value.save_as(p)
        saved = json.loads(p.read_text(encoding='utf-8'))
        ids = [x.get('id') for x in saved.get('books', [])]
        assert ids == ['a1', 'a2'], ids
        assert sorted(saved.get('analysis', {})) == ['a1', 'a2'], sorted(saved.get('analysis', {}))
        assert not errors, errors
        report = {'checks': {'exploration_return_rejected': True, 'original_project_preserved': True}, 'errors': errors,
                  'job_payloads': len(calls), 'ai_calls': 0, 'output': str(OUT)}
        (OUT / 'generation-return-race-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
        print(json.dumps(report, ensure_ascii=False))
        browser.close()
finally:
    store.closed = True; server.shutdown(); server.server_close()
