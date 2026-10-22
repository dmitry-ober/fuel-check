// Thin DOM glue. All logic lives in ui-model.mjs / calc.mjs.
import { buildViewModel, num, gpsSpeedToKt, formatUtcHM } from './ui-model.mjs';
import { loadPersisted, savePersisted, loadProcs, saveProcs } from './storage.mjs';
import { declination, toDecimalYear } from './wmm.mjs';

const $ = (id) => document.getElementById(id);
const el = {
  fob: $('fob'), ff: $('ff'), dist: $('dist'), gs: $('gs'), tas: $('tas'),
  garmin: $('garmin-fod'), course: $('course'), magVar: $('mag-var'),
  tabQuick: $('tab-quick'), tabPrecise: $('tab-precise'),
  points: $('points'), add: $('add-point'), you: $('you-line'),
  result: $('result'), big: $('fod-big'), sub: $('result-sub'), warn: $('result-warning'),
  tpl: $('point-template'), badge: $('gps-badge'),
  arrToggle: $('arr-toggle'), arrState: $('arr-state'), arrBody: $('arr-body'), arrSub: $('arr-sub'),
  crAlt: $('cr-alt'), fldElev: $('fld-elev'), descRate: $('desc-rate'),
  descFF: $('desc-ff'), apprFF: $('appr-ff'), apprMin: $('appr-min'),
  procSel: $('proc-sel'), procForm: $('proc-form'),
  pfApt: $('pf-apt'), pfName: $('pf-name'), pfMin: $('pf-min'),
};

let arrivalOn = false;

// Single source of truth for wind points. Each point keeps BOTH the quick
// value (comp) and the precise values (windDir/windSpeed), sharing dist,
// so switching tabs never erases either side.
const points = [];
let mode = 'quick';
let magW = true; // mag var direction toggle: true = West (negative), default W

// Mag var provenance: 'auto' = computed from GPS position this launch (WMM2025),
// 'saved' = carried over from a previous session (may be outdated),
// 'manual' = the pilot typed/toggled it this session (auto never overwrites it).
let magVarSource = '';
let magVarAutoDone = false;
function setMagSrc(src) {
  magVarSource = src;
  const b = $('magvar-src');
  if (!b) return;
  b.textContent = src === 'auto' ? 'AUTO' : src === 'saved' ? 'SAVED' : src === 'manual' ? 'MANUAL' : '';
  b.className = src === 'auto' ? 'src-badge auto' : 'src-badge';
  b.title = src === 'saved' ? 'From a previous session — may be outdated. Updates from GPS position when a fix arrives.'
    : src === 'auto' ? 'Computed from GPS position (WMM2025)'
    : src === 'manual' ? 'Entered by you this session' : '';
}

// iPhone decimal keypad has no minus key: values are typed positive and the
// sign comes from the HW/TW and E/W toggles.
const signedMagVar = () => {
  const raw = el.magVar.value.trim().replace(/^[+-]/, '');
  return raw === '' ? '' : (magW ? '-' : '') + raw;
};
const signedComp = (p) => {
  const v = num(p.comp);
  return v == null ? null : (p.tw ? 1 : -1) * Math.abs(v); // HW = negative comp
};
const FIELD_NAME = {
  fob: 'fuel on board', ff: 'fuel flow', dist: 'distance', gs: 'ground speed', tas: 'TAS', courseMag: 'course',
  cruiseAlt: 'cruise alt', fieldElev: 'field elev', rate: 'descent rate', descFF: 'descent FF', apprFF: 'approach FF', apprMin: 'approach time',
};

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
    mode, courseMag: num(el.course.value), magVar: num(signedMagVar()),
    points: points.map((p) => ({
      dist: num(p.dist), comp: signedComp(p), windDir: num(p.windDir), windSpeed: num(p.windSpeed),
    })),
    now: new Date(),
    arrival: arrivalOn ? {
      cruiseAlt: num(el.crAlt.value), fieldElev: num(el.fldElev.value), rate: num(el.descRate.value),
      descFF: num(el.descFF.value), apprFF: num(el.apprFF.value), apprMin: num(el.apprMin.value),
    } : null,
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
    row.querySelectorAll('[data-wind]').forEach((b) => setSeg(b, (b.dataset.wind === 'tw') === !!p.tw));
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

function setSeg(btn, on) {
  btn.classList.toggle('on', on);
  btn.setAttribute('aria-pressed', String(on));
}

