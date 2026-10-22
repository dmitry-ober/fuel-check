// Thin DOM glue. All logic lives in ui-model.mjs / calc.mjs.
import { buildViewModel, num, gpsSpeedToKt } from './ui-model.mjs';
import { loadPersisted, savePersisted } from './storage.mjs';

const $ = (id) => document.getElementById(id);
const el = {
  fob: $('fob'), ff: $('ff'), dist: $('dist'), gs: $('gs'), tas: $('tas'),
  garmin: $('garmin-fod'), course: $('course'), magVar: $('mag-var'),
  tabQuick: $('tab-quick'), tabPrecise: $('tab-precise'),
  points: $('points'), add: $('add-point'), you: $('you-line'),
  result: $('result'), big: $('fod-big'), sub: $('result-sub'), warn: $('result-warning'),
  tpl: $('point-template'), badge: $('gps-badge'),
};

// Single source of truth for wind points. Each point keeps BOTH the quick
// value (comp) and the precise values (windDir/windSpeed), sharing dist,
// so switching tabs never erases either side.
const points = [];
let mode = 'quick';

const ERR_TEXT = {
  OUT_OF_ORDER: 'Distances must increase',
  BEYOND_DEST: 'Beyond destination',
  NONPOSITIVE_GS: 'Groundspeed would be zero or negative',
  CROSSWIND_GT_TAS: 'Crosswind exceeds TAS',
  INCOMPLETE: 'Fill in or remove this point',
};

function storage() {
  try { return window.localStorage; } catch { return null; }
}

function readState() {
  return {
    fob: num(el.fob.value), ff: num(el.ff.value), dist: num(el.dist.value),
    gs: num(el.gs.value), tas: num(el.tas.value), garminFod: num(el.garmin.value),
    mode, courseMag: num(el.course.value), magVar: num(el.magVar.value),
    points: points.map((p) => ({
      dist: num(p.dist), comp: num(p.comp), windDir: num(p.windDir), windSpeed: num(p.windSpeed),
    })),
  };
}

// --- point rows -----------------------------------------------------------
function makeBetween() {
  const d = document.createElement('div');
  d.className = 'between';
  return d;
}

function rebuildPoints() {
  el.points.textContent = '';
  el.points.appendChild(makeBetween()); // segment 0 explainer
  points.forEach((p, i) => {
    const row = el.tpl.content.firstElementChild.cloneNode(true);
    row.dataset.index = String(i);
    row.querySelector('.wpnum').textContent = String(i + 1);
    row.querySelectorAll('[data-field]').forEach((inp) => { inp.value = p[inp.dataset.field] ?? ''; });
    el.points.appendChild(row);
    el.points.appendChild(makeBetween());
  });
}

function onPointsInput(e) {
  const inp = e.target.closest('[data-field]');
  if (!inp) return;
  const i = Number(inp.closest('.wp').dataset.index);
  points[i][inp.dataset.field] = inp.value;
  render();
}

function onPointsClick(e) {
  const btn = e.target.closest('[data-remove]');
  if (!btn) return;
  points.splice(Number(btn.closest('.wp').dataset.index), 1);
  rebuildPoints();
  render();
}

// --- rendering ------------------------------------------------------------
function setNeutral(sub) {
  el.result.classList.remove('bad');
  el.result.classList.add('idle');
  el.big.textContent = '—';
  el.sub.textContent = sub;
  el.warn.hidden = true;
  el.warn.textContent = '';
}

function render() {
  const vm = buildViewModel(readState());
  const rows = el.points.querySelectorAll('.wp');
  const betweens = el.points.querySelectorAll('.between');
  rows.forEach((r) => {
    r.classList.remove('err');
    r.removeAttribute('title');
    const c = r.querySelector('[data-readout="comp"]');
    c.textContent = '—';
    c.classList.remove('hw', 'tw');
  });
  betweens.forEach((b) => { b.textContent = ''; });

  if (vm.status === 'incomplete') {
    setNeutral('Enter missing values');
    return;
  }
  if (vm.status === 'error') {
    setNeutral('Check wind points');
    vm.pointErrors.forEach(({ index, code }) => {
      const r = rows[index];
      if (!r) return;
      r.classList.add('err');
      r.title = ERR_TEXT[code] ?? code;
    });
    const first = vm.pointErrors[0];
    el.warn.textContent = `Point ${first.index + 1}: ${ERR_TEXT[first.code] ?? first.code}`;
    el.warn.hidden = false;
    return;
  }

  el.result.classList.remove('idle');
  el.result.classList.toggle('bad', vm.belowReserve);
  el.big.textContent = vm.fodText;
  const parts = [`≈ ${vm.reserveMinText} reserve`, `ETE ${vm.eteText}`];
  if (vm.deltaText) parts.push(vm.deltaText);
  el.sub.textContent = parts.join(' · ');
  if (vm.belowReserve) {
    el.warn.textContent = `⚠ Below 45-min reserve (${vm.reserveGalText})`;
    el.warn.hidden = false;
  } else {
    el.warn.hidden = true;
    el.warn.textContent = '';
  }
  vm.explainers.forEach((t, i) => { if (betweens[i]) betweens[i].textContent = t; });
  vm.pointComps.forEach((c, i) => {
    const out = rows[i]?.querySelector('[data-readout="comp"]');
    if (!out || c == null) return;
    out.textContent = c > 0 ? `+${c}` : c < 0 ? `−${-c}` : '0';
    out.classList.add(c < 0 ? 'hw' : 'tw');
  });
}

