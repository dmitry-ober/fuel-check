import { test } from 'node:test';
import assert from 'node:assert/strict';
import { headCross, trueCourse, gsFromWind } from '../calc.mjs';
const close = (a, b, eps = 0.1) => assert.ok(Math.abs(a - b) < eps, `${a} !~ ${b}`);

test('headCross: mockup — wind 270/45, course 265 true', () => {
  const { head, cross } = headCross(270, 45, 265);
  close(head, 44.8); close(cross, 3.9);
});
test('headCross: direct tailwind', () => {
  close(headCross(85, 30, 265).head, -30);
});
test('trueCourse applies easterly-positive mag var and wraps', () => {
  assert.equal(trueCourse(265, -22), 243);  // 22°W variation
  assert.equal(trueCourse(350, 15), 5);
});
test('gsFromWind: wind triangle and crosswind-too-large', () => {
  close(gsFromWind(183, 44.8, 3.9), 138.1);
  assert.equal(gsFromWind(100, 0, 100), null);
  assert.equal(gsFromWind(100, 0, 120), null);
});
