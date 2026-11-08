// Synthetic regression: app.mjs generation lock.
// Usage: node test-generation-lock.mjs <path-to-app.mjs> <scenario> [--expect-posts N]
// Scenarios: concurrent | failure-recovery | cancel-recovery
// Uses a hand-written DOM stub and a mock /api fetch. No real network, no AI, no real data.
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const appPath = path.resolve(process.argv[2]);
const scenario = process.argv[3] || 'concurrent';
const expectArg = process.argv.indexOf('--expect-posts');
const expectPosts = Number(expectArg >= 0 ? process.argv[expectArg + 1] : (scenario === 'concurrent' ? 1 : 2));
const DEBUG = process.argv.includes('--debug');

class El {
  constructor(tag = 'div') {
    this.tag = tag; this.textContent = ''; this.value = ''; this.hidden = false;
    this.disabled = false; this.checked = false; this.files = []; this.src = '';
    this.style = {}; this.dataset = {}; this.children = []; this._listeners = {};
    this.classList = { toggle() {}, add() {}, remove() {}, contains() { return false; } };
  }
  addEventListener(type, fn) { (this._listeners[type] ??= []).push(fn); }
  removeEventListener() {}
  querySelector() { return new El('query'); }
  querySelectorAll() { return []; }
  replaceChildren() { this.children = []; }
  append(...nodes) { this.children.push(...nodes); }
  prepend(...nodes) { this.children.unshift(...nodes); }
  before(node) { this._before = node; }
  after(node) { this._after = node; }
  scrollIntoView() {}
  setAttribute() {}
  focus() {}
  click() {}
  getContext() { return {}; }
  getClientRects() { return []; }
}

const els = new Map();
const el = id => { if (!els.has(id)) els.set(id, new El(id)); return els.get(id); };
const documentStub = {
  getElementById: el,
  createElement: tag => new El(tag),
  createTextNode: text => ({ nodeValue: text, textContent: text }),
  documentElement: { dataset: {} },
  addEventListener() {},
};
globalThis.document = documentStub;
globalThis.window = { addEventListener() {} };
globalThis.localStorage = { getItem: () => null, setItem() {} };
globalThis.location = { origin: 'http://synthetic.local' };

let postCount = 0, sessionCount = 0, deleteCount = 0;
const jobs = new Map();
const reply = (data, ok = true) => ({ ok, status: ok ? 200 : 502, json: async () => data });

globalThis.fetch = async (url, options = {}) => {
  const pathOnly = String(url).replace(/^https?:\/\/[^/]+/, '');
  const marker = '/api/';
  const at = pathOnly.indexOf(marker);
  if (at < 0) throw new Error('unexpected URL: ' + url);
  const route = pathOnly.slice(at + marker.length);
  const method = String(options.method || 'GET').toUpperCase();
  if (DEBUG) console.error('FETCH', method, route);

  if (route === 'session' && method === 'GET') { sessionCount++; return reply({ stages: ['books', 'links'] }); }
  if (route === 'jobs' && method === 'POST') {
    postCount++;
    if (scenario === 'failure-recovery' && postCount === 1) return reply({ error: '模拟接口失败' }, false);
    const id = 'job-' + postCount;
    jobs.set(id, { canceled: false });
    return reply({ id });
  }
  if (route.startsWith('jobs/')) {
    const id = route.slice('jobs/'.length);
    if (method === 'DELETE') { deleteCount++; if (jobs.has(id)) jobs.get(id).canceled = true; return reply({ ok: true }); }
    const job = jobs.get(id);
    if (!job) return reply({ error: 'missing job' }, false);
    if (job.canceled) return reply({ status: 'cancelled' });
    if (scenario === 'cancel-recovery' && id === 'job-1') return reply({ status: 'running' });
    return reply({ status: 'complete', result: { books: [{ id: 'b1', tags: [], summary: '', evidenceIds: [], basis: 'inferred', fingerprint: '' }] } });
  }
  throw new Error('unexpected route: ' + method + ' ' + route);
};

