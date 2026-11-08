"""Synthetic browser checks for public-export async invalidation.

All books/titles/notes are fictional. No AI, no real data, no external requests.
A small fetch wrapper adds a controllable delay to public-package resources so
the test can change the public selection or start another export while the first
one is still loading.
"""
import importlib.util
import json
import os
import tempfile
import threading
import time
import zipfile
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = Path(os.environ.get('READING_TEST_OUTPUT', tempfile.mkdtemp(prefix='reading-export-race-')))
OUT.mkdir(parents=True, exist_ok=True)

HIDDEN_TITLE = '虚构旧城'
HIDDEN_AUTHOR = '虚构隐藏作者'
PRIVATE_MARKER = 'FICT-PRIVATE-NOTE-A1'

project = {
    'format': 'reading-universe-private', 'version': 1, 'name': '虚构时序项目',
    'books': [
        {'id': 'collide-selected', 'title': '虚构旧城记', 'author': '虚构作者甲',
         'evidence': [{'id': 'collide-e1', 'text': f'虚构材料：{PRIVATE_MARKER}', 'kind': 'note', 'included': True}]},
        {'id': 'safe-book', 'title': '虚构安全书甲', 'author': '虚构作者乙',
         'evidence': [{'id': 'safe-e1', 'text': '虚构安全材料甲', 'kind': 'note', 'included': True}]},
        {'id': 'safe-two', 'title': '虚构安全书乙', 'author': '虚构作者丙',
         'evidence': [{'id': 'safe-e2', 'text': '虚构安全材料乙', 'kind': 'note', 'included': True}]},
        {'id': 'collide-hidden', 'title': HIDDEN_TITLE, 'author': HIDDEN_AUTHOR, 'included': False,
         'evidence': [{'id': 'collide-h1', 'text': '虚构隐藏材料', 'kind': 'note', 'included': True}]},
    ],
    'analysis': {
        'collide-selected': {'tags': [HIDDEN_TITLE], 'summary': PRIVATE_MARKER, 'evidenceIds': ['collide-e1'], 'basis': 'evidence', 'fingerprint': PRIVATE_MARKER},
        'safe-book': {'tags': ['虚构安全主题'], 'summary': '', 'evidenceIds': ['safe-e1'], 'basis': 'evidence', 'fingerprint': ''},
        'safe-two': {'tags': ['虚构安全主题二'], 'summary': '', 'evidenceIds': ['safe-e2'], 'basis': 'evidence', 'fingerprint': ''},
    },
    'exploration': {'version': 1, 'themes': [{
        'id': 'collide-trail', 'basis': 'curated', 'name': '虚构碰撞主题', 'title': '虚构碰撞问题',
        'opening': '虚构开场。', 'entry': '虚构入口。', 'start': 'n0', 'endTitle': '虚构停留标题', 'endBody': '虚构停留说明。',
        'nodes': [{'id': 'n0', 'title': '虚构线索', 'subtitle': '虚构副题', 'context': '虚构语境。', 'observation': '虚构观察。',
                   'quote': {'bookId': 'collide-selected', 'evidenceId': 'collide-e1', 'excerpt': '虚构材料'}, 'choices': []}],
    }]},
    'journey': {'activeTheme': 'collide-trail', 'sessions': []},
}
project_path = OUT / 'race-project.json'
project_path.write_text(json.dumps(project, ensure_ascii=False, indent=2), encoding='utf-8')

DELAY_SCRIPT = r"""
(() => {
  const realFetch = window.fetch.bind(window);
  window.__fictDelayMount = false;
  window.__fictDelayMs = 700;
  window.__fictDelaySeq = 0;
  window.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    if (window.__fictDelayMount && /(viewer\.html|viewer-data\.js|universe\.js|vis-network\.min\.js|public-reader\.html|public-reader\.js|public-reader\.css)/.test(url)) {
      const ms = window.__fictDelayMs || 700;
      const separator = url.includes('?') ? '&' : '?';
      window.__fictDelaySeq += 1;
      const delayed = url + separator + 'fictdelay=' + window.__fictDelaySeq;
      return new Promise(resolve => setTimeout(resolve, ms)).then(() => realFetch(delayed, init));
    }
    return realFetch(input, init);
  };
})();
"""

spec = importlib.util.spec_from_file_location('race_test_server', ROOT / 'server.py')
server_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server_module)


