// Synthetic regression: universe view empty state and small all-comet libraries.
// Usage: node test-universe-empty.mjs <srcDir> <patched|reject>
// patched = fixed code must not throw; normal and multi-tag rendering still draw.
// reject  = baseline code must throw TypeError for the empty / all-comet cases.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { pathToFileURL } from 'node:url';

const srcDir = path.resolve(process.argv[2]);
const mode = process.argv[3] || 'patched';
const core = await import(pathToFileURL(path.join(srcDir, 'core.mjs')).href);
const code = fs.readFileSync(path.join(srcDir, 'universe.js'), 'utf8');

function makeBooks(count, tags) {
  return Array.from({ length: count }, (_, i) => ({
    id: 'b' + (i + 1), title: '合成书' + (i + 1), author: '合成作者',
    included: true, cover: '', tags: [...tags], readingTime: 3600 + i * 600,
    notes: i, finished: false, finishTime: '', rating: '', evidence: [],
  }));
}

const cases = {
  empty: core.emptyProject(),
  oneAllComet: { ...core.emptyProject(), books: makeBooks(1, ['A', 'B']) },
  twoAllComet: { ...core.emptyProject(), books: makeBooks(2, ['A', 'B']) },
  sixMultiTag: { ...core.emptyProject(), books: makeBooks(6, ['A', 'B']) },
};

function run(universeData, width = 800, height = 600) {
  let draws = 0, raf = 0;
  const images = [];
  const gradient = { addColorStop() {} };
  const ctx = new Proxy({}, {
    get(target, prop) {
      if (prop === 'createRadialGradient' || prop === 'createLinearGradient') return () => gradient;
      if (prop === 'drawImage') return (...args) => { draws++; images.push(args); };
      if (typeof target[prop] !== 'undefined') return target[prop];
      return () => {};
    },
    set(target, prop, value) { target[prop] = value; return true; },
  });
  const canvas = {
    clientWidth: width, clientHeight: height, width: 0, height: 0, style: {},
    getContext: () => ctx, addEventListener() {},
  };
  const statsEl = { textContent: '' };
  const elements = {
    ucv: canvas,
    utip: { style: {}, textContent: '' },
    usearch: { addEventListener() {} },
    ustats: statsEl,
  };
  const documentStub = {
    getElementById: id => elements[id] ?? (elements[id] = { style: {}, textContent: '', addEventListener() {} }),
    createElement: () => ({ width: 0, height: 0, getContext: () => ctx }),
    addEventListener() {},
    documentElement: {},
  };
  const sandbox = {
    window: { UNIVERSE: universeData, devicePixelRatio: 1, addEventListener() {} },
    document: documentStub,
    location: { search: '' },
    performance: { now: () => 0 },
    requestAnimationFrame: fn => { raf++; return raf; },
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    console,
  };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: 'universe.js' });
  let error = null;
  try { sandbox.initUniverse({ onBook() {}, onTheme() {}, onClose() {} }); } catch (e) { error = e; }
  const visible = images.filter(([, x, y, w, h]) => {
    const cx = x + w / 2, cy = y + h / 2;
    return Number.isFinite(cx) && Number.isFinite(cy) && cx >= 0 && cx <= width && cy >= 0 && cy <= height;
  });
  return { error, draws, raf, images, visible, stats: statsEl.textContent };
}

if (mode === 'reject') {
  const results = {};
  for (const [name, project] of Object.entries(cases)) {
    const U = core.buildViews(project).universe;
    const result = run(U);
    results[name] = { threw: !!result.error, message: result.error?.message || '', books: U.books.length, draws: result.draws, stats: result.stats };
  }
  console.log(JSON.stringify({ mode, results }));
  const expectedThrow = ['empty', 'oneAllComet', 'twoAllComet'].every(name => results[name].threw);
  if (!expectedThrow) { console.error('EXPECTED BASELINE TypeError BUT ONE CASE DID NOT THROW'); process.exit(1); }
  console.log('REPRO: baseline throws TypeError for empty / all-comet universe data');
  process.exit(0);
}

const problems = [];
const check = (ok, message) => { if (!ok) problems.push(message); };
const out = {};
for (const [name, project] of Object.entries(cases)) {
  const U = core.buildViews(project).universe;
  const result = run(U);
  const mobile = run(U, 390, 844);
  out[name] = { threw: !!result.error, message: result.error?.message || '', draws: result.draws, images: result.images.length, visible: result.visible.length, mobileVisible: mobile.visible.length, stats: result.stats };
  check(!result.error, `${name} threw: ${result.error?.message || ''}`);
  check(!mobile.error, `${name} threw on mobile viewport: ${mobile.error?.message || ''}`);
}
check(/暂无/.test(out.empty.stats), 'empty universe did not show the empty-state message');
check(out.empty.images === 0, 'empty universe should not draw sprites');
check(out.oneAllComet.draws > 0, 'all-comet small library did not draw anything');
check(out.oneAllComet.visible > 0, 'all-comet initial viewport contains no visible sprite');
check(out.oneAllComet.mobileVisible > 0, 'all-comet mobile viewport contains no visible sprite');
check(/1 颗星/.test(out.oneAllComet.stats), 'all-comet small library stats were not rendered');
check(out.twoAllComet.visible >= 2, 'two-comet initial viewport does not show both comets');
check(out.twoAllComet.mobileVisible >= 2, 'two-comet mobile viewport does not show both comets');
check(/2 颗星/.test(out.twoAllComet.stats), 'two-comet stats were not rendered');
check(/6 颗星/.test(out.sixMultiTag.stats), 'normal six-book view stats degraded');
check(/3 颗彗星/.test(out.sixMultiTag.stats), 'multi-tag comet display degraded');
check(out.sixMultiTag.visible > 0, 'normal six-book view has no visible sprite');
check(out.sixMultiTag.mobileVisible > 0, 'normal six-book mobile view has no visible sprite');
console.log(JSON.stringify({ mode, out, problems }));
if (problems.length) { console.error('FAIL: ' + problems.join('; ')); process.exit(1); }
console.log('PASS: empty state handled; normal and multi-tag views still draw');
