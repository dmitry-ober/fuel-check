import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadPersisted, savePersisted, loadProcs, saveProcs } from '../storage.mjs';

const fakeStore = () => {
  const m = new Map();
  return { m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
};
const DEFAULTS = { ff: '17.8', tas: '', magVar: '', descRate: '500', descFF: '18', apprFF: '20' };

test('defaults when store is empty', () => {
  assert.deepEqual(loadPersisted(fakeStore()), DEFAULTS);
});

test('round-trips settings and touches only those keys', () => {
  const s = fakeStore();
  const vals = { ff: '18.5', tas: '170', magVar: '-2', descRate: '700', descFF: '19', apprFF: '21' };
  savePersisted(s, vals);
  assert.deepEqual(loadPersisted(s), vals);
  assert.equal(s.m.size, 6);
});

test('throwing store yields defaults and does not throw', () => {
  const bad = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } };
  assert.doesNotThrow(() => savePersisted(bad, { ff: '1', tas: '2', magVar: '3' }));
  assert.deepEqual(loadPersisted(bad), DEFAULTS);
});

test('null store yields defaults', () => {
  assert.deepEqual(loadPersisted(null), DEFAULTS);
  assert.doesNotThrow(() => savePersisted(null, DEFAULTS));
});

test('procs: empty store gives empty list', () => {
  assert.deepEqual(loadProcs(fakeStore()), []);
  assert.deepEqual(loadProcs(null), []);
});

test('procs: round-trip and sanitization', () => {
  const s = fakeStore();
  saveProcs(s, [{ apt: 'FACT', name: 'ILS 01 vectors S', min: 13, note: 'from north' }]);
  assert.deepEqual(loadProcs(s), [{ apt: 'FACT', name: 'ILS 01 vectors S', min: 13, note: 'from north' }]);
  s.m.set('fc.procs', JSON.stringify([{ apt: 'FACT', name: 'ok', min: 5 }, { apt: 1, name: 'bad', min: 5 }, { apt: 'FALA', name: 'no-min', min: 'x' }]));
  assert.deepEqual(loadProcs(s), [{ apt: 'FACT', name: 'ok', min: 5, note: '' }]);
  s.m.set('fc.procs', 'not json');
  assert.deepEqual(loadProcs(s), []);
});
