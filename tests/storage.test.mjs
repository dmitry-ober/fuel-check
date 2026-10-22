import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadPersisted, savePersisted } from '../storage.mjs';

const fakeStore = () => {
  const m = new Map();
  return { m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
};
const DEFAULTS = { ff: '17.8', tas: '', magVar: '' };

test('defaults when store is empty', () => {
  assert.deepEqual(loadPersisted(fakeStore()), DEFAULTS);
});

test('round-trips ff/tas/magVar and touches only those keys', () => {
  const s = fakeStore();
  savePersisted(s, { ff: '18.5', tas: '170', magVar: '-2' });
  assert.deepEqual(loadPersisted(s), { ff: '18.5', tas: '170', magVar: '-2' });
  assert.equal(s.m.size, 3);
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
