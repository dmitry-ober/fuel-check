// Pure fuel/navigation calculations. Sign convention: quick wind component is
// negative for a headwind, so groundspeed = tas + comp.

export function quickGS(tas, comp) {
  return tas + comp;
}

// points: [{dist, gs}] in the order given (not sorted). Each point's GS applies
// from its dist up to the next point's dist (the last one runs to distToDest).
export function buildSegments(distToDest, currentGS, points) {
  const errors = [];
  let prev = 0;
  points.forEach((p, index) => {
    if (p.dist <= prev) errors.push({ index, code: 'OUT_OF_ORDER' });
    else if (p.dist >= distToDest) errors.push({ index, code: 'BEYOND_DEST' });
    if (!(p.gs > 0)) errors.push({ index, code: 'NONPOSITIVE_GS' });
    prev = p.dist;
  });
  if (errors.length) return { segments: [], errors };

  const segments = [];
  let from = 0;
  let gs = currentGS;
  for (const p of points) {
    segments.push({ from, to: p.dist, gs });
    from = p.dist;
    gs = p.gs;
  }
  segments.push({ from, to: distToDest, gs });
  return { segments, errors };
}

export function computeFuel(segments, ff, fob) {
  const eteHours = segments.reduce((sum, s) => sum + (s.to - s.from) / s.gs, 0);
  const fuelUsed = eteHours * ff;
  const fod = fob - fuelUsed;
  const reserveGal = ff * 0.75;
  const reserveMin = (fod / ff) * 60;
  const belowReserve = fod < reserveGal;
  return { eteHours, fuelUsed, fod, reserveGal, reserveMin, belowReserve };
}

// Wind components relative to the true course. Angles in degrees; Math trig
// takes radians. head > 0 is a headwind; cross is the signed crosswind component.
export function headCross(windDirTrue, windSpeed, courseTrue) {
  const rad = ((windDirTrue - courseTrue) * Math.PI) / 180;
  return {
    head: windSpeed * Math.cos(rad),
    cross: windSpeed * Math.sin(rad),
  };
}

// Magnetic course to true course. magVar is signed, positive = East.
export function trueCourse(courseMag, magVar) {
  return (courseMag + magVar + 360) % 360;
}

// Groundspeed from the wind triangle. Returns null when the crosswind is at or
// beyond TAS (no valid solution).
export function gsFromWind(tas, head, cross) {
  if (Math.abs(cross) >= tas) return null;
  return Math.sqrt(tas * tas - cross * cross) - head;
}
