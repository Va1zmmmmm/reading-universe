"""Synthetic local import/edit/export checks; no AI or third-party traffic."""
import importlib.util
import io
import json
import tempfile
import threading
import zipfile
from pathlib import Path
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('export_test_server', root / 'server.py')
s = importlib.util.module_from_spec(spec)
spec.loader.exec_module(s)
def reject_ai(*args):
    raise AssertionError('AI must not be called')
store = s.Jobs(reject_ai)
server = s.Server(('127.0.0.1', 0), jobs=store)
threading.Thread(target=server.serve_forever, daemon=True).start()
url = f'http://127.0.0.1:{server.server_port}'
errors, blocked, checks = [], [], []
try:
    with tempfile.TemporaryDirectory(prefix='reading-export-') as temp, sync_playwright() as pw:
        try:
            browser = pw.chromium.launch()
        except Exception:
            browser = pw.chromium.launch(channel='msedge')
        context = browser.new_context(accept_downloads=True)
        def route(request):
            address = request.request.url
            if address.startswith(url + '/') or address.startswith(('file://', 'data:', 'blob:')):
                request.continue_()
            else:
                blocked.append(address)
                request.abort()
        context.route('**/*', route)
        page = context.new_page()
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.goto(url)
        hostile = '<img src=x onerror="globalThis.hacked=1">'
        data = {'books': [{'id': 'toString', 'title': hostile, 'author': '</script><script>globalThis.hacked=2</script>', 'tags': ['toString']}]}
        raw = json.dumps(data).encode()
        # A streaming ZIP uses data descriptors; the ordinary ZIP uses deflate.
        class NonSeekable(io.BytesIO):
            def seekable(self): return False
            def seek(self, *args): raise io.UnsupportedOperation()
        for stream in [io.BytesIO(), NonSeekable()]:
            with zipfile.ZipFile(stream, 'w', zipfile.ZIP_DEFLATED) as z:
                z.writestr('books.json', raw)
                z.writestr('notes/toString.md', 'Synthetic material')
            assert bool(int.from_bytes(stream.getvalue()[6:8], 'little') & 8) == isinstance(stream, NonSeekable)
            page.evaluate('document.querySelector("#notice").textContent=""')
            page.locator('#files').set_input_files({'name': 'input.zip', 'mimeType': 'application/zip', 'buffer': stream.getvalue()})
            page.wait_for_function('document.querySelector("#notice").textContent.startsWith("已在本机读取")')
            page.wait_for_function('window.__readingViews?.graph.nodes.some(n=>n.label==="toString")')
            assert page.locator('#notice').inner_text().startswith('已在本机读取')
        checks.append('normal deflate and streaming descriptor ZIP imports')
        page.locator('summary').click()
        page.locator('#card-text').fill('OLD_KEPT')
        page.locator('#edit-card').click()
        page.locator('#card-text').fill('x' * 20001)
        page.locator('#edit-card').click()
        assert '20000' in page.locator('#notice').inner_text()
        assert len(page.locator('#card-text').input_value()) == 20001
        with page.expect_download() as download:
            page.locator('#save').click()
        private_path = Path(temp) / 'private.json'
        download.value.save_as(private_path)
        assert json.loads(private_path.read_text(encoding='utf-8'))['edits']['cards']['toString'] == 'OLD_KEPT'
        checks.append('oversize edit rejected; input and prior saved card preserved')
        page.locator('#share').click()
        page.locator('#preview-public').click()
        with page.expect_download() as download:
            page.locator('#download-public').click()
        public_zip = Path(temp) / 'public.zip'
        download.value.save_as(public_zip)
        with zipfile.ZipFile(public_zip) as z:
            assert b'OLD_KEPT' not in b''.join(z.read(n) for n in z.namelist())
            # Generated archive has fixed asset paths; assert before extracting.
            assert all(not n.startswith('/') and '..' not in Path(n).parts for n in z.namelist())
            z.extractall(Path(temp) / 'public')
        checks.append('actual public export omits private card')
        offline = context.new_page()
        offline.on('pageerror', lambda e: errors.append(str(e)))
        offline.goto((Path(temp) / 'public/index.html').as_uri())
        offline.locator('#search').wait_for()
        offline.evaluate('showPanel("book:toString")')
        assert hostile in offline.locator('#panel').inner_text()
        assert offline.locator('#panel img, #panel script').count() == 0
        assert offline.evaluate('globalThis.hacked') is None
        offline.evaluate('showPanel("theme:toString")')
        assert hostile in offline.locator('#panel').inner_text()
        assert offline.locator('#panel img, #panel script').count() == 0
        assert offline.evaluate('globalThis.hacked') is None
        assert not errors, errors
        assert not blocked, blocked
        checks.append('offline exported HTML renders hostile title and author as literal text')
        print(json.dumps({'passed': len(checks), 'checks': checks, 'page_errors': errors, 'external_requests': len(blocked), 'ai_calls': 0}, ensure_ascii=False))
        browser.close()
finally:
    store.closed = True
    server.shutdown()
    server.server_close()
