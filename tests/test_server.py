import importlib.util
import json
import threading
import time
import unittest
import urllib.error
import urllib.request
from pathlib import Path
spec=importlib.util.spec_from_file_location('reading_server',Path(__file__).resolve().parents[1]/'server.py')
s=importlib.util.module_from_spec(spec);spec.loader.exec_module(s)
KEY='TEST_KEY_NOT_REAL'
def payload():return {'provider':'deepseek','model':'test','key':KEY,'stage':'books','books':[{'id':'a','title':'A','evidence':[{'id':'a:e0','text':'PRIVATE_TEXT'}]}]}
class JobsTest(unittest.TestCase):
    def test_isolation_cleanup_and_evidence(self):
        store=s.Jobs(lambda *args:{'books':[{'id':'a','tags':['Topic'],'summary':'result','evidenceIds':['a:e0','fake']}]},ttl=.05)
        jid=store.create('owner-a',payload())
        for _ in range(100):
            if store.get(jid,'owner-a')['status']=='complete':break
            time.sleep(.001)
        self.assertIsNone(store.get(jid,'owner-b'))
        self.assertEqual(store.get(jid,'owner-a')['result']['books'][0]['evidenceIds'],['a:e0'])
        self.assertEqual(store.jobs[jid]['key'],'');self.assertIsNone(store.jobs[jid]['payload'])
        time.sleep(.06);store.cleanup();self.assertNotIn(jid,store.jobs);store.closed=True
    def test_failure_never_reflects_key_or_material(self):
        def bad(*args):raise ValueError(KEY+' PRIVATE_TEXT')
        store=s.Jobs(bad);jid=store.create('a',payload())
        for _ in range(100):
            result=store.get(jid,'a')
            if result['status']=='failed':break
            time.sleep(.001)
        self.assertNotIn(KEY,json.dumps(result));self.assertNotIn('PRIVATE_TEXT',json.dumps(result));self.assertEqual(store.jobs[jid]['key'],'');store.closed=True
    def test_cancel_and_quota(self):
        event=threading.Event()
        def slow(*args):event.wait(.1);return {'books':[]}
        store=s.Jobs(slow);jid=store.create('a',payload())
        with self.assertRaises(ValueError):store.create('a',payload())
        self.assertFalse(store.delete(jid,'b'));self.assertTrue(store.delete(jid,'a'));event.set();self.assertIsNone(store.get(jid,'a'));store.closed=True
    def test_provider_and_structure_restrictions(self):
        for patch in [{'provider':'http://localhost'},{'books':[]},{'key':'x'},{'wordlist':[1]}]:
            with self.assertRaises(ValueError):s.validate_payload({**payload(),**patch})
    def test_link_requires_both_books_evidence(self):
        p={'stage':'links','books':[{'id':'a','evidence':[{'id':'a:e0'}]},{'id':'b','evidence':[{'id':'b:e0'}]}],'pairs':[['a','b']]}
        row={'source':'a','target':'b','evidenceIds':['a:e0'],'reason':'invented'}
        self.assertEqual(s.sanitize_result({'links':[row]},p)['links'],[])
        self.assertEqual(len(s.sanitize_result({'links':[{**row,'evidenceIds':['a:e0','b:e0']}]},p)['links']),1)

class HttpTest(unittest.TestCase):
    def setUp(self):
        self.store=s.Jobs(lambda *args:{'books':[]});self.server=s.Server(('127.0.0.1',0),jobs=self.store);threading.Thread(target=self.server.serve_forever,daemon=True).start();self.base=f'http://127.0.0.1:{self.server.server_port}'
    def tearDown(self):self.store.closed=True;self.server.shutdown();self.server.server_close()
    def request(self,path,method='GET',data=None,headers=None):
        req=urllib.request.Request(self.base+path,data=json.dumps(data).encode() if data else None,method=method,headers=headers or {})
        return urllib.request.urlopen(req)
    def test_csrf_owner_and_private_paths(self):
        response=self.request('/api/session');cookie=response.headers['Set-Cookie'].split(';')[0]
        with self.assertRaises(urllib.error.HTTPError) as error:self.request('/api/jobs','POST',payload(),{'Cookie':cookie,'Content-Type':'application/json','Origin':'https://attacker.invalid'})
        self.assertEqual(error.exception.code,403)
        r=self.request('/api/jobs','POST',payload(),{'Cookie':cookie,'Content-Type':'application/json','Origin':self.base});jid=json.load(r)['id']
        with self.assertRaises(urllib.error.HTTPError) as error:self.request('/api/jobs/'+jid)
        self.assertEqual(error.exception.code,404)
        for path in ['/server.py','/data/books.json','/.git/config']:
            with self.assertRaises(urllib.error.HTTPError):self.request(path)
if __name__=='__main__':unittest.main()