function onPointsClick(e) {
  const wind = e.target.closest('[data-wind]');
  if (wind) {
    points[Number(wind.closest('.wp').dataset.index)].tw = wind.dataset.wind === 'tw';
    wind.closest('.wp').querySelectorAll('[data-wind]').forEach((b) => setSeg(b, b === wind));
    render();
    return;
  }
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
  el.arrSub.textContent = '';
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
    setNeutral('Enter: ' + vm.missing.map((k) => FIELD_NAME[k] ?? k).join(', '));
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
  if (vm.etaText) parts.push(`ETA ${vm.etaText}`);
  if (vm.deltaText) parts.push(vm.deltaText);
  el.sub.textContent = parts.join(' · ');
  el.arrSub.textContent = vm.todText ? `${vm.todText} · ${vm.breakdownText}` : '';
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
  if (s) savePersisted(s, {
    ff: el.ff.value, tas: el.tas.value, magVar: signedMagVar(),
    descRate: el.descRate.value, descFF: el.descFF.value, apprFF: el.apprFF.value,
  });
}

// --- startup --------------------------------------------------------------
function setMagSeg() {
  setSeg($('mv-w'), magW);
  setSeg($('mv-e'), !magW);
}
const saved = (() => { const s = storage(); return s ? loadPersisted(s) : { ff: '17.8', tas: '', magVar: '' }; })();
el.ff.value = saved.ff;
el.tas.value = saved.tas;
el.descRate.value = saved.descRate;
el.descFF.value = saved.descFF;
el.apprFF.value = saved.apprFF;
{
  // Stored as a signed string: '-22' = 22 W, '22' = 22 E, '' = default W.
  const mv = String(saved.magVar ?? '').trim();
  magW = !(mv !== '' && !mv.startsWith('-'));
  el.magVar.value = mv.replace(/^[+-]/, '');
  setMagSeg();
  if (mv !== '') setMagSrc('saved');
}

