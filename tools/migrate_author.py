"""Create the explicitly selected public author example from already public data."""
import json
from pathlib import Path
root=Path(__file__).resolve().parents[1]
books=json.loads((root/'data/books.json').read_text(encoding='utf-8'))['books']
tags=json.loads((root/'data/theme_tags.json').read_text(encoding='utf-8'))
links=json.loads((root/'data/links.json').read_text(encoding='utf-8'))
ids={b['title']:str(b['bookId']) for b in books}
project={'format':'reading-universe-private','version':1,'books':[], 'analysis':{},'links':[], 'cards':{}, 'edits':{'books':{},'cards':{},'links':[]},'settings':{'wordlist':[]}}
for b in books:
    bid=str(b['bookId'])
    project['books'].append({'id':bid,'title':b['title'],'author':b.get('author',''),'readingTime':b.get('readingTime',0),'notes':b.get('notes',0),'evidence':[]})
    if bid in tags:project['analysis'][bid]={'tags':tags[bid]['tags'],'summary':'','evidenceIds':[],'basis':'imported','fingerprint':''}
for card in (root/'data/themes').glob('*.md'):
    project['cards'][card.stem]=card.read_text(encoding='utf-8')
for row in links:
    if row['source'] not in ids:continue
    for l in row['links']:
        project['links'].append({'source':ids[row['source']],'target':ids.get(l['target'],l['target']),'targetType':'book' if l['target'] in ids else 'concept' if l['type']=='concept' else 'external','type':'reference','reason':l.get('desc',''),'evidenceIds':[],'basis':'imported'})
out=root/'web/examples/author-public.json';out.parent.mkdir(parents=True,exist_ok=True)
out.write_text(json.dumps(project,ensure_ascii=False),encoding='utf-8')
print(f'Public author example: {len(books)} books, {len(project["links"])} imported relations')
