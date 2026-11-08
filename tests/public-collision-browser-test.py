"""Synthetic browser checks for the public-sharing title-collision guard.

Uses only fictional books/notes. No AI, no real data, no external requests.
Covers graph page and exploration page: collision must block preview/download,
a failed attempt must not leave a previous public preview, and successful
downloads must not contain hidden titles, hidden authors or private markers.
"""
import importlib.util
import io
import json
import os
import tempfile
import threading
import zipfile
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = Path(os.environ.get('READING_TEST_OUTPUT', tempfile.mkdtemp(prefix='reading-public-collision-')))
OUT.mkdir(parents=True, exist_ok=True)

HIDDEN_TITLE = '虚构旧城'
HIDDEN_AUTHOR = '虚构隐藏作者'
PRIVATE_MARKER = 'FICT-PRIVATE-NOTE-A1'

project = {
    'format': 'reading-universe-private',
    'version': 1,
    'name': '虚构碰撞项目',
    'books': [
        {
            'id': 'collide-selected', 'title': '虚构旧城记', 'author': '虚构作者甲',
            'evidence': [{'id': 'collide-e1', 'text': f'虚构材料：{PRIVATE_MARKER}', 'kind': 'note', 'included': True}],
        },
        {
            'id': 'safe-book', 'title': '虚构安全书', 'author': '虚构作者乙',
            'evidence': [{'id': 'safe-e1', 'text': '虚构安全材料', 'kind': 'note', 'included': True}],
        },
        {
            'id': 'collide-hidden', 'title': HIDDEN_TITLE, 'author': HIDDEN_AUTHOR,
            'included': False,
            'evidence': [{'id': 'collide-h1', 'text': '虚构隐藏材料', 'kind': 'note', 'included': True}],
        },
    ],
    'analysis': {
        'collide-selected': {'tags': [HIDDEN_TITLE], 'summary': PRIVATE_MARKER, 'evidenceIds': ['collide-e1'], 'basis': 'evidence', 'fingerprint': PRIVATE_MARKER},
        'safe-book': {'tags': ['虚构安全主题'], 'summary': '', 'evidenceIds': ['safe-e1'], 'basis': 'evidence', 'fingerprint': ''},
    },
    'exploration': {
        'version': 1,
        'themes': [{
            'id': 'collide-trail', 'basis': 'curated', 'name': '虚构碰撞主题',
            'title': '虚构碰撞问题', 'opening': '虚构开场。', 'entry': '虚构入口。',
            'start': 'n0', 'endTitle': '虚构停留标题', 'endBody': '虚构停留说明。',
            'nodes': [{
                'id': 'n0', 'title': '虚构线索', 'subtitle': '虚构副题',
                'context': '虚构语境。', 'observation': '虚构观察。',
                'quote': {'bookId': 'collide-selected', 'evidenceId': 'collide-e1', 'excerpt': '虚构材料'},
                'choices': [],
            }],
        }],
    },
    'journey': {'activeTheme': 'collide-trail', 'sessions': []},
}
project_path = OUT / 'collision-project.json'
project_path.write_text(json.dumps(project, ensure_ascii=False, indent=2), encoding='utf-8')

spec = importlib.util.spec_from_file_location('collision_test_server', ROOT / 'server.py')
server_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server_module)


