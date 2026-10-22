import test from 'node:test';
import assert from 'node:assert/strict';
import { num, gpsSpeedToKt, formatEte, buildViewModel } from '../ui-model.mjs';

const quick = (over = {}) => ({
  fob: 52, ff: 17.8, dist: 312, gs: 148, tas: 183, garminFod: null,
  mode: 'quick', courseMag: null, magVar: null,
  points: [{ dist: 50, comp: -45 }, { dist: 170, comp: -20 }, { dist: 250, comp: 5 }],
  ...over,
});

test('num', () => {
  assert.equal(num(''), null);
  assert.equal(num('17.8'), 17.8);
  assert.equal(num('-45'), -45);
  assert.equal(num('abc'), null);
  assert.equal(num('52,5'), 52.5);
  assert.equal(num('17,8'), 17.8);
  assert.equal(num(',5'), 0.5);
});

test('zero / negative inputs are incomplete, never ok', () => {
  for (const over of [{ ff: 0 }, { ff: -17.8 }, { gs: 0 }, { tas: 0 }, { dist: 0 }, { dist: -50 }]) {
    const vm = buildViewModel(quick(over));
    assert.equal(vm.status, 'incomplete', JSON.stringify(over));
    assert.ok(vm.missing.includes(Object.keys(over)[0]));
    assert.equal(vm.fodText, undefined);
  }
});

test('precise with zero points does not require course', () => {
  const vm = buildViewModel(quick({ mode: 'precise', points: [] }));
  assert.equal(vm.status, 'ok');
  const vm2 = buildViewModel(quick({ mode: 'precise', points: [{ dist: 50, windDir: 90, windSpeed: 10 }] }));
  assert.equal(vm2.status, 'incomplete');
  assert.ok(vm2.missing.includes('courseMag'));
});

test('gpsSpeedToKt', () => {
  assert.equal(gpsSpeedToKt(null), null);
  assert.equal(gpsSpeedToKt(-1), null);
  assert.equal(gpsSpeedToKt(NaN), null);
  assert.equal(gpsSpeedToKt(76.1), 148);
  assert.equal(gpsSpeedToKt(0), 0); // the >=1 kt floor lives in app.mjs
});

test('formatEte', () => {
  assert.equal(formatEte(2.028), '2:02');
  assert.equal(formatEte(0.983), '0:59');
});

test('quick mode ok', () => {
  const vm = buildViewModel(quick());
  assert.equal(vm.status, 'ok');
  assert.equal(vm.fodText, '15.9 gal');
  assert.equal(vm.eteText, '2:02');
  assert.equal(vm.belowReserve, false);
  assert.equal(vm.explainers.length, 4);
  assert.equal(vm.explainers[0], '↓ 0–50 nm: current GS 148 kt');
  assert.equal(vm.explainers[1], '↓ 50–170 nm: headwind 45 kt → GS 138 kt');
  assert.equal(vm.deltaText, null);
});

test('garmin delta', () => {
  const vm = buildViewModel(quick({ garminFod: 18.2 }));
  assert.equal(vm.deltaText, 'Garmin 18.2 gal · Δ −2.3 gal');
});

test('incomplete', () => {
  const vm = buildViewModel(quick({ fob: null }));
  assert.equal(vm.status, 'incomplete');
  assert.ok(vm.missing.includes('fob'));
});

test('incomplete point', () => {
  const vm = buildViewModel(quick({ points: [{ dist: 50, comp: null }] }));
  assert.equal(vm.status, 'error');
  assert.deepEqual(vm.pointErrors, [{ index: 0, code: 'INCOMPLETE' }]);
});

const precise = (over = {}) => ({
  ...quick(), mode: 'precise', courseMag: 265, magVar: 0,
  points: [{ dist: 50, windDir: 270, windSpeed: 45 }], ...over,
});

test('precise mode', () => {
  const vm = buildViewModel(precise());
  assert.equal(vm.status, 'ok');
  assert.equal(vm.pointComps[0], -45);
  assert.match(vm.explainers[1], /138 kt/);
});

test('crosswind > TAS', () => {
  const vm = buildViewModel(precise({ points: [{ dist: 50, windDir: 175, windSpeed: 200 }] }));
  assert.equal(vm.status, 'error');
  assert.equal(vm.pointErrors[0].code, 'CROSSWIND_GT_TAS');
});

test('below reserve', () => {
  const vm = buildViewModel(quick({ fob: 38, points: [{ dist: 50, comp: -100 }] }));
  assert.equal(vm.status, 'ok');
  assert.equal(vm.belowReserve, true);
});

test('formatUtcHM and etaUtc', async () => {
  const { formatUtcHM, etaUtc } = await import('../ui-model.mjs');
  const now = new Date(Date.UTC(2026, 9, 22, 14, 32, 10));
  assert.equal(formatUtcHM(now), '14:32');
  assert.equal(etaUtc(2.028, now), '16:34Z');       // +2:02 → 16:34Z (121.68 min)
  assert.equal(etaUtc(10, now), '00:32Z');          // wraps past midnight
});

test('buildViewModel returns etaText when now is provided, null otherwise', () => {
  const base = { fob: 52, ff: 17.8, dist: 312, gs: 148, tas: 183, garminFod: null, mode: 'quick', courseMag: null, magVar: null, points: [] };
  const withNow = buildViewModel({ ...base, now: new Date(Date.UTC(2026, 9, 22, 14, 0, 0)) });
  assert.equal(withNow.status, 'ok');
  assert.equal(withNow.etaText, '16:06Z'); // 14:00Z + 312/148 h = 16:06:29Z → 16:06Z
  assert.equal(buildViewModel(base).etaText, null);
});
