import copy,importlib.util,json,threading,time,unittest,urllib.error,urllib.request
from pathlib import Path
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('trail_server_test',Path(__file__).resolve().parents[1]/'server.py')
s=importlib.util.module_from_spec(spec);spec.loader.exec_module(s)
KEY='TEST_TRAIL_KEY_NOT_REAL'
def payload():
    return {'provider':'deepseek','model':'fixture-model','key':KEY,'stage':'exploration','topic':{'id':'test-trail','name':'旅行','question':'留下与出发有什么联系？'},'books':[{'id':'own','title':'自己的手记','author':'读者','evidence':[{'id':'first','text':'在门口停了一会儿。','kind':'note'},{'id':'second','text':'车窗外有一棵树。','kind':'note'},{'id':'third','text':'我想再等等。','kind':'review'}]}]}
def result(p):
    evidence=p['books'][0]['evidence'];book=p['books'][0]['id']
    def node(i):return {'id':f'n{i}','title':['在出发前停留','上车之后看见了什么','再等一等'][i],'subtitle':'从手记进入','context':'这段手记写的是一个具体的停留。','quote':{'bookId':book,'evidenceId':evidence[i]['id'],'excerpt':evidence[i]['text']},'observation':'这段材料留下一个可以继续问的问题。','choices':[]}
    nodes=[node(i) for i in range(3)]
    nodes[0]['choices']=[{'target':'n1','label':'上车后，看见什么？','hint':'继续读车窗外的片段。','bridge':'刚才在出发前停留；接着读上车后的观察。'},{'target':'n2','label':'还想等一等，是为什么？','hint':'对照另一段读者书评。','bridge':'刚才是具体停留；这一段是读者关于等待的想法。'}]
    return {'theme':{'id':p['topic']['id'],'name':'旅行','title':'停留之后，可以走向哪里？','opening':'想出发时，你会在门口停留吗？先从这份手记读起。','entry':'从读者自己的手记进入','start':'n0','endTitle':'这条线索先读到这里。','endBody':'材料只讲了这些时刻，可以带着疑问离开。','nodes':nodes},'apiKey':KEY}
def wait(store,jid):
    for _ in range(300):
        value=store.get(jid,'owner')
        if value['status'] in ('failed','complete'):return value
        time.sleep(.005)
    raise AssertionError('task did not settle')
