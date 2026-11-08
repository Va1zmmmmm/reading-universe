"""Synthetic regression: the generation lock must cover the whole async lifecycle.

The first model job is held server-side; while it is pending we attempt to import,
reset, or switch to the public example. The project-ready actions must be rejected,
the original project must remain, and the old job must finish against that project.

No real data, no model/network; all projects are fictional.
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
OUT = Path(os.environ.get('READING_TEST_OUTPUT', tempfile.mkdtemp(prefix='generation-project-race-')))
OUT.mkdir(parents=True, exist_ok=True)


def project(name, books):
    return {
        'format': 'reading-universe-private', 'version': 1, 'name': name,
        'books': books, 'analysis': {}, 'links': [], 'linkCache': {}, 'cards': {},
        'edits': {'books': {}, 'cards': {}, 'links': [], 'removedPairs': []},
        'settings': {'wordlist': [], 'aliases': {}},
    }


a = project('虚构原项目', [
    {'id': 'a1', 'title': '虚构书A一', 'author': '虚构作者',
     'evidence': [{'id': 'a1:e1', 'text': '虚构引文一：门口停了一会儿。', 'kind': 'highlight'}]},
    {'id': 'a2', 'title': '虚构书A二', 'author': '虚构作者',
     'evidence': [{'id': 'a2:e1', 'text': '虚构引文二：风从窗边经过。', 'kind': 'highlight'}]},
])
b = project('虚构替换项目', [
    {'id': 'a1', 'title': '虚构替换书（同ID）', 'author': '虚构作者', 'evidence': []},
])
(OUT / 'a.json').write_text(json.dumps(a, ensure_ascii=False), encoding='utf-8')
(OUT / 'b.json').write_text(json.dumps(b, ensure_ascii=False), encoding='utf-8')

spec = importlib.util.spec_from_file_location('race_server', ROOT / 'server.py')
server_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server_module)
calls = []


def mock(provider, model, key, payload):
    calls.append(payload)
    if payload['stage'] == 'books':
        time.sleep(1.8)  # controlled delay: keep the job pending while the UI action is attempted
        return {'books': [{'id': x['id'], 'tags': ['合成主题'], 'summary': '合成摘要',
                           'evidenceIds': [e['id'] for e in x['evidence']]} for x in payload['books']]}
    return {'links': []}


store = server_module.Jobs(mock)
server = server_module.Server(('127.0.0.1', 0), jobs=store)
threading.Thread(target=server.serve_forever, daemon=True).start()
base = f'http://127.0.0.1:{server.server_port}'

EXPECTED = {
    'import': '请先取消生成，再更换项目。',
    'reset': '请先取消生成。',
    'example': '请先取消生成。',
}
checks = {}
errors = []


def run_case(action):
    with sync_playwright() as pw:
        try:
            browser = pw.chromium.launch()
        except Exception:
            browser = pw.chromium.launch(channel='msedge')
        context = browser.new_context(viewport={'width': 1440, 'height': 1000}, accept_downloads=True)
        page = context.new_page()
        page.on('pageerror', lambda error: errors.append(f'{action}: {error}'))
        page.goto(base)
        page.locator('#files').set_input_files(str(OUT / 'a.json'))
        page.wait_for_function('window.__readingViews?.graph.stats.books===2')
        page.locator('#consent').check()
        page.locator('#key').fill('FAKE_RACE_KEY')
        page.evaluate('document.querySelector("#generate").click()')
        page.wait_for_function('document.querySelector("#generate").disabled===true')
        page.wait_for_function('document.querySelector("#notice").textContent.includes("待分析")')
        # The server mock holds the job; wait until its payload has arrived.
        deadline = time.time() + 5
        while not calls and time.time() < deadline:
            page.wait_for_timeout(100)
        assert calls, 'the server did not receive the held job'
        page.wait_for_timeout(250)

        if action == 'import':
            page.locator('#files').set_input_files(str(OUT / 'b.json'))
        elif action == 'reset':
            page.on('dialog', lambda dialog: dialog.accept())
            page.locator('#reset').click()
        elif action == 'example':
            page.locator('#example').click()
        else:
            raise ValueError(action)
        page.wait_for_timeout(700)
        notice = page.locator('#notice').inner_text()
        assert EXPECTED[action] in notice, f'{action} was not rejected: {notice!r}'

        page.wait_for_function('document.querySelector("#progress span").textContent === "生成完成。"', timeout=20000)
        page.wait_for_timeout(300)
        with page.expect_download(timeout=5000) as info:
            page.locator('#save').click()
        saved_path = OUT / f'saved-{action}.json'
        info.value.save_as(saved_path)
        saved = json.loads(saved_path.read_text(encoding='utf-8'))
        ids = [book.get('id') for book in saved.get('books', [])]
        assert ids == ['a1', 'a2'], f'{action} replaced the original project: {ids}'
        assert sorted(saved.get('analysis', {})) == ['a1', 'a2'], f'{action} analysis keys were {sorted(saved.get("analysis", {}))}'
        checks[action] = True
        browser.close()


try:
    for action in ['import', 'reset', 'example']:
        run_case(action)
    assert not errors, errors
    report = {'checks': checks, 'errors': errors, 'job_payloads': len(calls), 'ai_calls': 0, 'output': str(OUT)}
    (OUT / 'generation-project-race-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False))
finally:
    store.closed = True
    server.shutdown()
    server.server_close()