[el.fob, el.ff, el.dist, el.gs, el.tas, el.garmin, el.course, el.magVar,
  el.crAlt, el.fldElev, el.descRate, el.descFF, el.apprFF, el.apprMin].forEach((inp) => {
  inp.addEventListener('input', () => {
    if (inp === el.magVar) setMagSrc('manual');
    if (inp === el.ff || inp === el.tas || inp === el.magVar
      || inp === el.descRate || inp === el.descFF || inp === el.apprFF) persist();
    render();
  });
});
[['mv-w', true], ['mv-e', false]].forEach(([id, w]) => {
  $(id).addEventListener('click', () => { magW = w; setMagSeg(); setMagSrc('manual'); persist(); render(); });
});
el.points.addEventListener('input', onPointsInput);
el.points.addEventListener('click', onPointsClick);
el.add.addEventListener('click', () => {
  points.push({ dist: '', comp: '', tw: false, windDir: '', windSpeed: '' });
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
let gpsDenied = false; // permanent failure (PERMISSION_DENIED); cleared only by a real fix
function onGpsFix(pos) {
  gpsDenied = false;
  autoMagVar(pos);
  const kt = gpsSpeedToKt(pos?.coords?.speed);
  if (gpsState === 'off') setGps('gps'); // recovered after an earlier error
  // Stationary / sub-1-kt fixes are not written: keep whatever the pilot typed.
  if (kt == null || kt < 1 || gpsState !== 'gps') return;
  el.gs.value = String(kt);
  render();
}
// Once per launch: fill Mag var from the GPS position via the embedded
// WMM2025 model. Never overwrites a value the pilot entered this session.
function autoMagVar(pos) {
  if (magVarAutoDone || magVarSource === 'manual') return;
  const { latitude, longitude, altitude } = pos?.coords ?? {};
  if (typeof latitude !== 'number' || typeof longitude !== 'number'
    || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
  let dec;
  try {
    dec = declination(latitude, longitude, (Number.isFinite(altitude) ? altitude : 0) / 1000, toDecimalYear(new Date()));
  } catch { return; }
  if (!Number.isFinite(dec)) return;
  magVarAutoDone = true;
  magW = dec < 0;
  el.magVar.value = String(Math.round(Math.abs(dec) * 10) / 10);
  setMagSeg();
  setMagSrc('auto');
  persist();
  render();
}

function onGpsError(err) {
  // Permission denied or position unavailable: show GPS OFF, keep manual entry usable.
  if (err && err.code === 1) gpsDenied = true;
  // A transient error never clobbers a manual override; a denial always shows OFF.
  if (gpsDenied || gpsState !== 'manual') setGps('off');
}
el.gs.addEventListener('input', () => { if (gpsWatching && gpsState === 'gps') setGps('manual'); });
el.badge.addEventListener('click', (e) => {
  e.preventDefault();
  if (gpsState === 'manual') setGps(gpsDenied ? 'off' : 'gps');
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

// --- arrival block ---------------------------------------------------------
el.arrToggle.addEventListener('click', () => {
  arrivalOn = !arrivalOn;
  el.arrBody.hidden = !arrivalOn;
  el.arrToggle.setAttribute('aria-expanded', String(arrivalOn));
  el.arrState.textContent = arrivalOn ? 'ON' : 'OFF';
  el.arrState.classList.toggle('on', arrivalOn);
  render();
});
document.querySelectorAll('[data-addmin]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const add = Number(btn.dataset.addmin);
    const cur = num(el.apprMin.value) ?? 0;
    el.apprMin.value = String(add === 0 ? 0 : Math.max(0, cur + add));
    render();
  });
});

// Procedure library: owner-maintained, persisted on the device.
let procs = loadProcs(storage());
function renderProcSel() {
  const keep = el.procSel.value;
  el.procSel.innerHTML = '<option value="">Saved procedures…</option>';
  procs
    .map((p, i) => ({ p, i }))
    .sort((a, b) => a.p.apt.localeCompare(b.p.apt) || a.p.name.localeCompare(b.p.name))
    .forEach(({ p, i }) => {
      const o = document.createElement('option');
      o.value = String(i);
      o.textContent = `${p.apt} — ${p.name} (+${p.min} min)`;
      el.procSel.appendChild(o);
    });
  if ([...el.procSel.options].some((o) => o.value === keep)) el.procSel.value = keep;
}
renderProcSel();
$('proc-use').addEventListener('click', () => {
  const p = procs[Number(el.procSel.value)];
  if (!p) return;
  el.apprMin.value = String(p.min);
  render();
});
$('proc-del').addEventListener('click', () => {
  const i = Number(el.procSel.value);
  if (!procs[i]) return;
  procs.splice(i, 1);
  saveProcs(storage(), procs);
  renderProcSel();
});
$('proc-add').addEventListener('click', () => {
  el.procForm.hidden = false;
  el.pfApt.focus();
});
$('pf-cancel').addEventListener('click', () => { el.procForm.hidden = true; });
$('pf-save').addEventListener('click', () => {
  const apt = el.pfApt.value.trim().toUpperCase();
  const name = el.pfName.value.trim();
  const min = num(el.pfMin.value);
  if (!apt || !name || min == null || min < 0) return;
  procs.push({ apt, name, min, note: '' });
  saveProcs(storage(), procs);
  renderProcSel();
  el.procSel.value = String(procs.length - 1);
  el.procForm.hidden = true;
  el.pfApt.value = ''; el.pfName.value = ''; el.pfMin.value = '';
});

// UTC clock in the header; the ETA line refreshes with it once a minute.
{
  const clock = $('utc-clock');
  let lastMinute = -1;
  const tick = () => {
    const d = new Date();
    if (clock) clock.textContent = `${formatUtcHM(d)}:${String(d.getUTCSeconds()).padStart(2, '0')}Z`;
    if (d.getUTCMinutes() !== lastMinute) { lastMinute = d.getUTCMinutes(); render(); }
  };
  tick();
  setInterval(tick, 1000);
}

// Offline support: registration failure must never break the app.
const APP_VERSION = 'v6';
try {
  const verEl = document.getElementById('app-version');
  if (verEl) verEl.textContent = APP_VERSION;

  navigator.serviceWorker?.register('sw.js')?.catch(() => {});

  // When a new service worker takes control, reload once so the pilot
  // immediately runs the new version. The guard prevents reload loops.
  let reloaded = false;
  navigator.serviceWorker?.addEventListener('controllerchange', () => {
    if (reloaded) return;
    reloaded = true;
    location.reload();
  });

  const updateBtn = document.getElementById('update-btn');
  updateBtn?.addEventListener('click', async () => {
    updateBtn.disabled = true;
    updateBtn.textContent = 'Checking…';
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      await reg?.update();
      // If a new version was found, install → activate → controllerchange
      // fires and the page reloads. Otherwise say we're current.
      setTimeout(() => {
        updateBtn.textContent = 'Up to date';
        setTimeout(() => {
          updateBtn.textContent = 'Check for update';
          updateBtn.disabled = false;
        }, 2000);
      }, 3000);
    } catch {
      updateBtn.textContent = 'Offline — try later';
      setTimeout(() => {
        updateBtn.textContent = 'Check for update';
        updateBtn.disabled = false;
      }, 2000);
    }
  });
} catch { /* ignore */ }
