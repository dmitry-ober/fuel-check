# Fuel Check (SR22T) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An offline-capable PWA that cross-checks the Garmin "Fuel On Destination" figure for a Cirrus SR22T using pilot-entered fuel, distance, TAS, GPS ground speed, and numbered wind points ahead on the route.

**Architecture:** Static site, no build step, no dependencies. Pure calculation and view-model logic live in ES modules tested with Node's built-in `node:test`; a thin `app.mjs` wires them to the DOM, GPS and localStorage. Service worker + manifest make it installable and offline. Deployed to GitHub Pages.

**Tech Stack:** Vanilla HTML/CSS/JS (ES modules), `node:test` (Node ≥ 18), GitHub Pages via `gh` CLI.

**Spec:** `docs/superpowers/specs/2026-10-22-fuel-check-design.md` (read it first; the approved mockups it references are in `.superpowers/brainstorm/24144-1792657707/content/` — `main-layout-v2.html` supersedes v1 for wind points).

## Global Constraints

- UI copy is **English only**. Conversation language is irrelevant to the product.
- Units fixed: US gal, gph, kt, nm, degrees. No unit switching.
- **No runtime network access**: no CDNs, no fonts, no fetches except the service worker caching the app's own files.
- No npm dependencies; tests use `node:test` + `node:assert/strict` only.
- Persist across launches **only**: fuel flow, TAS, mag var (localStorage, every access wrapped in try/catch). FOB, distance, wind points, Garmin FOD, Course are cleared every launch (i.e., never persisted).
- Dark cockpit theme per mockups: background `#0b0f14`, panels `#121a23`, borders `#263340`, text `#e8edf2`, muted `#7b8fa3`, green `#5fc08a`, headwind orange `#ff9f6e`, red `#ff6b6b`; `font-variant-numeric: tabular-nums` on all values; touch targets ≥ 44px.
- Sign conventions (used everywhere): quick wind component is signed, **negative = headwind**, `gs = tas + comp`. Precise: `head` positive = headwind. Mag var signed, **positive = East**, `courseTrue = courseMag + magVar`; wind directions are entered true, course magnetic.
- Reserve threshold = `ff × 0.75` gal (45 min). Result red strictly below it.
- A small static footer line in the UI: `Cross-check only — fly the Garmin.`

## Review Focus

Spec-implied failure modes no task's tests covered on first draft; each now has its pinning test in the owning task:

1. iOS Safari reports `coords.speed` as `null` or `-1` when stationary/weak fix → GS field must not show NaN or 0-overwrite; stays at last/manual value. (Task 3, `gpsSpeedToKt` tests; Task 6 wiring.)
2. Half-typed state while entering numbers (empty FOB, partial wind point) → result panel shows a neutral "Enter …" state, never NaN or a stale confident number. (Task 3 view-model tests.)
3. Wind point at/beyond destination distance, or out of order → inline flag on that point, no result computed. (Task 1 `buildSegments` tests; Task 5 rendering.)
4. Precise-mode crosswind ≥ TAS → `gsFromWind` returns `null`, UI shows inline error, never `NaN gal`. (Task 2 tests; Task 3 view-model test.)
5. localStorage throwing (private mode / blocked) → app fully usable, defaults applied. (Task 5 storage tests with a throwing mock.)

---

### Task 1: Repo scaffold + quick-mode calculation core

**Files:**
- Create: `package.json`, `.gitignore`, `calc.mjs`, `tests/calc.test.mjs`

**Interfaces:**
- Produces:
  - `quickGS(tas: number, comp: number): number` — `tas + comp`.
  - `buildSegments(distToDest: number, currentGS: number, points: {dist: number, gs: number}[]): {segments: {from: number, to: number, gs: number}[], errors: {index: number, code: 'OUT_OF_ORDER'|'BEYOND_DEST'|'NONPOSITIVE_GS'}[]}` — segment 0 is `0→points[0].dist` at `currentGS`; each point's GS applies from its dist to the next point's dist (last → `distToDest`). With no points: one segment at `currentGS`. Points are taken in given order (not auto-sorted); `dist ≤` previous dist ⇒ `OUT_OF_ORDER`; `dist ≥ distToDest` ⇒ `BEYOND_DEST`; `gs ≤ 0` (or null) ⇒ `NONPOSITIVE_GS`. Any error ⇒ `segments: []`.
  - `computeFuel(segments, ff: number, fob: number): {eteHours, fuelUsed, fod, reserveGal, reserveMin, belowReserve}` — `eteHours = Σ len/gs`, `fuelUsed = eteHours*ff`, `fod = fob − fuelUsed`, `reserveGal = ff*0.75`, `reserveMin = fod/ff*60`, `belowReserve = fod < reserveGal`.

