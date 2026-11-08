// Synthetic regression: save/reopen with a historical exploration quote whose
// material has been unchecked for AI use (included=false).
// Usage: node test-save-conflict.mjs <srcDir> <accept|reject>
// accept = patched code must save + reopen + keep the AI gate closed.
// reject = baseline code must throw at save time (reproduces the reported failure).
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const srcDir = path.resolve(process.argv[2]);
const mode = process.argv[3] || 'accept';
const url = name => pathToFileURL(path.join(srcDir, name)).href;
const core = await import(url('core.mjs'));
const atlas = await import(url('atlas-project.mjs'));
const exploration = await import(url('exploration.mjs'));

const excerpt1 = '这是第一段仅用于合成测试的虚构原文。';
const excerpt2 = '这是第二段仅用于合成测试的虚构原文。';
const project = {
  format: 'reading-universe-private', version: 1, name: '合成项目',
  books: [{
    id: 'b1', title: '合成书', author: '合成作者', included: true, cover: '',
    tags: ['主题甲'], readingTime: 3600, notes: 2, finished: true, finishTime: '2026-01-01', rating: '',
    evidence: [
      { id: 'b1:e1', text: excerpt1, kind: 'highlight', source: '合成资料', included: false },
      { id: 'b1:e2', text: excerpt2, kind: 'highlight', source: '合成资料', included: false },
    ],
  }],
  analysis: {}, links: [], linkCache: {}, cards: {},
  edits: { books: {}, cards: {}, links: [], removedPairs: [] },
  settings: { wordlist: [], aliases: {} },
  exploration: { version: 1, themes: [{
    id: 't1', basis: 'curated', name: '主题甲', title: '虚构线索', opening: '开场', entry: '入口',
    endTitle: '结束', endBody: '收束', start: 'n1',
    nodes: [{
      id: 'n1', title: '节点一', subtitle: '副标题', context: '上下文', observation: '观察',
      quote: { bookId: 'b1', evidenceId: 'b1:e1', excerpt: excerpt1 }, choices: [],
    }],
  }] },
  journey: { activeTheme: 't1', sessions: [{ theme: 't1', steps: [{ id: 'n1', from: null, kind: 'start' }], at: 0, pins: [], notes: [], revisiting: false }] },
};

let saved = null, saveError = null;
try {
  saved = core.privatePackage(project);
} catch (error) {
  saveError = error;
}

if (mode === 'reject') {
  if (!saveError) { console.error('EXPECTED SAVE REJECTION BUT SAVE SUCCEEDED'); process.exit(1); }
  console.log(JSON.stringify({ mode, reproduced: true, message: saveError.message }));
  console.log('REPRO: save-time rejection reproduced');
  process.exit(0);
}

if (saveError) { console.error('UNEXPECTED SAVE FAILURE: ' + saveError.message); process.exit(1); }

const problems = [];
const check = (ok, message) => { if (!ok) problems.push(message); };
const savedQuote = saved?.exploration?.themes?.[0]?.nodes?.[0]?.quote;
check(saved?.books?.[0]?.evidence?.find(e => e.id === 'b1:e1')?.included === false, 'included=false was not preserved in the saved package');
check(savedQuote?.excerpt === excerpt1, 'historical quote was not preserved in the saved package');
check(saved?.exploration?.themes?.length === 1, 'theme was lost from the saved package');

let reopened = null, reopenError = null;
try { reopened = atlas.normalizeProject(saved); } catch (error) { reopenError = error; }
check(!reopenError, 'reopen failed: ' + (reopenError?.message || ''));
check(reopened?.exploration?.themes?.[0]?.nodes?.[0]?.quote?.excerpt === excerpt1, 'reopen lost the historical quote');

const find = atlas.findEvidence(saved, { bookId: 'b1', evidenceId: 'b1:e1', excerpt: excerpt1 });
check(!!find, 'findEvidence should resolve a saved historical reference even when included=false');
check(!atlas.findEvidence(saved, { bookId: 'b1', evidenceId: 'b1:e1', excerpt: '不匹配的片段' }), 'findEvidence must still reject a mismatched excerpt');

const selections = [
  { bookId: 'b1', evidenceId: 'b1:e1', text: excerpt1 },
  { bookId: 'b1', evidenceId: 'b1:e2', text: excerpt2 },
];
const topic = { id: 'trail-test', name: '合成主题', question: '合成问题' };
let aiBlocked = false;
try { exploration.explorationRequest(saved, selections, topic); } catch { aiBlocked = true; }
check(aiBlocked, 'AI request gate no longer blocks included=false material');

const allowedCopy = structuredClone(saved);
for (const e of allowedCopy.books[0].evidence) e.included = true;
let allowed = null;
try { allowed = exploration.explorationRequest(allowedCopy, selections, topic); } catch (error) { problems.push('included=true material was rejected: ' + error.message); }
check(allowed?.books?.length === 1, 'AI request was not assembled for included=true material');

console.log(JSON.stringify({ mode, saved: !!saved, reopened: !!reopened, problems }));
if (problems.length) { console.error('FAIL: ' + problems.join('; ')); process.exit(1); }
console.log('PASS: save, reopen, historical quote and AI gate all behave as intended');
