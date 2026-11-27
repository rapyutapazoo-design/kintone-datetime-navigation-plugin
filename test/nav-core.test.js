'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Core = require('../src/js/nav-core.js');

// 変更前 desktop.js の getQuery を再現
function legacyGetQuery(targetFieldCode, currentDatetime, currentId, isNext) {
  var op1 = isNext ? '>' : '<';
  var op2 = isNext ? 'asc' : 'desc';
  return '(' + targetFieldCode + ' ' + op1 + ' "' + currentDatetime + '") or (' + targetFieldCode + ' = "' + currentDatetime + '" and $id ' + op1 + ' ' + currentId + ') order by ' + targetFieldCode + ' ' + op2 + ', $id ' + op2 + ' limit 1';
}

test('filters 空のとき legacy getQuery と完全一致', () => {
  for (const dt of ['2026-11-27T01:00:00Z', '2026-11-27']) {
    for (const isNext of [true, false]) {
      for (const filters of [undefined, null, [], [null], ['']]) {
        const opts = { targetFieldCode: 'start_time', currentDatetime: dt, currentId: 123, isNext, filters };
        if (filters === undefined) delete opts.filters;
        assert.equal(Core.buildNavQuery(opts), legacyGetQuery('start_time', dt, 123, isNext));
      }
    }
  }
});

test('filters 2件の期待クエリ', () => {
  const filters = [
    'facility in ("ゲストルーム（時間利用）", "ゲストルーム（宿泊）")',
    'ステータス not in ("キャンセル済み")'
  ];
  const base = { targetFieldCode: 'start_time', currentDatetime: '2026-11-27T01:00:00Z', currentId: 123, filters };
  assert.equal(Core.buildNavQuery(Object.assign({ isNext: true }, base)),
    '(facility in ("ゲストルーム（時間利用）", "ゲストルーム（宿泊）")) and (ステータス not in ("キャンセル済み")) and ((start_time > "2026-11-27T01:00:00Z") or (start_time = "2026-11-27T01:00:00Z" and $id > 123)) order by start_time asc, $id asc limit 1');
  assert.equal(Core.buildNavQuery(Object.assign({ isNext: false }, base)),
    '(facility in ("ゲストルーム（時間利用）", "ゲストルーム（宿泊）")) and (ステータス not in ("キャンセル済み")) and ((start_time < "2026-11-27T01:00:00Z") or (start_time = "2026-11-27T01:00:00Z" and $id < 123)) order by start_time desc, $id desc limit 1');
});

test('エスケープ順', () => {
  assert.equal(Core.escapeQueryValue('a"b'), 'a\\"b');
  assert.equal(Core.escapeQueryValue('a\\b'), 'a\\\\b');
  assert.equal(Core.escapeQueryValue('a\\"b'), 'a\\\\\\"b');
  assert.equal(Core.escapeQueryValue(null), '');
  assert.equal(Core.escapeQueryValue(undefined), '');
  assert.equal(Core.escapeQueryValue(12), '12');
});

test('getSameGroupMembers', () => {
  const groups = [['A', 'B'], ['C', 'D']];
  assert.deepEqual(Core.getSameGroupMembers('', groups), []);
  assert.deepEqual(Core.getSameGroupMembers(null, groups), []);
  assert.deepEqual(Core.getSameGroupMembers(5, groups), []);
  assert.deepEqual(Core.getSameGroupMembers('X', groups), ['X']);
  assert.deepEqual(Core.getSameGroupMembers('A', groups), ['A', 'B']);
  assert.notEqual(Core.getSameGroupMembers('A', groups), groups[0]);
});

test('parseGroupsText', () => {
  let r = Core.parseGroupsText('A，B\n\nC、D,E\nsolo\n  \nF, G');
  assert.deepEqual(r.groups, [['A', 'B'], ['C', 'D', 'E'], ['F', 'G']]);
  assert.deepEqual(r.errors, []);
  r = Core.parseGroupsText('A,B\nB,C');
  assert.deepEqual(r.errors, ['「B」が複数のグループに含まれています']);
  r = Core.parseGroupsText('A,A,B');
  assert.deepEqual(r.groups, [['A', 'B']]);
  assert.deepEqual(r.errors, []);
  r = Core.parseGroupsText('A,A');
  assert.deepEqual(r.groups, []);
  assert.deepEqual(Core.parseGroupsText('').groups, []);
  const g = [['A', 'B'], ['C', 'D', 'E']];
  assert.deepEqual(Core.parseGroupsText(Core.groupsToText(g)).groups, g);
  assert.equal(Core.groupsToText(g), 'A,B\nC,D,E');
});

test('parseJsonArray', () => {
  assert.deepEqual(Core.parseJsonArray('["a","b"]'), ['a', 'b']);
  assert.deepEqual(Core.parseJsonArray(['x']), ['x']);
  assert.deepEqual(Core.parseJsonArray(''), []);
  assert.deepEqual(Core.parseJsonArray(null), []);
  assert.deepEqual(Core.parseJsonArray(undefined), []);
  assert.deepEqual(Core.parseJsonArray('{"a":1}'), []);
  const orig = console.warn;
  let warned = 0;
  console.warn = () => { warned++; };
  try {
    assert.deepEqual(Core.parseJsonArray('{broken'), []);
    assert.equal(warned, 1);
    Core.parseJsonArray('');
    Core.parseJsonArray(null);
    assert.equal(warned, 1);
  } finally { console.warn = orig; }
});