- [ ] **Step 1: Scaffold repo**

```bash
cd "/Users/aimitrius/Dev/Flight Calculator" && git init
printf '.superpowers/\n.DS_Store\n' > .gitignore
```

`package.json`: `{ "name": "fuel-check", "private": true, "type": "module", "scripts": { "test": "node --test tests/" } }`

- [ ] **Step 2: Write failing tests** in `tests/calc.test.mjs`

```js
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
```

- [ ] **Step 3: Run tests, verify they fail**

Run: `npm test` — Expected: FAIL (cannot find `../calc.mjs`).

- [ ] **Step 4: Implement `calc.mjs`** (the three exported functions per the Interfaces block)

- [ ] **Step 5: Run tests, verify pass** — `npm test` → all PASS.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: quick-mode fuel calculation core"
```

### Task 2: Precise-mode wind math

**Files:**
- Modify: `calc.mjs`
- Test: `tests/calc-precise.test.mjs`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `headCross(windDirTrue: number, windSpeed: number, courseTrue: number): {head: number, cross: number}` — `head = windSpeed·cos(rad(windDirTrue − courseTrue))` (positive = headwind), `cross = windSpeed·sin(rad(windDirTrue − courseTrue))`.
  - `trueCourse(courseMag: number, magVar: number): number` — `(courseMag + magVar + 360) % 360`.
  - `gsFromWind(tas: number, head: number, cross: number): number | null` — `√(tas² − cross²) − head`; `null` when `|cross| ≥ tas`.

- [ ] **Step 1: Write failing tests** in `tests/calc-precise.test.mjs`

```js
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
```

- [ ] **Step 2: Run, verify FAIL** — `npm test`.
- [ ] **Step 3: Implement the three functions in `calc.mjs`.**
- [ ] **Step 4: Run, verify PASS** — `npm test`.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: precise-mode wind triangle with mag var"`

### Task 3: View model (pure UI logic)

**Files:**
- Create: `ui-model.mjs`
- Test: `tests/ui-model.test.mjs`

**Interfaces:**
- Consumes: everything `calc.mjs` produces (Tasks 1–2).
- Produces:
  - `num(raw: string): number | null` — trimmed parse; `''`/non-numeric → `null`. Accepts a leading `+`/`-` and decimal point.
  - `gpsSpeedToKt(speedMs: number | null): number | null` — `null` for `null`, `NaN`, or `< 0`; else `Math.round(speedMs × 1.94384)`.
  - `formatEte(hours: number): string` — `"2:02"` (h:mm, minutes zero-padded, rounded).
  - `buildViewModel(state): ViewModel` where `state = { fob, ff, dist, gs, tas, garminFod, mode: 'quick'|'precise', courseMag, magVar, points }` (all field values already through `num()`; `points` is `{dist, comp}[]` in quick mode, `{dist, windDir, windSpeed}[]` in precise). Returns exactly one of:
    - `{ status: 'incomplete', missing: string[] }` — any required field null (`garminFod` and `magVar` optional; `magVar` null treated as 0; empty points list is complete).
    - `{ status: 'error', pointErrors: {index, code}[] }` — codes from `buildSegments` plus `'CROSSWIND_GT_TAS'`, `'INCOMPLETE'` (a point with any null field).
    - `{ status: 'ok', fodText: string, reserveMinText: string, eteText: string, belowReserve: boolean, reserveGalText: string, deltaText: string | null, explainers: string[], pointComps: (number|null)[] }` — `fodText` like `"15.9 gal"` (1 decimal); `deltaText` like `"Garmin 18.2 gal · Δ −2.3 gal"` (null when garminFod null); `pointComps` = per-point rounded signed component (precise mode; nulls in quick mode); `explainers` one string per segment: `"↓ 50–170 nm: headwind 45 kt → GS 138 kt"` (`tailwind N kt` for positive, `current GS` wording for segment 0: `"↓ 0–50 nm: current GS 148 kt"`).

