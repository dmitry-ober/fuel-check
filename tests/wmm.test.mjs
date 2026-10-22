import { test } from 'node:test';
import assert from 'node:assert/strict';
import { declination, toDecimalYear } from '../wmm.mjs';

// Official WMM2025 test values (NOAA/NCEI, WMM2025_TEST_VALUES.txt):
// [decimal year, height km, lat deg, lon deg, expected declination deg]
const OFFICIAL = [
  [2025.0, 0, 80, 0, 1.28],
  [2025.0, 0, 0, 120, -0.16],
  [2025.0, 0, -80, 240, 68.78],
  [2025.0, 100, 80, 0, 0.85],
  [2025.0, 100, 0, 120, -0.15],
  [2025.0, 100, -80, 240, 68.21],
  [2027.5, 0, 80, 0, 2.59],
  [2027.5, 0, 0, 120, -0.24],
  [2027.5, 0, -80, 240, 68.49],
  [2027.5, 100, 80, 0, 2.16],
  [2027.5, 100, 0, 120, -0.23],
  [2027.5, 100, -80, 240, 67.93],
];

test('declination matches all official WMM2025 test values within 0.01°', () => {
  for (const [yr, h, lat, lon, expected] of OFFICIAL) {
    const got = declination(lat, lon, h, yr);
    assert.ok(Math.abs(got - expected) <= 0.011,
      `lat ${lat} lon ${lon} h ${h} t ${yr}: got ${got.toFixed(3)}, expected ${expected}`);
  }
});

test('longitude is equivalent mod 360 (GPS gives −120 for 240E)', () => {
  const a = declination(-80, 240, 0, 2025.0);
  const b = declination(-80, -120, 0, 2025.0);
  assert.ok(Math.abs(a - b) < 1e-9);
});

test('time is clamped to the model validity window', () => {
  assert.equal(declination(80, 0, 0, 2024.0), declination(80, 0, 0, 2025.0));
  assert.equal(declination(80, 0, 0, 2031.0), declination(80, 0, 0, 2030.0));
});

test('toDecimalYear', () => {
  assert.equal(toDecimalYear(new Date(Date.UTC(2026, 0, 1))), 2026);
  const mid = toDecimalYear(new Date(Date.UTC(2026, 6, 2, 12)));
  assert.ok(mid > 2026.49 && mid < 2026.51, String(mid));
});