test('buildInCondition', () => {
  assert.equal(Core.buildInCondition('f', [], false), null);
  assert.equal(Core.buildInCondition('f', null, false), null);
  assert.equal(Core.buildInCondition('f', 'x', false), null);
  assert.equal(Core.buildInCondition('f', ['a', 'b'], false), 'f in ("a", "b")');
  assert.equal(Core.buildInCondition('f', ['a'], true), 'f not in ("a")');
  assert.equal(Core.buildInCondition('f', ['a"b', 'c\\d'], false), 'f in ("a\\"b", "c\\\\d")');
});

test('buildNotFoundMessage', () => {
  assert.equal(Core.buildNotFoundMessage(true, []), 'これ以上新しいレコードはありません。');
  assert.equal(Core.buildNotFoundMessage(false, null), 'これ以上古いレコードはありません。');
  assert.equal(Core.buildNotFoundMessage(true, ['ピアノ室']), '同一施設（ピアノ室）でこれ以上新しいレコードはありません。');
  assert.equal(Core.buildNotFoundMessage(false, ['ピアノ室']), '同一施設（ピアノ室）でこれ以上古いレコードはありません。');
  assert.equal(Core.buildNotFoundMessage(true, ['A', 'B']), '同一施設（A・B）でこれ以上新しいレコードはありません。');
  assert.equal(Core.buildNotFoundMessage(false, ['A', 'B']), '同一施設（A・B）でこれ以上古いレコードはありません。');
});

test('readToggle / writeToggle', () => {
  const throwing = {
    getItem() { throw new Error('denied'); },
    setItem() { throw new Error('denied'); }
  };
  assert.equal(Core.readToggle(throwing, 'k', false), false);
  assert.equal(Core.readToggle(throwing, 'k', true), true);
  assert.equal(Core.readToggle(null, 'k', false), false);
  assert.equal(Core.writeToggle(throwing, 'k', true), false);
  assert.equal(Core.writeToggle(null, 'k', true), false);
  const data = {};
  const mem = {
    getItem(k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
    setItem(k, v) { data[k] = String(v); }
  };
  assert.equal(Core.readToggle(mem, 'k', false), false);
  assert.equal(Core.writeToggle(mem, 'k', true), true);
  assert.equal(data.k, '1');
  assert.equal(Core.readToggle(mem, 'k', false), true);
  Core.writeToggle(mem, 'k', false);
  assert.equal(data.k, '0');
  assert.equal(Core.readToggle(mem, 'k', true), false);
  data.k = 'zzz';
  assert.equal(Core.readToggle(mem, 'k', true), true);
});

test('currentId が不正なら null', () => {
  for (const id of ['abc', NaN, undefined, null, '', 1.5]) {
    assert.equal(Core.buildNavQuery({ targetFieldCode: 't', currentDatetime: 'd', currentId: id, isNext: true }), null);
  }
  assert.notEqual(Core.buildNavQuery({ targetFieldCode: 't', currentDatetime: 'd', currentId: '7', isNext: true }), null);
});

test('nav-core.js は ES5 構文のみ', () => {
  const src = fs.readFileSync(path.join(__dirname, '../src/js/nav-core.js'), 'utf8');
  assert.ok(!/=>/.test(src), 'arrow function');
  assert.ok(!/\b(let|const)\s/.test(src), 'let/const');
  assert.ok(!/`/.test(src), 'template literal');
});

test('buildFilters の分岐', () => {
  const groups = [['A', 'B'], ['C', 'D']];
  const base = {
    facilityFieldCode: 'facility', facilityGroups: groups,
    excludeFieldCode: 'status', excludeValues: ['キャンセル済み'],
    hasFacility: true, currentFacility: 'A',
    record: { facility: { value: 'A' }, status: { value: 'x' } }
  };
  const run = (o) => Core.buildFilters(Object.assign({}, base, o));

  // トグル OFF: 除外のみ
  let r = run({ sameFacilityOnly: false });
  assert.deepEqual(r.filters, ['status not in ("キャンセル済み")']);
  assert.deepEqual(r.scopeMembers, []);

  // トグル ON: 施設 + 除外
  r = run({ sameFacilityOnly: true });
  assert.deepEqual(r.filters, ['facility in ("A", "B")', 'status not in ("キャンセル済み")']);
  assert.deepEqual(r.scopeMembers, ['A', 'B']);

  // グループ外の施設は自身のみ
  r = run({ sameFacilityOnly: true, currentFacility: 'Z' });
  assert.equal(r.filters[0], 'facility in ("Z")');

  // 施設が空: ON でも施設条件なし
  r = run({ sameFacilityOnly: true, currentFacility: '' });
  assert.deepEqual(r.filters, ['status not in ("キャンセル済み")']);
  r = run({ sameFacilityOnly: true, hasFacility: false });
  assert.deepEqual(r.scopeMembers, []);

  // 除外フィールドがレコードに無い: 除外せず警告のみ
  const origWarn = console.warn;
  console.warn = () => {};
  try {
    r = run({ sameFacilityOnly: false, record: { facility: { value: 'A' } } });
  } finally {
    console.warn = origWarn;
  }
  assert.deepEqual(r.filters, []);

  // すべて未設定
  r = Core.buildFilters({ sameFacilityOnly: false, hasFacility: false, currentFacility: '', facilityFieldCode: '', facilityGroups: [], excludeFieldCode: '', excludeValues: [], record: {} });
  assert.deepEqual(r.filters, []);
});
