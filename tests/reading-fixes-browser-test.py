"""Synthetic browser regression for the three merged reading-map fixes.

- generation lock: two synchronous clicks before the first await must produce one job.
- historical exploration reference: material unchecked for AI remains saveable/reopenable.
- universe: all-comet small library draws; empty universe shows the empty state.
No real data, no AI provider, no external network.
"""
import importlib.util
import json
import os
import tempfile
import threading
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = Path(os.environ.get('READING_TEST_OUTPUT', tempfile.mkdtemp(prefix='reading-fixes-browser-')))
OUT.mkdir(parents=True, exist_ok=True)
EXCERPT = '虚构历史引文：门口停了一会儿。'

samples = OUT / 'historical-project.json'
samples.write_text(json.dumps({
    'format': 'reading-universe-private', 'version': 1, 'name': '虚构历史引用项目',
    'books': [{
        'id': 'b1', 'title': '虚构书一', 'author': '虚构作者',
        'evidence': [{'id': 'b1:e1', 'text': EXCERPT, 'kind': 'highlight', 'included': False}],
    }],
    'analysis': {}, 'links': [], 'linkCache': {}, 'cards': {},
    'edits': {'books': {}, 'cards': {}, 'links': [], 'removedPairs': []},
    'settings': {'wordlist': [], 'aliases': {}},
    'exploration': {'version': 1, 'themes': [{
        'id': 't1', 'basis': 'curated', 'name': '虚构主题', 'title': '虚构线索',
        'opening': '虚构开场', 'entry': '虚构入口', 'start': 'n1',
        'endTitle': '虚构结束', 'endBody': '虚构收束',
        'nodes': [{'id': 'n1', 'title': '虚构节点', 'subtitle': '副标题', 'context': '上下文',
                   'observation': '观察', 'quote': {'bookId': 'b1', 'evidenceId': 'b1:e1', 'excerpt': EXCERPT},
                   'choices': []}],
    }]},
    'journey': {'activeTheme': 't1', 'sessions': []},
}, ensure_ascii=False, indent=2), encoding='utf-8')

comet_project = OUT / 'single-comet-project.json'
comet_project.write_text(json.dumps({'books': [{'id': 'c1', 'title': '虚构彗星书', 'author': '虚构作者', 'tags': ['甲', '乙']}]}), encoding='utf-8')

spec = importlib.util.spec_from_file_location('fixes_browser_server', ROOT / 'server.py')
server_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server_module)
calls = []


def mock(provider, model, key, payload):
    calls.append(payload)
    if payload['stage'] == 'books':
        return {'books': [{'id': b['id'], 'tags': ['合成主题'], 'summary': '', 'evidenceIds': [e['id'] for e in b['evidence']]} for b in payload['books']]}
    return {'links': []}


store = server_module.Jobs(mock)
server = server_module.Server(('127.0.0.1', 0), jobs=store)
threading.Thread(target=server.serve_forever, daemon=True).start()
base = f'http://127.0.0.1:{server.server_port}'
checks = {}
errors = []
try:
    with sync_playwright() as pw:
        try:
            browser = pw.chromium.launch()
        except Exception:
            browser = pw.chromium.launch(channel='msedge')
        context = browser.new_context(viewport={'width': 1440, 'height': 1100}, accept_downloads=True)
        context.add_init_script("""
          window.__draws = 0;
          const originalDrawImage = CanvasRenderingContext2D.prototype.drawImage;
          CanvasRenderingContext2D.prototype.drawImage = function (...args) {
            window.__draws += 1;
            return originalDrawImage.apply(this, args);
          };
        """)
        page = context.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(base)

        # Generation lock: two synchronous clicks -> one job.
        page.locator('#files').set_input_files(str(samples))
        page.wait_for_function('window.__readingViews?.graph.stats.books===1')
        page.locator('#consent').check()
        page.locator('#key').fill('FAKE_FIX_BROWSER_KEY')
        page.evaluate('const b=document.querySelector("#generate"); b.click(); b.click();')
        page.wait_for_function('document.querySelector("#progress span").textContent === "生成完成。"')
        job_posts = [call for call in calls if call.get('stage') == 'books']
        assert len(job_posts) == 1, f'two clicks produced {len(job_posts)} job payloads'
        assert 'FAKE_FIX_BROWSER_KEY' not in json.dumps(page.evaluate('window.__readingViews')), 'key leaked into views'
        checks['generation_lock_single_job'] = True

        # Historical reference with included=false: save and reopen through the real page.
        page.locator('#files').set_input_files(str(samples))
        page.wait_for_function('window.__readingViews?.graph.stats.books===1')
        with page.expect_download() as info:
            page.locator('#save').click()
        saved_path = OUT / 'saved-historical.json'
        info.value.save_as(saved_path)
        saved = json.loads(saved_path.read_text(encoding='utf-8'))
        assert saved['books'][0]['evidence'][0]['included'] is False
        assert saved['exploration']['themes'][0]['nodes'][0]['quote']['excerpt'] == EXCERPT
        page.locator('#files').set_input_files(str(saved_path))
        page.wait_for_function('document.querySelector("#notice").textContent.includes("已在本机读取")')
        assert page.evaluate('window.__readingViews.graph.stats.books') == 1
        checks['historical_reference_save_reopen'] = True

        # All-comet small library: universe must draw and not throw.
        page.locator('#files').set_input_files(str(comet_project))
        page.wait_for_function('window.__readingViews?.graph.stats.books===1')
        page.locator('#universe').click()
        frame = page.frame_locator('#viewer')
        frame.locator('#ucv').wait_for()
        page.wait_for_timeout(500)
        draws = frame.locator('body').evaluate('window.__draws')
        assert draws > 0, 'universe did not draw the all-comet library'
        assert '1 颗星' in frame.locator('#ustats').inner_text()
        checks['universe_all_comet_draws'] = True

        # Empty universe: route the data script to an empty payload and load the viewer directly.
        empty = context.new_page()
        empty.on('pageerror', lambda error: errors.append('empty:' + str(error)))
        empty.route('**/viewer-data.js', lambda route: route.fulfill(
            status=200, content_type='text/javascript',
            body='window.GRAPH={nodes:[],edges:[],stats:{}};window.UNIVERSE={books:[],themes:[],stats:{books:0,themes:0,comets:0,totalHours:0}};',
        ))
        empty.goto(base + '/viewer.html?universe')
        empty.locator('#ustats').wait_for()
        empty.wait_for_function('document.querySelector("#ustats").textContent.includes("暂无可显示的书目")')
        checks['universe_empty_state'] = True

        assert not errors, errors
        assert not store.jobs
        report = {'checks': checks, 'errors': errors, 'job_payloads': len(calls), 'ai_calls': 0, 'output': str(OUT)}
        (OUT / 'reading-fixes-browser-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
        print(json.dumps(report, ensure_ascii=False))
        browser.close()
finally:
    store.closed = True
    server.shutdown()
    server.server_close()