def reject_ai(*args):
    raise AssertionError('AI must not be called by the collision browser test')


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
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.on('download', lambda download: downloads.append(download))
            return page

        # ---- Graph page: collision blocks preview/download, no stale public preview ----
        page = new_page()
        page.goto(base)
        page.locator('#files').set_input_files(str(project_path))
        page.wait_for_function('window.__readingViews?.graph.stats.books===2')
        page.locator('#share').click()
        page.locator('#preview-public').click()
        page.wait_for_function('document.querySelector("#share-report").textContent.includes("书名冲突")')
        report = page.locator('#share-report').inner_text()
        assert '未能生成公开内容' in report and '书名冲突' in report
        for token in [HIDDEN_TITLE, HIDDEN_AUTHOR, PRIVATE_MARKER, '未选择']:
            assert token not in report, token
        assert '3 本书' in page.locator('#counts').inner_text(), '失败后应保留原项目'
        checks['graph_collision_preview_blocked'] = True

        page.locator('#share-books input[value="collide-selected"]').uncheck()
        page.locator('#preview-public').click()
        page.wait_for_function('window.__readingViews?.graph.stats.books===1')
        assert '预览 1 本' in page.locator('#share-report').inner_text()
        checks['graph_no_collision_preview_works'] = True

        page.locator('#share-books input[value="collide-selected"]').check()
        page.locator('#preview-public').click()
        page.wait_for_function('document.querySelector("#share-report").textContent.includes("书名冲突")')
        assert page.evaluate('window.__readingViews.graph.stats.books') == 2  # project view, not stale public preview
        before_downloads = len(downloads)
        page.locator('#download-public').click()
        page.wait_for_timeout(1200)
        assert len(downloads) == before_downloads, 'collision must not download a public package'
        assert '书名冲突' in page.locator('#share-report').inner_text()
        checks['graph_collision_download_blocked_and_stale_preview_cleared'] = True

        page.locator('#share-books input[value="collide-selected"]').uncheck()
        page.locator('#preview-public').click()
        page.wait_for_function('window.__readingViews?.graph.stats.books===1')
        with page.expect_download() as download_info:
            page.locator('#download-public').click()
        graph_zip = OUT / 'graph-public.zip'
        download_info.value.save_as(graph_zip)
        with zipfile.ZipFile(graph_zip) as package:
            combined = b''.join(package.read(name) for name in package.namelist())
            assert 'index.html' in package.namelist()
            for token in [HIDDEN_TITLE, HIDDEN_AUTHOR, PRIVATE_MARKER, '虚构旧城记']:
                assert token.encode() not in combined, token
        checks['graph_success_download_excludes_hidden_and_private'] = True
        page.close()

        # ---- Exploration page: collision blocks preview/download; success zip is clean ----
        atlas = new_page()
        atlas.goto(base + '/atlas/index.html')
        atlas.locator('#first-import').click()
        atlas.locator('#import-files').set_input_files(str(project_path))
        atlas.locator('#story').wait_for()
        atlas.locator('#share-project').click()
        atlas.locator('#preview-share').click()
        atlas.wait_for_function('document.querySelector("#share-report").textContent.includes("书名冲突")')
        atlas_report = atlas.locator('#share-report').inner_text()
        assert '未能生成公开内容' in atlas_report and '书名冲突' in atlas_report
        for token in [HIDDEN_TITLE, HIDDEN_AUTHOR, PRIVATE_MARKER, '尚未纳入公开书目', '未选择']:
            assert token not in atlas_report, token
        assert atlas.locator('#share-viewer').is_hidden()
        assert atlas.locator('#story').is_visible(), '失败后应保留原探索项目'
        checks['atlas_collision_preview_blocked_without_stale_preview'] = True

        before_downloads = len(downloads)
        atlas.locator('#download-share').click()
        atlas.wait_for_timeout(1200)
        assert len(downloads) == before_downloads, 'collision must not download an exploration package'
        assert '书名冲突' in atlas.locator('#share-report').inner_text()
        checks['atlas_collision_download_blocked'] = True

        atlas.locator('#share-books input[value="collide-selected"]').uncheck()
        atlas.locator('#preview-share').click()
        atlas.wait_for_function('document.querySelector("#share-viewer").hidden===false')
        assert '公开1本' in atlas.locator('#share-report').inner_text()
        checks['atlas_no_collision_preview_works'] = True
        with atlas.expect_download() as download_info:
            atlas.locator('#download-share').click()
        atlas_zip = OUT / 'atlas-public.zip'
        download_info.value.save_as(atlas_zip)
        with zipfile.ZipFile(atlas_zip) as package:
            combined = b''.join(package.read(name) for name in package.namelist())
            assert 'index.html' in package.namelist()
            for token in [HIDDEN_TITLE, HIDDEN_AUTHOR, PRIVATE_MARKER, '虚构旧城记']:
                assert token.encode() not in combined, token
        checks['atlas_success_download_excludes_hidden_and_private'] = True
        assert not errors, errors
        assert not store.jobs
        report_data = {'checks': checks, 'errors': errors, 'downloads': len(downloads), 'ai_calls': 0, 'output': str(OUT)}
        (OUT / 'public-collision-browser-report.json').write_text(json.dumps(report_data, ensure_ascii=False, indent=2), encoding='utf-8')
        print(json.dumps(report_data, ensure_ascii=False))
        browser.close()
finally:
    store.closed = True
    server.shutdown()
    server.server_close()
