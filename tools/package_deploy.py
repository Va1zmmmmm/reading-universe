"""Build a reviewable deployment ZIP from an explicit source allowlist; never deploy it."""
from pathlib import Path
import argparse
import hashlib
import json
import zipfile

REPO=Path(__file__).resolve().parents[1]
ROOT_FILES=['server.py','exploration.py','Dockerfile','README.md','LICENSE','docs/DEPLOY.md','docs/USER_GUIDE.md','docs/DATA_FORMAT.md','docs/ONLINE_ARCHITECTURE.md','docs/RELEASE_NOTES.md','deploy/reading-universe.service','deploy/nginx.conf.example']
WEB_FILES=['app.css','app.mjs','atlas-project.mjs','atlas-sharing.mjs','atlas-onboarding.mjs','atlas-onboarding.css','core.mjs','exploration.mjs','guide.html','index.html','project-actions.mjs','public-atlas-contract.mjs','public-reader-runtime.js','public-reader.css','public-reader.html','public-reader.js','sample-input.json','universe-fields.mjs','universe.js','viewer-data.js','viewer.html','zip.mjs','examples/author-public.json','examples/demo-project.json','lib/vis-network.min.js']
ATLAS_FILES=['compose.css','compose.js','explore.css','index.html','themes.css','trail-story.css','trail.css','workspace-core.mjs','workspace-zip.mjs','workspace.css','workspace.js']

def sources():return ROOT_FILES+['web/'+p for p in WEB_FILES]+['web/atlas/'+p for p in ATLAS_FILES]
def reader_bundle():
    contract=(REPO/'web/public-atlas-contract.mjs').read_text(encoding='utf-8')
    contract='\n'.join(line.removeprefix('export ') for line in contract.split('\n'))
    runtime=(REPO/'web/public-reader-runtime.js').read_text(encoding='utf-8')
    return '// Generated public-only offline reader; rebuild with tools/build_public_reader.mjs.\n(function(){\n'+contract+'\n'+runtime+'\n})();\n'

def build(output):
    if (REPO/'web/public-reader.js').read_text(encoding='utf-8')!=reader_bundle():raise ValueError('Public reader is stale; rebuild it first.')
    entries={}
    for name in sources():
        path=REPO/name
        if path.is_symlink() or not path.resolve().is_relative_to(REPO.resolve()) or not path.is_file():raise ValueError('Missing or unexpected source: '+name)
        entries[name]=path.read_bytes()
    example=json.loads(entries['web/examples/author-public.json'])
    # The historical public example uses a private-format wrapper for ordinary import,
    # but contains already-public metadata and no source material or personal journeys.
    if example.get('format') not in ['reading-universe-public','reading-universe-private'] or example.get('version')!=1 or set(example)-{'format','version','books','analysis','links','cards','edits','settings'} or any(b.get('evidence') for b in example.get('books',[])):raise ValueError('Author example is not the approved metadata-only public package.')
    def credentials(value):
        if isinstance(value,dict):return any(key.lower() in {'key','api_key','apikey','cookie','provider','token','authorization','password'} or credentials(item) for key,item in value.items())
        return isinstance(value,list) and any(credentials(item) for item in value)
    if credentials(example):raise ValueError('Unexpected credential field in example')
    demo=json.loads(entries['web/examples/demo-project.json'])
    if demo.get('name')!='试玩 · 原创手记里的三条线索' or len(demo.get('books',[]))!=6 or len(demo.get('exploration',{}).get('themes',[]))!=3 or credentials(demo):raise ValueError('Demo is not the reviewed original-material project')
    if any(b.get('author')!='页间 · 原创示例' or any(e.get('kind')!='note' or not e.get('source','').startswith('原创示例') for e in b.get('evidence',[])) for b in demo['books']):raise ValueError('Unexpected material provenance in demo')
    manifest={'format':'reading-universe-deployment-manifest','version':1,'sha256':{name:hashlib.sha256(body).hexdigest() for name,body in entries.items()},'excluded':['private workspaces and credentials','author private exploration/source material','historical graph_data.js and universe_data.js snapshots','repository history and data/','private preview switch is not enabled']}
    entries['DEPLOYMENT-MANIFEST.json']=json.dumps(manifest,ensure_ascii=False,indent=2).encode('utf-8')
    output.parent.mkdir(parents=True,exist_ok=True)
    with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED) as package:
        for name,body in entries.items():package.writestr(name,body)
    with zipfile.ZipFile(output) as package:
        if set(package.namelist())!=set(entries):raise ValueError('Deployment tree mismatch')
        for name,body in entries.items():
            if package.read(name)!=body:raise ValueError('Deployment content mismatch: '+name)
    return manifest

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--out',type=Path,required=True);args=parser.parse_args()
    result=build(args.out.resolve());print(json.dumps({'package':str(args.out.resolve()),'verified_files':len(result['sha256'])+1,'sha256':hashlib.sha256(args.out.read_bytes()).hexdigest(),'deployed':False},ensure_ascii=False))