- [ ] **Step 1: Write failing tests** in `tests/ui-model.test.mjs` covering, with exact expected values:
  - `num('')→null`, `num('17.8')→17.8`, `num('-45')→-45`, `num('abc')→null`
  - `gpsSpeedToKt(null)→null`, `(-1)→null`, `(NaN)→null`, `(76.1)→148`
  - `formatEte(2.028)→'2:02'`, `formatEte(0.983)→'0:59'`
  - quick-mode mockup state (FOB 52, FF 17.8, dist 312, GS 148, TAS 183, points 50/−45, 170/−20, 250/+5) → `status:'ok'`, `fodText:'15.9 gal'`, `eteText:'2:02'`, `belowReserve:false`, 4 explainers with segment 0 reading `↓ 0–50 nm: current GS 148 kt` and segment 1 reading `↓ 50–170 nm: headwind 45 kt → GS 138 kt`
  - same state plus `garminFod: 18.2` → `deltaText: 'Garmin 18.2 gal · Δ −2.3 gal'`
  - FOB null → `{status:'incomplete'}` with `'fob'` in `missing`
  - a point `{dist: 50, comp: null}` → `status:'error'`, code `'INCOMPLETE'`
  - precise mode, course 265 mag, magVar 0, point wind 270/45 → `pointComps[0] === -45` (rounded) and GS in explainer `138 kt`
  - precise mode with windSpeed ≥ TAS crosswind case (course 265, wind 175/200) → error code `'CROSSWIND_GT_TAS'`
  - below-reserve state (FOB 38, single long headwind) → `belowReserve:true`

- [ ] **Step 2: Run, verify FAIL.**
- [ ] **Step 3: Implement `ui-model.mjs`.** Quick mode point GS via `quickGS`; precise via `trueCourse`+`headCross`+`gsFromWind`; then `buildSegments`+`computeFuel`.
- [ ] **Step 4: Run, verify PASS** — `npm test`.
- [ ] **Step 5: Commit** — `git commit -am "feat: view model"` (plus `git add ui-model.mjs tests/ui-model.test.mjs`).

### Task 4: Static UI

**Files:**
- Create: `index.html`, `style.css`

**Interfaces:**
- Produces element IDs Task 5 relies on: inputs `#fob #ff #dist #gs #tas #garmin-fod #course #mag-var`; `#tab-quick #tab-precise`; `#points` (container) with per-point inputs carrying `data-field="dist|comp|windDir|windSpeed"` and a remove button `data-remove`; `#add-point`; `#gps-badge`; result panel `#result` containing `#fod-big #result-sub #result-warning`; `#you-line`. Explainer lines render as elements with class `.between` interleaved in `#points`.

