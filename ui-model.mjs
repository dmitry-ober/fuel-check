// Pure view-model logic: raw state in, display strings out. No DOM.
import {
  quickGS, buildSegments, computeFuel, headCross, trueCourse, gsFromWind,
} from './calc.mjs';

export function num(raw) {
  const s = String(raw ?? '').trim().replace(',', '.');
  if (s === '' || !/^[+-]?(\d+\.?\d*|\.\d+)$/.test(s)) return null;
  return Number(s);
}

export function gpsSpeedToKt(speedMs) {
  if (speedMs == null || Number.isNaN(speedMs) || speedMs < 0) return null;
  return Math.round(speedMs * 1.94384);
}

export function formatEte(hours) {
  const total = Math.round(hours * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

const MINUS = '−';
const fmt1 = (x) => x.toFixed(1);

function windPhrase(comp) {
  // comp: signed, negative = headwind
  const r = Math.round(comp);
  if (r < 0) return `headwind ${-r} kt`;
  if (r > 0) return `tailwind ${r} kt`;
  return 'no wind';
}

export function buildViewModel(state) {
  const { fob, ff, dist, gs, tas, garminFod, mode, courseMag, magVar, points } = state;
  const precise = mode === 'precise';

  const missing = [];
  if (fob == null) missing.push('fob');
  // Rates, speeds and distance must be strictly positive; 0/negative is invalid input.
  for (const [k, v] of [['ff', ff], ['dist', dist], ['gs', gs], ['tas', tas]]) {
    if (v == null || !(v > 0)) missing.push(k);
  }
  if (precise && points.length > 0 && courseMag == null) missing.push('courseMag');
  if (missing.length) return { status: 'incomplete', missing };

  const pointErrors = [];
  const pointComps = [];
  const segPoints = [];
  const keys = precise ? ['dist', 'windDir', 'windSpeed'] : ['dist', 'comp'];
  const tc = precise ? trueCourse(courseMag, magVar ?? 0) : null;

  points.forEach((p, index) => {
    if (keys.some((k) => p[k] == null)) {
      pointErrors.push({ index, code: 'INCOMPLETE' });
      pointComps.push(null);
      segPoints.push({ dist: p.dist, gs: NaN });
      return;
    }
    if (!precise) {
      pointComps.push(null);
      segPoints.push({ dist: p.dist, gs: quickGS(tas, p.comp) });
      return;
    }
    const { head, cross } = headCross(p.windDir, p.windSpeed, tc);
    const g = gsFromWind(tas, head, cross);
    pointComps.push(Math.round(-head) || 0);
    if (g == null) {
      pointErrors.push({ index, code: 'CROSSWIND_GT_TAS' });
      segPoints.push({ dist: p.dist, gs: NaN });
    } else {
      segPoints.push({ dist: p.dist, gs: g });
    }
  });

  if (pointErrors.some((e) => e.code === 'INCOMPLETE')) {
    return { status: 'error', pointErrors: pointErrors.filter((e) => e.code === 'INCOMPLETE') };
  }
  if (pointErrors.length) return { status: 'error', pointErrors };

  const built = buildSegments(dist, gs, segPoints);
  if (built.errors.length) return { status: 'error', pointErrors: built.errors };

  const f = computeFuel(built.segments, ff, fob);
  const explainers = built.segments.map((s, i) => {
    const range = `↓ ${Math.round(s.from)}–${Math.round(s.to)} nm: `;
    if (i === 0) return `${range}current GS ${Math.round(s.gs)} kt`;
    const comp = precise ? pointComps[i - 1] : points[i - 1].comp;
    return `${range}${windPhrase(comp)} → GS ${Math.round(s.gs)} kt`;
  });

  let deltaText = null;
  if (garminFod != null) {
    const d = f.fod - garminFod;
    const sign = d < 0 ? MINUS : d > 0 ? '+' : '';
    deltaText = `Garmin ${fmt1(garminFod)} gal · Δ ${sign}${fmt1(Math.abs(d))} gal`;
  }

  return {
    status: 'ok',
    fodText: `${fmt1(f.fod)} gal`,
    reserveMinText: `${Math.round(f.reserveMin)} min`,
    eteText: formatEte(f.eteHours),
    belowReserve: f.belowReserve,
    reserveGalText: `${fmt1(f.reserveGal)} gal`,
    deltaText,
    explainers,
    pointComps,
  };
}
