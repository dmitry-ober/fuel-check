// localStorage persistence. Only aircraft-typical settings survive reloads;
// flight data (FOB, distance, winds, altitudes, approach minutes) never does.
const KEYS = {
  ff: 'fc.ff', tas: 'fc.tas', magVar: 'fc.magVar',
  descRate: 'fc.descRate', descFF: 'fc.descFF', apprFF: 'fc.apprFF',
};
const DEFAULTS = { ff: '17.8', tas: '', magVar: '', descRate: '500', descFF: '18', apprFF: '20' };

export function loadPersisted(store) {
  const out = { ...DEFAULTS };
  for (const [field, key] of Object.entries(KEYS)) {
    try {
      const v = store.getItem(key);
      if (v != null) out[field] = String(v);
    } catch { /* storage unavailable: keep default */ }
  }
  return out;
}

export function savePersisted(store, vals) {
  for (const [field, key] of Object.entries(KEYS)) {
    try { store.setItem(key, String(vals[field] ?? '')); } catch { /* ignore */ }
  }
}

// Arrival-procedure library: [{apt, name, min, note}], owner-maintained on
// the device. Reference data, not flight state, so it persists.
const PROCS_KEY = 'fc.procs';

export function loadProcs(store) {
  try {
    const raw = store.getItem(PROCS_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list.filter((p) => p && typeof p.apt === 'string' && typeof p.name === 'string'
      && Number.isFinite(p.min)).map((p) => ({
      apt: p.apt, name: p.name, min: p.min, note: typeof p.note === 'string' ? p.note : '',
    }));
  } catch { return []; }
}

export function saveProcs(store, procs) {
  try { store.setItem(PROCS_KEY, JSON.stringify(procs)); } catch { /* ignore */ }
}
