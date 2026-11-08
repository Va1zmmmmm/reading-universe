import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalize, publicProject, publicExploration, buildViews} from '../web/core.mjs';
import {createShareGate} from '../web/share-operation.mjs';

const HIDDEN_TITLE = '虚构旧城';
const HIDDEN_AUTHOR = '虚构隐藏作者';
const PRIVATE_MARKER = 'FICT-PRIVATE-NOTE-A1';

function collisionProject() {
  const project = {
    format: 'reading-universe-private', version: 1,
    books: [
      {
        id: 'collide-selected', title: '虚构旧城记', author: '虚构作者甲',
        evidence: [{id: 'collide-e1', text: `虚构材料：${PRIVATE_MARKER}`, kind: 'note', included: true}],
      },
      {
        id: 'safe-book', title: '虚构安全书', author: '虚构作者乙',
        evidence: [{id: 'safe-e1', text: '虚构安全材料', kind: 'note', included: true}],
      },
      {id: 'collide-hidden', title: HIDDEN_TITLE, author: HIDDEN_AUTHOR, included: false},
    ],
    analysis: {
      'collide-selected': {tags: [HIDDEN_TITLE], summary: PRIVATE_MARKER, evidenceIds: ['collide-e1'], basis: 'evidence', fingerprint: PRIVATE_MARKER},
      'safe-book': {tags: ['虚构安全主题'], summary: '', evidenceIds: ['safe-e1'], basis: 'evidence', fingerprint: ''},
    },
    links: [{source: 'collide-selected', target: 'safe-book', targetType: 'book', type: 'contrast', reason: PRIVATE_MARKER, evidenceIds: ['collide-e1'], basis: 'evidence'}],
  };
  return normalize(project);
}

function explorationProject() {
  const project = collisionProject();
  project.exploration = {version: 1, themes: [{
    id: 'collide-trail', basis: 'curated', name: '虚构碰撞主题', title: '虚构碰撞问题',
    opening: '虚构开场。', entry: '虚构入口。', start: 'n0', endTitle: '虚构停留标题', endBody: '虚构停留说明。',
    nodes: [{
      id: 'n0', title: '虚构线索', subtitle: '虚构副题', context: '虚构语境。', observation: '虚构观察。',
      quote: {bookId: 'collide-selected', evidenceId: 'collide-e1', excerpt: '虚构材料'}, choices: [],
    }],
  }]};
  project.journey = {activeTheme: 'collide-trail', sessions: []};
  return normalize(project);
}

const permissions = () => [{id: 'collide-trail', introduction: true, nodes: [{id: 'n0', interpretation: true}]}];

test('collision rejects the whole public export without leaking hidden titles or mutating the project', () => {
  for (const [label, selected] of [['只选碰撞书', ['collide-selected']], ['混合选择', ['collide-selected', 'safe-book']]]) {
    const project = collisionProject();
    const snapshot = JSON.stringify(project);
    assert.throws(() => publicProject(project, selected), error => {
      assert.equal(error.code, 'PUBLIC_TITLE_CONFLICT', label);
      assert.match(error.message, /书名冲突/, label);
      assert.ok(!error.message.includes(HIDDEN_TITLE), `${label}：不得泄露隐藏书名`);
      assert.ok(!error.message.includes(HIDDEN_AUTHOR), `${label}：不得泄露隐藏作者`);
      assert.ok(!error.message.includes(PRIVATE_MARKER), `${label}：不得泄露私人内容`);
      assert.ok(!/未选择|没有选择/.test(error.message), `${label}：不得误称用户未选择`);
      return true;
    }, `${label}应阻止整次公开`);
    assert.equal(JSON.stringify(project), snapshot, `${label}：失败不得修改输入项目`);
  }
});

test('non-colliding selection exports only selected books with consistent analysis and links', () => {
  const project = collisionProject();
  const out = publicProject(project, ['safe-book'], {relations: true});
  assert.deepEqual(out.project.books.map(book => book.id), ['safe-book']);
  assert.deepEqual(Object.keys(out.project.analysis), ['safe-book']);
  assert.equal(out.project.analysis['safe-book'].summary, '');
  assert.deepEqual(out.project.analysis['safe-book'].evidenceIds, []);
  for (const link of out.project.links) {
    assert.ok(['safe-book'].includes(link.source) && ['safe-book'].includes(link.target));
  }
  const serialized = JSON.stringify({project: out.project, views: buildViews(out.project)});
  for (const token of [HIDDEN_TITLE, HIDDEN_AUTHOR, PRIVATE_MARKER]) assert.ok(!serialized.includes(token), token);
});

test('share operation gate invalidates older work on a newer operation or a selection change', () => {
  const gate = createShareGate();
  const first = gate.begin();
  const second = gate.begin();
  assert.equal(gate.isCurrent(first), false, 'a newer operation must invalidate the older one');
  assert.equal(gate.isCurrent(second), true);
  assert.equal(gate.invalidatedBy, 'operation');
  gate.invalidate('selection');
  assert.equal(gate.invalidatedBy, 'selection');
  assert.equal(gate.isCurrent(second), false, 'a selection/failure change must invalidate the current operation');
  const third = gate.begin();
  assert.equal(gate.isCurrent(third), true);
  assert.equal(gate.isCurrent(second), false);
});

test('public exploration rejects a collision with the explicit title-conflict error instead of a misleading book-scope error', () => {
  const project = explorationProject();
  const snapshot = JSON.stringify(project);
  assert.throws(() => publicExploration(project, ['collide-selected'], permissions()), error => {
    assert.equal(error.code, 'PUBLIC_TITLE_CONFLICT');
    assert.match(error.message, /书名冲突/);
    assert.ok(!error.message.includes('尚未纳入公开书目'), '不得保留旧误导文案');
    assert.ok(!error.message.includes(HIDDEN_TITLE));
    return true;
  });
  assert.equal(JSON.stringify(project), snapshot);

  const safeProject = normalize({
    format: 'reading-universe-private', version: 1,
    books: [{id: 'safe-book', title: '虚构安全书', evidence: [{id: 'safe-e1', text: '虚构安全材料', kind: 'note', included: true}]}],
    exploration: {version: 1, themes: [{
      id: 'safe-trail', basis: 'curated', name: '虚构安全主题', title: '虚构安全问题',
      opening: '虚构开场。', entry: '虚构入口。', start: 's0', endTitle: '虚构停留标题', endBody: '虚构停留说明。',
      nodes: [{
        id: 's0', title: '虚构线索', subtitle: '虚构副题', context: '虚构语境。', observation: '虚构观察。',
        quote: {bookId: 'safe-book', evidenceId: 'safe-e1', excerpt: '虚构安全材料'}, choices: [],
      }],
    }]},
    journey: {activeTheme: 'safe-trail', sessions: []},
  });
  const atlas = publicExploration(safeProject, ['safe-book'], [{id: 'safe-trail', introduction: true, nodes: [{id: 's0', interpretation: true}]}]);
  assert.deepEqual(atlas.books.map(book => book.id), ['safe-book']);
  assert.equal(atlas.themes.length, 1);
});