- [ ] **Step 1: Build `index.html` + `style.css`** reproducing the approved mockup `main-layout-v2.html` (same visual language, colors from Global Constraints): title `FUEL CHECK — SR22T`; row FOB/FF; row Dist/GS(GPS, green)/TAS; Garmin FOD field; tabs QUICK WIND / PRECISE WIND (Precise additionally shows Course and Mag var fields, hidden in quick mode via a `body` class or hidden attribute); `YOU · 0 NM` line; points list; `+ Add wind point`; result panel; footer `Cross-check only — fly the Garmin.` All inputs `type="text" inputmode="decimal"` (except wind dir/course `inputmode="numeric"`); `<meta name="viewport" content="width=device-width, initial-scale=1">`; `apple-mobile-web-app-capable` metas. One template `<template id="point-template">` for a wind point row (both modes' fields; app toggles visibility).

- [ ] **Step 2: Verify statically**

Run: `python3 -m http.server 8080 &` then `curl -s localhost:8080/index.html | grep -c 'id="fod-big"'` → `1`; also grep for each produced ID above (one-liner loop), expect all found. Open `http://localhost:8080` once to eyeball against the mockup.

- [ ] **Step 3: Commit** — `git add index.html style.css && git commit -m "feat: static UI"`

### Task 5: App wiring + persistence

**Files:**
- Create: `app.mjs`, `storage.mjs`
- Modify: `index.html` (add `<script type="module" src="app.mjs">`)
- Test: `tests/storage.test.mjs`

**Interfaces:**
- Consumes: `buildViewModel`, `num` (Task 3); element IDs (Task 4).
- Produces: `storage.mjs` exports `loadPersisted(store): {ff: string, tas: string, magVar: string}` and `savePersisted(store, {ff, tas, magVar}): void` — `store` is a localStorage-like object injected for tests; every call wrapped in try/catch; on any throw `loadPersisted` returns `{ff: '17.8', tas: '', magVar: ''}` (the first-launch defaults; same defaults when keys absent). **Only these three keys ever touch storage.**

- [ ] **Step 1: Write failing tests** in `tests/storage.test.mjs`: round-trip with a Map-backed fake; defaults when empty; defaults (no throw) with a store whose `getItem`/`setItem` throw.
- [ ] **Step 2: Run, verify FAIL; implement `storage.mjs`; run, verify PASS.**
- [ ] **Step 3: Implement `app.mjs`:** read all fields → `buildViewModel` on every `input`/click event; render result panel (green/red via a class on `#result`), explainers, per-point `Comp.` values and inline point errors; tab switching keeps two separate wind-value stores sharing point distances (switching never erases either); add/remove points; persist ff/tas/magVar on change via `savePersisted(window.localStorage, …)`; apply `loadPersisted` on startup; incomplete → result panel shows `Enter missing values` neutral state.
- [ ] **Step 4: Verify in browser:** serve, open, enter the mockup scenario by hand, confirm `15.9 gal`, `2:02`, green; set FOB 38 → red warning with `⚠ Below 45-min reserve (13.4 gal)`; enter Garmin FOD 18.2 → delta line; reload page → FF/TAS kept, flight fields empty.
- [ ] **Step 5: Run `npm test` (all green) and commit** — `git add -A && git commit -m "feat: app wiring and persistence"`

### Task 6: GPS auto-fill

**Files:**
- Modify: `app.mjs`, `index.html` (GPS badge states)

**Interfaces:**
- Consumes: `gpsSpeedToKt` (Task 3), `#gs`, `#gps-badge` (Task 4).

- [ ] **Step 1: Implement:** on startup call `navigator.geolocation.watchPosition` (`enableHighAccuracy: true`); each fix: `gpsSpeedToKt(coords.speed)`; non-null and GPS mode active → set `#gs` value and recalc; null → leave field unchanged. Badge shows `GPS` (green, live), `GPS OFF` (grey, after permission denied/unavailable), `MANUAL` (after the pilot edits `#gs`). Editing `#gs` switches to manual (watch keeps running but stops writing); tapping the badge in manual mode re-enables GPS writes. No geolocation API at all → manual mode silently.
- [ ] **Step 2: Verify:** serve over `http://localhost` (secure-context exception), open in desktop Safari/Chrome: deny permission → badge `GPS OFF`, field editable, app fully usable; grant (if testable) → badge green. Simulated `coords.speed = null` path covered by Task 3 unit tests.
- [ ] **Step 3: Commit** — `git commit -am "feat: GPS ground-speed auto-fill with manual override"`

### Task 7: PWA — manifest, icons, service worker

**Files:**
- Create: `manifest.webmanifest`, `sw.js`, `icons/icon-180.png`, `icons/icon-512.png`, `scripts/make-icons.py`
- Modify: `index.html` (manifest link, `apple-touch-icon`, SW registration in `app.mjs` or inline)

- [ ] **Step 1: Icons:** `scripts/make-icons.py` — Python 3 stdlib only (zlib+struct), emits solid `#0b0f14` squares with a `#5fc08a` fuel-gauge-style arc/dot (keep it simple; a plain two-color geometric mark is fine) at 180 and 512 px. Run it; verify `file icons/icon-180.png` reports PNG 180x180.
- [ ] **Step 2: `manifest.webmanifest`:** name `Fuel Check`, short_name `FuelCheck`, `display: standalone`, `background_color`/`theme_color: #0b0f14`, both icons, `start_url: "."`, `scope: "."`.
- [ ] **Step 3: `sw.js`:** cache-first; `const CACHE = 'fuel-check-v1'`; precache exactly: `.`, `index.html`, `style.css`, `app.mjs`, `calc.mjs`, `ui-model.mjs`, `storage.mjs`, `manifest.webmanifest`, both icons. `install`: `skipWaiting()` after precache; `activate`: delete non-matching caches + `clients.claim()`. Bump `CACHE` on every deploy (note this in a comment).
- [ ] **Step 4: Register SW** from `app.mjs` (`navigator.serviceWorker?.register('sw.js')`, try/catch).
- [ ] **Step 5: Verify offline:** serve on localhost, load once, then in DevTools set Offline and reload → app loads and calculates. `npm test` still green.
- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat: installable offline PWA"`

### Task 8: Deploy to GitHub Pages

**Files:**
- Create: `README.md` (what it is, install-to-home-screen steps, the one-line disclaimer, how to update)

- [ ] **Step 1: Create repo and push**

```bash
gh repo create fuel-check --public --source . --push
```

(If `gh` is not authenticated, stop and ask the owner to run `! gh auth login`.)

- [ ] **Step 2: Enable Pages** on the default branch root: `gh api -X POST repos/{owner}/fuel-check/pages -f 'source[branch]=main' -f 'source[path]=/'` (or `-X PUT .../pages` update form if it already exists).
- [ ] **Step 3: Verify live:** poll `curl -sI https://<owner>.github.io/fuel-check/` until `200`; then `curl -s .../sw.js | head -1` matches. Confirm manifest and icons return 200.
- [ ] **Step 4: Commit README, push** — `git add README.md && git commit -m "docs: README" && git push`
- [ ] **Step 5: Hand the URL to the owner** with iPhone/iPad install steps (Safari → Share → Add to Home Screen) and ask them to verify GPS + offline in the field.