// --- modes ----------------------------------------------------------------
function setMode(next) {
  mode = next;
  document.body.classList.toggle('precise', mode === 'precise');
  el.tabQuick.classList.toggle('on', mode === 'quick');
  el.tabPrecise.classList.toggle('on', mode === 'precise');
  el.tabQuick.setAttribute('aria-selected', String(mode === 'quick'));
  el.tabPrecise.setAttribute('aria-selected', String(mode === 'precise'));
  render();
}

function persist() {
  const s = storage();
  if (s) savePersisted(s, { ff: el.ff.value, tas: el.tas.value, magVar: el.magVar.value });
}

// --- startup --------------------------------------------------------------
const saved = (() => { const s = storage(); return s ? loadPersisted(s) : { ff: '17.8', tas: '', magVar: '' }; })();
el.ff.value = saved.ff;
el.tas.value = saved.tas;
el.magVar.value = saved.magVar;

[el.fob, el.ff, el.dist, el.gs, el.tas, el.garmin, el.course, el.magVar].forEach((inp) => {
  inp.addEventListener('input', () => {
    if (inp === el.ff || inp === el.tas || inp === el.magVar) persist();
    render();
  });
});
el.points.addEventListener('input', onPointsInput);
el.points.addEventListener('click', onPointsClick);
el.add.addEventListener('click', () => {
  points.push({ dist: '', comp: '', windDir: '', windSpeed: '' });
  rebuildPoints();
  render();
  const rows = el.points.querySelectorAll('.wp');
  rows[rows.length - 1].querySelector('[data-field="dist"]').focus();
});
el.tabQuick.addEventListener('click', () => setMode('quick'));
el.tabPrecise.addEventListener('click', () => setMode('precise'));

// --- GPS ground-speed auto-fill ------------------------------------------
// gpsState: 'gps' (live, writes #gs) | 'manual' (pilot edited #gs) | 'off' (denied/unavailable).
// Programmatic .value writes do not fire 'input', so only real edits flip to manual.
let gpsState = 'off';
const BADGE = {
  gps: ['GPS', 'GPS live: ground speed auto-fills'],
  manual: ['MANUAL', 'Manual ground speed. Tap to resume GPS'],
  off: ['GPS OFF', 'GPS unavailable'],
};
function setGps(next) {
  gpsState = next;
  const [text, label] = BADGE[next];
  el.badge.textContent = text;
  el.badge.title = label;
  el.badge.setAttribute('aria-label', label);
  el.badge.classList.toggle('off', next === 'off');
  el.badge.classList.toggle('manual', next === 'manual');
}
let gpsWatching = false;
function onGpsFix(pos) {
  const kt = gpsSpeedToKt(pos?.coords?.speed);
  if (gpsState === 'off') setGps('gps'); // recovered after an earlier error
  if (kt == null || gpsState !== 'gps') return;
  el.gs.value = String(kt);
  render();
}
function onGpsError() {
  // Permission denied or position unavailable: show GPS OFF, keep manual entry usable.
  if (gpsState !== 'manual') setGps('off'); // never clobber the pilot's manual override
}
el.gs.addEventListener('input', () => { if (gpsWatching) setGps('manual'); });
el.badge.addEventListener('click', (e) => {
  e.preventDefault();
  if (gpsState === 'manual') setGps('gps');
});
setGps('off');
try {
  if (typeof navigator !== 'undefined' && navigator.geolocation) {
    gpsWatching = true;
    navigator.geolocation.watchPosition(onGpsFix, onGpsError, { enableHighAccuracy: true, maximumAge: 2000 });
    setGps('gps');
  }
} catch { gpsWatching = false; setGps('off'); }

rebuildPoints();
setMode('quick');