def reject_ai(*args):
    raise AssertionError('AI must not be called by the race browser test')


store = server_module.Jobs(reject_ai)
server = server_module.Server(('127.0.0.1', 0), jobs=store)
threading.Thread(target=server.serve_forever, daemon=True).start()
base = f'http://127.0.0.1:{server.server_port}'

checks = {}
errors = []
downloads = []
try:
    with sync_playwright() as pw:
        try:
            browser = pw.chromium.launch()
        except Exception:
            browser = pw.chromium.launch(channel='msedge')
        context = browser.new_context(viewport={'width': 1440, 'height': 1100}, accept_downloads=True)

        def new_page():
            page = context.new_page()
            page.add_init_script(DELAY_SCRIPT)
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.on('download', lambda download: downloads.append(download))
            return page

        def set_delay(page, enabled=True, ms=700):
            page.evaluate('([on, ms]) => { window.__fictDelayMount = on; window.__fictDelayMs = ms; }', [enabled, ms])

        def select_books(page, ids):
            count = page.locator('#share-books input').count()
            for index in range(count):
                item = page.locator('#share-books input').nth(index)
                if item.get_attribute('value') in ids:
                    item.check()
                else:
                    item.uncheck()

        def read_zip(path):
            with zipfile.ZipFile(path) as package:
                names = set(package.namelist())
                assert 'index.html' in names
                graph = package.read('graph_data.js').decode('utf-8')
                return graph

        def assert_clean(graph):
            for token in [HIDDEN_TITLE, HIDDEN_AUTHOR, PRIVATE_MARKER]:
                assert token not in graph, token

        def download_now(page, button, path):
            with page.expect_download() as info:
                page.locator(button).click()
            info.value.save_as(path)
            return path

        # ---- Graph page ----
        page = new_page()
        page.goto(base)
        page.locator('#files').set_input_files(str(project_path))
        page.wait_for_function('window.__readingViews?.graph.stats.books===3')

        # Normal success
        page.locator('#share').click()
        select_books(page, {'safe-book'})
        graph_normal = download_now(page, '#download-public', OUT / 'graph-normal.zip')
        graph = read_zip(graph_normal)
        assert 'safe-book' in graph and 'safe-two' not in graph
        assert_clean(graph)
        page.wait_for_function('document.querySelector("#share-report").textContent.includes("专题卡")')
        checks['graph_normal_success'] = True

        # Conflict failure: no download, error message stays
        select_books(page, {'safe-book', 'collide-selected'})
        before = len(downloads)
        page.locator('#download-public').click()
        page.wait_for_function('document.querySelector("#share-report").textContent.includes("书名冲突")')
        page.wait_for_timeout(900)
        assert len(downloads) == before
        assert '书名冲突' in page.locator('#share-report').inner_text()
        checks['graph_conflict_failure'] = True

        # Old safe export -> change to colliding while it is still loading
        select_books(page, {'safe-book'})
        set_delay(page, True, 700)
        page.locator('#download-public').click()
        page.wait_for_timeout(120)
        select_books(page, {'safe-book', 'collide-selected'})
        page.locator('#download-public').click()
        page.wait_for_function('document.querySelector("#share-report").textContent.includes("书名冲突")')
        page.wait_for_timeout(1200)
        assert len(downloads) == before, 'stale safe export must not download after a colliding selection'
        assert '书名冲突' in page.locator('#share-report').inner_text(), 'stale operation must not overwrite the conflict error'
        checks['graph_safe_then_collision_no_stale_download'] = True

        # Old safe export -> another safe selection while loading: only latest downloads
        select_books(page, {'safe-book'})
        page.locator('#download-public').click()
        page.wait_for_timeout(120)
        select_books(page, {'safe-two'})
        latest = download_now(page, '#download-public', OUT / 'graph-latest-safe.zip')
        latest_graph = read_zip(latest)
        assert 'safe-two' in latest_graph and 'safe-book' not in latest_graph
        assert_clean(latest_graph)
        page.wait_for_timeout(900)
        assert len(downloads) == before + 1, 'only the latest safe export may download'
        assert '书名冲突' not in page.locator('#share-report').inner_text()
        checks['graph_safe_then_other_safe_only_latest'] = True

        # Rapid consecutive downloads with the same selection: only one download
        select_books(page, {'safe-book'})
        first = page.locator('#download-public')
        page.evaluate('window.__fictDelayMount = true; window.__fictDelayMs = 650;')
        before = len(downloads)
        with page.expect_download() as info:
            first.click()
            first.click()
        rapid = OUT / 'graph-rapid.zip'
        info.value.save_as(rapid)
        rapid_graph = read_zip(rapid)
        assert 'safe-book' in rapid_graph
        page.wait_for_timeout(900)
        assert len(downloads) == before + 1, 'rapid consecutive operations must produce one download'
        checks['graph_rapid_consecutive_one_download'] = True
        set_delay(page, False)
        page.locator('#close-share').click()
        page.close()

        # ---- Exploration page ----
        atlas = new_page()
        atlas.goto(base + '/atlas/index.html')
        atlas.locator('#first-import').click()
        atlas.locator('#import-files').set_input_files(str(project_path))
        atlas.locator('#story').wait_for()
        atlas.locator('#share-project').click()

        # Normal success
        select_books(atlas, {'safe-book'})
        atlas_normal = download_now(atlas, '#download-share', OUT / 'atlas-normal.zip')
        atlas_graph = read_zip(atlas_normal)
        assert 'safe-book' in atlas_graph and 'safe-two' not in atlas_graph
        assert_clean(atlas_graph)
        checks['atlas_normal_success'] = True

        # Conflict failure
        select_books(atlas, {'safe-book', 'collide-selected'})
        before = len(downloads)
        atlas.locator('#download-share').click()
        atlas.wait_for_function('document.querySelector("#share-report").textContent.includes("书名冲突")')
        atlas.wait_for_timeout(900)
        assert len(downloads) == before
        assert atlas.locator('#share-viewer').is_hidden()
        checks['atlas_conflict_failure'] = True

        # Old safe export -> colliding selection while loading
        select_books(atlas, {'safe-book'})
        set_delay(atlas, True, 700)
        atlas.locator('#download-share').click()
        atlas.wait_for_timeout(120)
        select_books(atlas, {'safe-book', 'collide-selected'})
        atlas.locator('#download-share').click()
        atlas.wait_for_function('document.querySelector("#share-report").textContent.includes("书名冲突")')
        atlas.wait_for_timeout(1200)
        assert len(downloads) == before, 'stale atlas export must not download after a colliding selection'
        assert '书名冲突' in atlas.locator('#share-report').inner_text()
        checks['atlas_safe_then_collision_no_stale_download'] = True

        # Old safe export -> another safe selection: only latest downloads
        select_books(atlas, {'safe-book'})
        atlas.locator('#download-share').click()
        atlas.wait_for_timeout(120)
        select_books(atlas, {'safe-two'})
        atlas_latest = download_now(atlas, '#download-share', OUT / 'atlas-latest-safe.zip')
        atlas_latest_graph = read_zip(atlas_latest)
        assert 'safe-two' in atlas_latest_graph and 'safe-book' not in atlas_latest_graph
        assert_clean(atlas_latest_graph)
        atlas.wait_for_timeout(900)
        assert len(downloads) == before + 1
        checks['atlas_safe_then_other_safe_only_latest'] = True

        # Rapid consecutive downloads with the same selection
        select_books(atlas, {'safe-book'})
        before = len(downloads)
        atlas.evaluate('window.__fictDelayMount = true; window.__fictDelayMs = 650;')
        with atlas.expect_download() as info:
            atlas.locator('#download-share').click()
            atlas.locator('#download-share').click()
        rapid_atlas = OUT / 'atlas-rapid.zip'
        info.value.save_as(rapid_atlas)
        assert 'safe-book' in read_zip(rapid_atlas)
        atlas.wait_for_timeout(900)
        assert len(downloads) == before + 1
        checks['atlas_rapid_consecutive_one_download'] = True
        set_delay(atlas, False)

        assert not errors, errors
        assert not store.jobs
        report_data = {'checks': checks, 'errors': errors, 'downloads': len(downloads), 'ai_calls': 0, 'output': str(OUT)}
        (OUT / 'public-export-race-report.json').write_text(json.dumps(report_data, ensure_ascii=False, indent=2), encoding='utf-8')
        print(json.dumps(report_data, ensure_ascii=False))
        browser.close()
finally:
    store.closed = True
    server.shutdown()
    server.server_close()