await import(pathToFileURL(appPath).href);

// Load one synthetic book through the real file-import handler.
const filesEl = el('files');
filesEl.files = [{
  name: 'books.json', size: 64, webkitRelativePath: '',
  text: async () => JSON.stringify({ books: [{ id: 'b1', title: '合成书' }] }),
}];
await filesEl._listeners.change[0]();
if (DEBUG) console.error('after load: notice=', el('notice').textContent, 'counts=', el('counts').textContent);
const origDigest = globalThis.crypto.subtle.digest.bind(globalThis.crypto.subtle);
let digestMode = 'auto';
const pendingDigests = [];
globalThis.crypto.subtle.digest = (...args) => {
  if (DEBUG) console.error('DIGEST', digestMode);
  if (digestMode === 'auto') return origDigest(...args);
  return new Promise(resolve => pendingDigests.push(() => resolve(new Uint8Array(32))));
};

const arm = () => {
  el('consent').checked = true;
  el('key').value = 'synthetic-key';
  el('task-budget').value = '60';
  el('provider').value = 'deepseek';
  el('model').value = 'mock-model';
  el('wordlist').value = '';
  el('aliases').value = '';
};
const click = () => el('generate').onclick();

const problems = [];
const check = (ok, message) => { if (!ok) problems.push(message); };

if (scenario === 'concurrent') {
  arm();
  digestMode = 'manual';
  const first = click(), second = click();
  // Both baseline invocations (or only the patched one) are now parked on fingerprint().
  // Resolve fingerprints in the same turn so continuations interleave before any analysis is stored.
  for (const resolve of pendingDigests.splice(0)) resolve();
  digestMode = 'auto';
  await Promise.all([first, second]);
  const concurrentPosts = postCount;
  if (DEBUG) console.error('after concurrent clicks: concurrentPosts=', concurrentPosts, 'notice=', el('notice').textContent, 'disabled=', el('generate').disabled);
  check(concurrentPosts === expectPosts, `concurrent triggers sent ${concurrentPosts} job POST(s), expected ${expectPosts}`);
  if (expectPosts === 1) {
    const sessionsBefore = sessionCount;
    arm();
    digestMode = 'manual';
    const next = click();
    for (const resolve of pendingDigests.splice(0)) resolve();
    digestMode = 'auto';
    await next;
    check(sessionCount === sessionsBefore + 1, 'lock was not released after a successful run');
  }
  console.log(JSON.stringify({ scenario, concurrentPosts, postCount, sessionCount, deleteCount, problems }));
  if (problems.length) { console.error('FAIL: ' + problems.join('; ')); process.exit(1); }
  console.log(`PASS: ${scenario} (concurrent posts=${concurrentPosts})`);
  process.exit(0);
} else if (scenario === 'failure-recovery') {
  arm();
  await click();
  check(el('generate').disabled === false, 'generate button stayed disabled after failure');
  arm();
  await click();
  check(postCount === expectPosts, `failure then retry sent ${postCount} POST(s), expected ${expectPosts}`);
} else if (scenario === 'cancel-recovery') {
  arm();
  const running = click();
  for (let i = 0; i < 200 && postCount === 0; i++) await new Promise(r => setTimeout(r, 10));
  check(postCount === 1, 'job was not created before cancel');
  await el('cancel').onclick();
  await running;
  check(postCount === 1, 'unexpected extra POST from the canceled run');
  arm();
  await click();
  check(postCount === expectPosts, `cancel then retry sent ${postCount} POST(s), expected ${expectPosts}`);
} else {
  throw new Error('unknown scenario: ' + scenario);
}

const out = { scenario, postCount, sessionCount, deleteCount, problems };
console.log(JSON.stringify(out));
if (problems.length) { console.error('FAIL: ' + problems.join('; ')); process.exit(1); }
console.log(`PASS: ${scenario} (posts=${postCount})`);
