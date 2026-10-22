import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quickGS, buildSegments, computeFuel } from '../calc.mjs';
const close = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) < eps, `${a} !~ ${b}`);

test('quickGS applies signed component', () => {
  assert.equal(quickGS(183, -45), 138);
  assert.equal(quickGS(183, 5), 188);
});

test('buildSegments: no points → one segment at current GS', () => {
  const r = buildSegments(312, 148, []);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.segments, [{ from: 0, to: 312, gs: 148 }]);
});

test('buildSegments: mockup scenario', () => {
  const r = buildSegments(312, 148, [
    { dist: 50, gs: 138 }, { dist: 170, gs: 163 }, { dist: 250, gs: 188 }]);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.segments, [
    { from: 0, to: 50, gs: 148 }, { from: 50, to: 170, gs: 138 },
    { from: 170, to: 250, gs: 163 }, { from: 250, to: 312, gs: 188 }]);
});

test('buildSegments flags out-of-order, beyond-dest, nonpositive GS', () => {
  assert.deepEqual(buildSegments(312, 148, [{ dist: 170, gs: 140 }, { dist: 50, gs: 140 }]).errors,
    [{ index: 1, code: 'OUT_OF_ORDER' }]);
  assert.deepEqual(buildSegments(312, 148, [{ dist: 312, gs: 140 }]).errors,
    [{ index: 0, code: 'BEYOND_DEST' }]);
  assert.deepEqual(buildSegments(312, 148, [{ dist: 50, gs: 0 }]).errors,
    [{ index: 0, code: 'NONPOSITIVE_GS' }]);
  assert.deepEqual(buildSegments(312, 148, [{ dist: 50, gs: null }]).errors,
    [{ index: 0, code: 'NONPOSITIVE_GS' }]);
  assert.equal(buildSegments(312, 148, [{ dist: 50, gs: 0 }]).segments.length, 0);
});

test('computeFuel: mockup scenario end to end', () => {
  const { segments } = buildSegments(312, 148, [
    { dist: 50, gs: 138 }, { dist: 170, gs: 163 }, { dist: 250, gs: 188 }]);
  const f = computeFuel(segments, 17.8, 52);
  close(f.eteHours, 2.028);
  close(f.fuelUsed, 36.10);
  close(f.fod, 15.90);
  close(f.reserveGal, 13.35);
  close(f.reserveMin, 53.6, 0.1);
  assert.equal(f.belowReserve, false);
});

test('computeFuel flags below reserve', () => {
  const f = computeFuel([{ from: 0, to: 312, gs: 130 }], 17.8, 38);
  assert.equal(f.belowReserve, true);
});
