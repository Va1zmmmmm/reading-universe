"""Reverse-order regression: start a slow import/example load, then start generation,
then let the load finish. The async load must re-check `running` before replacing the
active project; the old job must complete against the original project.

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
OUT = Path(os.environ.get('READING_TEST_OUTPUT', tempfile.mkdtemp(prefix='generation-reverse-race-')))
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
b = project('虚构慢导入项目', [{'id': 'b1', 'title': '虚构导入书', 'author': '虚构作者', 'evidence': []}])
(OUT / 'a.json').write_text(json.dumps(a, ensure_ascii=False), encoding='utf-8')
(OUT / 'b.json').write_text(json.dumps(b, ensure_ascii=False), encoding='utf-8')

spec = importlib.util.spec_from_file_location('reverse_server', ROOT / 'server.py')
sm = importlib.util.module_from_spec(spec); spec.loader.exec_module(sm)
calls = []
def mock(provider, model, key, payload):
    calls.append(payload)
    if payload['stage'] == 'books':
        time.sleep(1.8)  # keep generation pending while the slow load resumes
        return {'books': [{'id': x['id'], 'tags': ['合成主题'], 'summary': '合成摘要',
                           'evidenceIds': [e['id'] for e in x['evidence']]} for x in payload['books']]}
    return {'links': []}
store = sm.Jobs(mock); server = sm.Server(('127.0.0.1', 0), jobs=store)
threading.Thread(target=server.serve_forever, daemon=True).start()
base = f'http://127.0.0.1:{server.server_port}'
checks = {}
errors = []

def browser_for(pw):
    try: return pw.chromium.launch()
    except Exception: return pw.chromium.launch(channel='msedge')

def start_generation(page):
    page.locator('#consent').check(); page.locator('#key').fill('FAKE_RACE_KEY')
    page.evaluate('document.querySelector("#generate").click()')
    page.wait_for_function('document.querySelector("#generate").disabled===true')
    page.wait_for_function('document.querySelector("#notice").textContent.includes("待分析")')
    deadline = time.time() + 5
    while not calls and time.time() < deadline:
        page.wait_for_timeout(100)
    assert calls, 'server did not receive held job'

def save_original(page, action):
    page.wait_for_function('document.querySelector("#progress span").textContent === "生成完成。"', timeout=20000)
    page.wait_for_timeout(300)
    with page.expect_download(timeout=5000) as info:
        page.locator('#save').click()
    p = OUT / f'saved-{action}.json'; info.value.save_as(p)
    saved = json.loads(p.read_text(encoding='utf-8'))
    ids = [x.get('id') for x in saved.get('books', [])]
    assert ids == ['a1', 'a2'], f'{action} replaced project: {ids}'
    assert sorted(saved.get('analysis', {})) == ['a1', 'a2'], f'{action} analysis: {sorted(saved.get("analysis", {}))}'

def slow_import():
    with sync_playwright() as pw:
        browser = browser_for(pw)
        context = browser.new_context(viewport={'width': 1440, 'height': 1000}, accept_downloads=True)
        context.add_init_script("""
          const originalText = File.prototype.text;
          File.prototype.text = function () {
            window.__slowFileStarted = true;
            return new Promise((resolve, reject) => setTimeout(() => originalText.call(this).then(resolve, reject), 1500));
          };
        """)
        page = context.new_page(); page.on('pageerror', lambda e: errors.append('slow-import: ' + str(e)))
        page.goto(base)
        page.locator('#files').set_input_files(str(OUT / 'a.json'))
        page.wait_for_function('window.__readingViews?.graph.stats.books===2')
        page.locator('#files').set_input_files(str(OUT / 'b.json'))
        page.wait_for_function('window.__slowFileStarted===true')
        page.wait_for_timeout(200)
        start_generation(page)
        page.wait_for_timeout(1800)  # slow File.text returns while the job is still pending
        notice = page.locator('#notice').inner_text()
        assert '请先取消生成' in notice, f'slow import was not rejected: {notice!r}'
        save_original(page, 'slow-import')
        checks['slow_import_rejected'] = True
        browser.close()

def slow_example():
    with sync_playwright() as pw:
        browser = browser_for(pw)
        context = browser.new_context(viewport={'width': 1440, 'height': 1000}, accept_downloads=True)
        context.add_init_script("""
          const originalFetch = window.fetch;
          window.fetch = function (url, options) {
            if (String(url).includes('examples/author-public.json')) {
              window.__slowExampleStarted = true;
              return new Promise((resolve, reject) => setTimeout(() => originalFetch.call(this, url, options).then(resolve, reject), 1500));
            }
            return originalFetch.call(this, url, options);
          };
        """)
        page = context.new_page(); page.on('pageerror', lambda e: errors.append('slow-example: ' + str(e)))
        page.goto(base)
        page.locator('#files').set_input_files(str(OUT / 'a.json'))
        page.wait_for_function('window.__readingViews?.graph.stats.books===2')
        page.locator('#example').click()
        page.wait_for_function('window.__slowExampleStarted===true')
        page.wait_for_timeout(200)
        start_generation(page)
        page.wait_for_timeout(1800)  # slow example fetch returns while the job is still pending
        notice = page.locator('#notice').inner_text()
        assert '请先取消生成' in notice, f'slow example was not rejected: {notice!r}'
        save_original(page, 'slow-example')
        checks['slow_example_rejected'] = True
        browser.close()

try:
    slow_import()
    slow_example()
    assert not errors, errors
    report = {'checks': checks, 'errors': errors, 'job_payloads': len(calls), 'ai_calls': 0, 'output': str(OUT)}
    (OUT / 'generation-reverse-race-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False))
finally:
    store.closed = True; server.shutdown(); server.server_close()
