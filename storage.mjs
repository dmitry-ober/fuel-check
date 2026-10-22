// localStorage persistence for the three settings that survive reloads.
const KEYS = { ff: 'fc.ff', tas: 'fc.tas', magVar: 'fc.magVar' };
const DEFAULTS = { ff: '17.8', tas: '', magVar: '' };

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

export function savePersisted(store, { ff, tas, magVar }) {
  const vals = { ff, tas, magVar };
  for (const [field, key] of Object.entries(KEYS)) {
    try { store.setItem(key, String(vals[field] ?? '')); } catch { /* ignore */ }
  }
}