class TrailTests(unittest.TestCase):
    def test_selected_source_kind_and_result_whitelist(self):
        _,_,_,p=s.validate_payload(payload());r=s.sanitize_result(result(p),p)
        self.assertEqual(r['theme']['basis'],'ai-draft');self.assertNotIn(KEY,json.dumps(r));self.assertEqual(p['books'][0]['evidence'][2]['kind'],'review')
        self.assertEqual(len(r['theme']['nodes']),3)
    def test_bad_quotes_duplicate_unreachable_no_choice_and_no_stop(self):
        _,_,_,p=s.validate_payload(payload())
        for mutate in [lambda r:r['theme']['nodes'][0]['quote'].update(excerpt='伪造原文'),lambda r:r['theme']['nodes'][0]['choices'][0].update(target='missing'),lambda r:r['theme']['nodes'][1].update(id='n0'),lambda r:r['theme']['nodes'][0].update(choices=[]),lambda r:r['theme']['nodes'][1].update(quote=copy.deepcopy(r['theme']['nodes'][0]['quote'])),lambda r:r['theme']['nodes'][0].update(choices=r['theme']['nodes'][0]['choices'][:1]),lambda r:r['theme']['nodes'][1].update(choices=[{'target':'n0','label':'回去','hint':'回去看看','bridge':'回去对照'}]) or r['theme']['nodes'][2].update(choices=[{'target':'n0','label':'回去','hint':'回去看看','bridge':'回去对照'}])]:
            r=result(p);mutate(r)
            with self.assertRaises(ValueError):s.sanitize_result(r,p)
    def test_input_limits_and_duplicate_material(self):
        for mutate in [lambda p:p.update(topic={'id':'invalid id','name':'主题'}),lambda p:p['books'][0].update(evidence=p['books'][0]['evidence'][:1]),lambda p:p['books'][0]['evidence'][1].update(id='first'),lambda p:p['books'][0]['evidence'][0].update(text='x'*1501),lambda p:p.update(provider='https://attacker.invalid')]:
            p=payload();mutate(p)
            with self.assertRaises(ValueError):s.validate_payload(p)
    def test_complete_task_clears_key_and_input_and_delete_removes_result(self):
        store=s.Jobs(lambda *a:result(a[-1]));jid=store.create('owner',payload());r=wait(store,jid)
        self.assertEqual(r['status'],'complete');self.assertEqual(store.jobs[jid]['key'],'');self.assertIsNone(store.jobs[jid]['payload']);self.assertIsNone(store.get(jid,'other'))
        self.assertTrue(store.delete(jid,'owner'));self.assertIsNone(store.get(jid,'owner'));store.closed=True
    def test_failure_and_sensitive_text_never_echo_key(self):
        def leak(*a):r=result(a[-1]);r['theme']['nodes'][0]['context']=KEY;return r
        for caller in [leak,lambda *a:{'insufficient':True},lambda *a:{'theme':{'id':KEY}}]:
            store=s.Jobs(caller);jid=store.create('owner',payload());r=wait(store,jid)
            self.assertEqual(r['status'],'failed');self.assertNotIn(KEY,json.dumps(r));self.assertEqual(store.jobs[jid]['key'],'');self.assertIsNone(store.jobs[jid]['payload']);store.closed=True
    def test_wire_parameters_and_truncation(self):
        class Response:
            def __enter__(self):return self
            def __exit__(self,*args):pass
            def read(self,*args):return json.dumps({'choices':[{'message':{'content':'{}'},'finish_reason':self.reason}]}).encode()
        class Opener:
            def open(self,req,timeout):self.req=req;self.timeout=timeout;return response
        response=Response();response.reason='stop';opener=Opener();_,_,_,p=s.validate_payload(payload())
        with patch.object(s.urllib.request,'build_opener',return_value=opener):
            s.call_model('openai','fixture-model',KEY,p);body=json.loads(opener.req.data)
            self.assertFalse(body['store']);self.assertEqual(body['max_completion_tokens'],8192);self.assertNotIn('max_tokens',body);self.assertNotIn('temperature',body)
            self.assertEqual(body['messages'][0]['content'],s.trail.PROMPT);self.assertEqual(opener.timeout,90)
            s.call_model('deepseek','fixture-model',KEY,p);self.assertEqual(json.loads(opener.req.data)['max_tokens'],8192)
            response.reason='length'
            with self.assertRaises(ValueError):s.call_model('openai','fixture-model',KEY,p)
    def test_administrator_proxy_is_loopback_only_and_openai_only(self):
        class Response:
            def __enter__(self):return self
            def __exit__(self,*args):pass
            def read(self,*args):return b'{"choices":[{"message":{"content":"{}"}}]}'
        class Opener:
            def open(self,*args,**kwargs):return Response()
        _,_,_,p=s.validate_payload(payload())
        with patch.dict(s.os.environ,{'READING_OPENAI_PROXY':'http://127.0.0.1:17890'}),patch.object(s.urllib.request,'build_opener',return_value=Opener()) as build:
            s.call_model('openai','fixture-model',KEY,p)
            proxies=[h for h in build.call_args.args if isinstance(h,s.urllib.request.ProxyHandler)]
            self.assertEqual(proxies[0].proxies,{'https':'http://127.0.0.1:17890'})
            s.call_model('deepseek','fixture-model',KEY,p)
            self.assertFalse(any(isinstance(h,s.urllib.request.ProxyHandler) for h in build.call_args.args))
        with patch.dict(s.os.environ,{'READING_OPENAI_PROXY':'http://external.invalid:17890'}):
            with self.assertRaises(ValueError):s.call_model('openai','fixture-model',KEY,p)
    def test_cancellation_and_expiry(self):
        gate=threading.Event()
        store=s.Jobs(lambda *a:(gate.wait(.2),result(a[-1]))[1]);jid=store.create('owner',payload())
        self.assertTrue(store.delete(jid,'owner'));gate.set();self.assertIsNone(store.get(jid,'owner'));store.closed=True
        store=s.Jobs(lambda *a:result(a[-1]),ttl=.05);jid=store.create('owner',payload());wait(store,jid);time.sleep(.06);store.cleanup();self.assertNotIn(jid,store.jobs);store.closed=True
    def test_preview_assets_default_closed_and_localhost_only(self):
        with self.assertRaises(ValueError):s.Server(('0.0.0.0',0),explore_preview=True)
        for enabled in (False,True):
            store=s.Jobs(lambda *a:result(a[-1]));server=s.Server(('127.0.0.1',0),jobs=store,explore_preview=enabled);threading.Thread(target=server.serve_forever,daemon=True).start();base=f'http://127.0.0.1:{server.server_port}'
            try:
                if enabled:
                    with urllib.request.urlopen(base+'/explore/compose.html') as response:self.assertIn(b'compose.js',response.read())
                    with self.assertRaises(urllib.error.HTTPError):urllib.request.urlopen(urllib.request.Request(base+'/explore/themes-project.json',headers={'Host':'attacker.invalid'}))
                else:
                    with self.assertRaises(urllib.error.HTTPError):urllib.request.urlopen(base+'/explore/compose.html')
                for path in ['/explore/README.md','/explore/theme-materials-ledger.json','/explore/../server.py','/exploration.py','/server.py']:
                    with self.assertRaises(urllib.error.HTTPError):urllib.request.urlopen(base+path)
            finally:store.closed=True;server.shutdown();server.server_close()
if __name__=='__main__':unittest.main()
