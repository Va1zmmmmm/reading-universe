"""Real browser checks for explicit demo loading, source-only paste, and save safety. No AI calls."""
from pathlib import Path
import importlib.util,json,os,tempfile,threading
from playwright.sync_api import sync_playwright
REPO=Path(__file__).resolve().parents[1]
OUT=Path(os.environ.get('READING_TEST_OUTPUT',tempfile.mkdtemp(prefix='reading-onboarding-')));OUT.mkdir(parents=True,exist_ok=True)
spec=importlib.util.spec_from_file_location('onboarding_server',REPO/'server.py');s=importlib.util.module_from_spec(spec);spec.loader.exec_module(s)
server=s.Server(('127.0.0.1',0),jobs=s.Jobs());threading.Thread(target=server.serve_forever,daemon=True).start()
base=os.environ.get('READING_TEST_ORIGIN',f'http://127.0.0.1:{server.server_port}').rstrip('/')
checks={};errors=[];requests=[]
with sync_playwright() as pw:
    try:browser=pw.chromium.launch(args=['--no-proxy-server'])
    except Exception:browser=pw.chromium.launch(channel='msedge',args=['--no-proxy-server'])
    ctx=browser.new_context(viewport={'width':1440,'height':1050},accept_downloads=True)
    page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.on('request',lambda r:requests.append((r.method,r.url)))
    page.on('dialog',lambda d:d.dismiss())
    page.goto(base+'/atlas/index.html');page.locator('#try-demo').wait_for()
    assert page.locator('#journey-layout').is_hidden() and not any('demo-project.json' in url for _,url in requests)
    checks['demo_requires_explicit_choice']=True
    page.locator('#try-demo').click();page.locator('#theme-switcher button').nth(2).wait_for()
    assert page.locator('#trial-caption').is_visible() and page.locator('#walk button').count()==1
    page.screenshot(path=str(OUT/'demo-opening-desktop.png'))
    # Four levels, two branches, and a convergence; visiting the same ending must not duplicate discovery.
    for target in ['waiting','unfinished','listening']:page.locator(f'#choices [data-follow="{target}"]').click()
    assert page.locator('#walk button').count()==4
    page.locator('#walk [data-step="0"]').click();page.locator('#choices [data-follow="rest"]').click();page.locator('#choices [data-follow="company"]').click();page.locator('#choices .review-choices summary').click();page.locator('#choices [data-follow="listening"]').click()
    assert page.locator('#walk button').count()==6
    for _ in range(6):
        page.locator('#walk [data-step="0"]').click();page.locator('#choices .review-choices summary').click();page.locator('#choices [data-follow="waiting"]').click()
    assert page.locator('#walk button').count()==6
    checks['four_level_branches_and_revisits_without_duplicate_discoveries']=True
    page.locator('#thought').fill('PRIVATE_ONBOARDING_NOTE')
    page.locator('[data-theme="memory"]').click();assert page.locator('#walk button').count()==1
    page.locator('#choices [data-follow="photo"]').click();page.locator('#choices [data-follow="table"]').click();page.locator('#choices [data-follow="reread"]').click()
    page.locator('[data-theme="choice"]').click();page.locator('#choices [data-follow="no"]').click();page.locator('#choices [data-follow="cost"]').click();page.locator('#choices [data-follow="pause"]').click()
    assert page.locator('#theme-switcher button').count()==3
    with page.expect_download() as download:page.locator('#save-project').click()
    file=OUT/'demo-saved.json';download.value.save_as(file)
    saved=json.loads(file.read_text(encoding='utf-8'));assert len(saved['books'])==6 and len(saved['exploration']['themes'])==3 and len(saved['journey']['sessions'])==3
    assert 'PRIVATE_ONBOARDING_NOTE' in json.dumps(saved) and all(not b.get('api_key') for b in saved['books'])
    page.goto(base+'/atlas/index.html');page.locator('#first-import').click();page.locator('#import-files').set_input_files(str(file));page.locator('#story').wait_for()
    assert '选择与代价' in page.locator('#theme-title').inner_text() or '遗憾' in page.locator('#theme-title').inner_text()
    page.locator('[data-theme="distance"]').click();assert page.locator('#thought').input_value()=='PRIVATE_ONBOARDING_NOTE'
    checks['all_three_themes_full_materials_and_personal_records_restore']=True
    page.locator('#thought').fill('PRIVATE_UNSAVED_NOTE');page.locator('#manage-project').click();page.locator('#open-another').click();page.locator('#choose-paste').click()
    page.locator('#paste-title').fill('我的摘记 <img src=x onerror="window.hacked=1">');page.locator('#paste-author').fill('自己');page.locator('#paste-kind').select_option('note');page.locator('#paste-text').fill('第一段自己的笔记。\n\n第二段 <script>window.hacked=1</script> 是文字。')
    page.locator('#paste-form button[type="submit"]').click();page.locator('#pending-actions').wait_for()
    assert page.locator('#project-status').inner_text().startswith('试玩') and '未保存' in page.locator('#import-error').inner_text()
    page.locator('#pending-actions').get_by_text('打开新项目',exact=True).click();page.locator('#catalog-books .catalog-book').wait_for()
    assert page.locator('#catalog-books .catalog-book').count()==1
    page.locator('#catalog-books .catalog-book').click();assert page.locator('#book-materials details').count()==2
    page.locator('#book-materials details').nth(1).locator('summary').click()
    assert '<script>window.hacked=1</script>' in page.locator('#book-materials').inner_text() and page.evaluate('window.hacked') is None
    page.locator('#close-book').click()
    with page.expect_download() as download:page.locator('#save-project').click()
    file=OUT/'pasted-saved.json';download.value.save_as(file);saved=json.loads(file.read_text(encoding='utf-8'))
    assert len(saved['books'][0]['evidence'])==2 and all(e['kind']=='note' for e in saved['books'][0]['evidence']) and not saved['exploration']['themes']
    checks['pasting_preserves_source_kind_escapes_text_and_protects_unsaved_project']=True
    assert not any(method!='GET' for method,_ in requests),requests
    checks['demo_and_paste_need_no_key_or_original_upload']=True
    page.goto(base+'/atlas/index.html?demo=memory');page.locator('#story').wait_for();assert '留下了东西' in page.locator('#theme-title').inner_text()
    page.locator('#choices [data-follow="photo"]').click();page.screenshot(path=str(OUT/'demo-memory-desktop.png'))
    page.set_viewport_size({'width':390,'height':844});page.screenshot(path=str(OUT/'demo-mobile.png'))
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth+1')
    page=ctx.new_page();page.set_viewport_size({'width':390,'height':844});page.on('pageerror',lambda e:errors.append(str(e)));page.on('request',lambda r:requests.append((r.method,r.url)))
    page.goto(base+'/atlas/index.html');page.locator('#try-demo').wait_for();page.screenshot(path=str(OUT/'landing-mobile.png'))
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth+1')
    page.locator('#start-paste').click();assert page.locator('#paste-dialog').is_visible() and page.evaluate('document.documentElement.scrollWidth <= innerWidth+1')
    checks['direct_demo_link_and_mobile_entries_work']=True
    assert not errors,errors
    checks['no_page_errors']=True
    (OUT/'onboarding-verification.json').write_text(json.dumps({'checks':checks,'paid_calls':0,'page_errors':errors},ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'passed':len(checks),'paid_calls':0,'output':str(OUT)},ensure_ascii=False));browser.close()
server.jobs.closed=True;server.shutdown();server.server_close()
