// Magnetic declination from the World Magnetic Model WMM2025 (NOAA/NCEI).
// Coefficients embedded verbatim from the official WMM2025 release
// (epoch 2025.0, valid 2025.0–2030.0). Implementation follows the standard
// WMM spherical-harmonic algorithm (as in NOAA's legacy GeoMag reference
// code); verified against the official WMM2025 test values in
// tests/wmm.test.mjs. Declination sign: positive = East.

const EPOCH = 2025.0;
const MAXORD = 12;

// n m gnm hnm dgnm dhnm
const COF = `
1 0 -29351.8 0.0 12.0 0.0
1 1 -1410.8 4545.4 9.7 -21.5
2 0 -2556.6 0.0 -11.6 0.0
2 1 2951.1 -3133.6 -5.2 -27.7
2 2 1649.3 -815.1 -8.0 -12.1
3 0 1361.0 0.0 -1.3 0.0
3 1 -2404.1 -56.6 -4.2 4.0
3 2 1243.8 237.5 0.4 -0.3
3 3 453.6 -549.5 -15.6 -4.1
4 0 895.0 0.0 -1.6 0.0
4 1 799.5 278.6 -2.4 -1.1
4 2 55.7 -133.9 -6.0 4.1
4 3 -281.1 212.0 5.6 1.6
4 4 12.1 -375.6 -7.0 -4.4
5 0 -233.2 0.0 0.6 0.0
5 1 368.9 45.4 1.4 -0.5
5 2 187.2 220.2 0.0 2.2
5 3 -138.7 -122.9 0.6 0.4
5 4 -142.0 43.0 2.2 1.7
5 5 20.9 106.1 0.9 1.9
6 0 64.4 0.0 -0.2 0.0
6 1 63.8 -18.4 -0.4 0.3
6 2 76.9 16.8 0.9 -1.6
6 3 -115.7 48.8 1.2 -0.4
6 4 -40.9 -59.8 -0.9 0.9
6 5 14.9 10.9 0.3 0.7
6 6 -60.7 72.7 0.9 0.9
7 0 79.5 0.0 -0.0 0.0
7 1 -77.0 -48.9 -0.1 0.6
7 2 -8.8 -14.4 -0.1 0.5
7 3 59.3 -1.0 0.5 -0.8
7 4 15.8 23.4 -0.1 0.0
7 5 2.5 -7.4 -0.8 -1.0
7 6 -11.1 -25.1 -0.8 0.6
7 7 14.2 -2.3 0.8 -0.2
8 0 23.2 0.0 -0.1 0.0
8 1 10.8 7.1 0.2 -0.2
8 2 -17.5 -12.6 0.0 0.5
8 3 2.0 11.4 0.5 -0.4
8 4 -21.7 -9.7 -0.1 0.4
8 5 16.9 12.7 0.3 -0.5
8 6 15.0 0.7 0.2 -0.6
8 7 -16.8 -5.2 -0.0 0.3
8 8 0.9 3.9 0.2 0.2
9 0 4.6 0.0 -0.0 0.0
9 1 7.8 -24.8 -0.1 -0.3
9 2 3.0 12.2 0.1 0.3
9 3 -0.2 8.3 0.3 -0.3
9 4 -2.5 -3.3 -0.3 0.3
9 5 -13.1 -5.2 0.0 0.2
9 6 2.4 7.2 0.3 -0.1
9 7 8.6 -0.6 -0.1 -0.2
9 8 -8.7 0.8 0.1 0.4
9 9 -12.9 10.0 -0.1 0.1
10 0 -1.3 0.0 0.1 0.0
10 1 -6.4 3.3 0.0 0.0
10 2 0.2 0.0 0.1 -0.0
10 3 2.0 2.4 0.1 -0.2
10 4 -1.0 5.3 -0.0 0.1
10 5 -0.6 -9.1 -0.3 -0.1
10 6 -0.9 0.4 0.0 0.1
10 7 1.5 -4.2 -0.1 0.0
10 8 0.9 -3.8 -0.1 -0.1
10 9 -2.7 0.9 -0.0 0.2
10 10 -3.9 -9.1 -0.0 -0.0
11 0 2.9 0.0 0.0 0.0
11 1 -1.5 0.0 -0.0 -0.0
11 2 -2.5 2.9 0.0 0.1
11 3 2.4 -0.6 0.0 -0.0
11 4 -0.6 0.2 0.0 0.1
11 5 -0.1 0.5 -0.1 -0.0
11 6 -0.6 -0.3 0.0 -0.0
11 7 -0.1 -1.2 -0.0 0.1
11 8 1.1 -1.7 -0.1 -0.0
11 9 -1.0 -2.9 -0.1 0.0
11 10 -0.2 -1.8 -0.1 0.0
11 11 2.6 -2.3 -0.1 0.0
12 0 -2.0 0.0 0.0 0.0
12 1 -0.2 -1.3 0.0 -0.0
12 2 0.3 0.7 -0.0 0.0
12 3 1.2 1.0 -0.0 -0.1
12 4 -1.3 -1.4 -0.0 0.1
12 5 0.6 -0.0 -0.0 -0.0
12 6 0.6 0.6 0.1 -0.0
12 7 0.5 -0.1 -0.0 -0.0
12 8 -0.1 0.8 0.0 0.0
12 9 -0.4 0.1 0.0 -0.0
12 10 -0.2 -1.0 -0.1 -0.0
12 11 -1.3 0.1 -0.0 0.0
12 12 -0.7 0.2 -0.1 -0.1
`;

// --- one-time initialization (Schmidt semi-normalization folded into c/cd) ---
const c = [], cd = [], k = [], fn = [0], fm = [0];
const snorm = new Array(169).fill(0);
{
  for (let i = 0; i <= MAXORD; i++) {
    c.push(new Array(MAXORD + 1).fill(0));
    cd.push(new Array(MAXORD + 1).fill(0));
    k.push(new Array(MAXORD + 1).fill(0));
    fn.push(i + 2); // fn[n] = n+1 (fn[1]=2 …); index 0 unused in sums
    fm.push(i + 1);
  }
  fn[0] = 1; fm[0] = 0;
  for (let i = 1; i <= MAXORD; i++) { fn[i] = i + 1; fm[i] = i; }

  for (const line of COF.trim().split('\n')) {
    const [n, m, gnm, hnm, dgnm, dhnm] = line.trim().split(/\s+/).map(Number);
    c[m][n] = gnm;
    cd[m][n] = dgnm;
    if (m !== 0) {
      c[n][m - 1] = hnm;
      cd[n][m - 1] = dhnm;
    }
  }

  snorm[0] = 1;
  for (let n = 1; n <= MAXORD; n++) {
    snorm[n] = (snorm[n - 1] * (2 * n - 1)) / n;
    let j = 2;
    for (let m = 0, D1 = 1, D2 = (n - m + D1) / D1; D2 > 0; D2--, m += D1) {
      k[m][n] = ((n - 1) * (n - 1) - m * m) / ((2 * n - 1) * (2 * n - 3));
      if (m > 0) {
        const flnmj = ((n - m + 1) * j) / (n + m);
        snorm[n + m * 13] = snorm[n + (m - 1) * 13] * Math.sqrt(flnmj);
        j = 1;
        c[n][m - 1] = snorm[n + m * 13] * c[n][m - 1];
        cd[n][m - 1] = snorm[n + m * 13] * cd[n][m - 1];
      }
      c[m][n] = snorm[n + m * 13] * c[m][n];
      cd[m][n] = snorm[n + m * 13] * cd[m][n];
    }
  }
  k[1][1] = 0;
}

/**
 * Magnetic declination in degrees (positive = East).
 * @param {number} glat geodetic latitude, degrees
 * @param {number} glon geodetic longitude, degrees (east positive; west may be negative)
 * @param {number} altKm height above the WGS84 ellipsoid, km (GPS altitude is close enough)
 * @param {number} time decimal year; clamped to the model's 2025.0–2030.0 validity window
 */
export function declination(glat, glon, altKm = 0, time = EPOCH) {
  const dt = Math.min(Math.max(time, EPOCH), EPOCH + 5) - EPOCH;
  const dtr = Math.PI / 180;
  const a = 6378.137, b = 6356.7523142, re = 6371.2;
  const a2 = a * a, b2 = b * b, c2 = a2 - b2, a4 = a2 * a2, b4 = b2 * b2, c4 = a4 - b4;

  const rlat = glat * dtr, rlon = glon * dtr;
  const srlon = Math.sin(rlon), crlon = Math.cos(rlon);
  const srlat = Math.sin(rlat), crlat = Math.cos(rlat);
  const srlat2 = srlat * srlat, crlat2 = crlat * crlat;

  // geodetic → spherical geocentric
  const q = Math.sqrt(a2 - c2 * srlat2);
  const q1 = altKm * q;
  const q2 = ((q1 + a2) / (q1 + b2)) * ((q1 + a2) / (q1 + b2));
  let ct = srlat / Math.sqrt(q2 * crlat2 + srlat2);
  let st = Math.sqrt(1 - ct * ct);
  const r2 = altKm * altKm + 2 * q1 + (a4 - c4 * srlat2) / (q * q);
  const r = Math.sqrt(r2);
  const d = Math.sqrt(a2 * crlat2 + b2 * srlat2);
  const ca = (altKm + d) / r;
  const sa = (c2 * crlat * srlat) / (r * d);

  const sp = [0, srlon], cp = [1, crlon];
  for (let m = 2; m <= MAXORD; m++) {
    sp[m] = sp[1] * cp[m - 1] + cp[1] * sp[m - 1];
    cp[m] = cp[1] * cp[m - 1] - sp[1] * sp[m - 1];
  }

  const p = new Array(169).fill(0), dp = new Array(169).fill(0), pp = new Array(13).fill(0);
  p[0] = 1; pp[0] = 1;

  const aor = re / r;
  let ar = aor * aor;
  let br = 0, bt = 0, bp = 0, bpp = 0;

  for (let n = 1; n <= MAXORD; n++) {
    ar *= aor;
    for (let m = 0; m <= n; m++) {
      // associated Legendre polynomials (Schmidt semi-normalized) and derivatives
      if (n === m) {
        p[n + m * 13] = st * p[n - 1 + (m - 1) * 13];
        dp[n + m * 13] = st * dp[n - 1 + (m - 1) * 13] + ct * p[n - 1 + (m - 1) * 13];
      } else if (n === 1 && m === 0) {
        p[n] = ct * p[n - 1];
        dp[n] = ct * dp[n - 1] - st * p[n - 1];
      } else if (n > 1) {
        if (m > n - 2) { p[n - 2 + m * 13] = 0; dp[n - 2 + m * 13] = 0; }
        p[n + m * 13] = ct * p[n - 1 + m * 13] - k[m][n] * p[n - 2 + m * 13];
        dp[n + m * 13] = ct * dp[n - 1 + m * 13] - st * p[n - 1 + m * 13] - k[m][n] * dp[n - 2 + m * 13];
      }

      const tc = c[m][n] + dt * cd[m][n];
      let temp1, temp2;
      if (m === 0) {
        temp1 = tc * cp[m];
        temp2 = tc * sp[m];
      } else {
        const th = c[n][m - 1] + dt * cd[n][m - 1];
        temp1 = tc * cp[m] + th * sp[m];
        temp2 = tc * sp[m] - th * cp[m];
      }
      const par = ar * p[n + m * 13];
      bt -= ar * temp1 * dp[n + m * 13];
      bp += fm[m] * temp2 * par;
      br += fn[n] * temp1 * par;

      // special case: north/south geographic poles
      if (st === 0 && m === 1) {
        pp[n] = n === 1 ? pp[n - 1] : ct * pp[n - 1] - k[1][n] * pp[n - 2];
        const parp = ar * pp[n];
        bpp += fm[m] * temp2 * parp;
      }
    }
  }
  bp = st === 0 ? bpp : bp / st;

  // rotate from geocentric spherical to geodetic frame
  const bx = -bt * ca - br * sa;
  const by = bp;
  return Math.atan2(by, bx) / dtr;
}

/** Current moment as a decimal year, e.g. 2026.81. */
export function toDecimalYear(date) {
  const y = date.getUTCFullYear();
  const start = Date.UTC(y, 0, 1);
  const end = Date.UTC(y + 1, 0, 1);
  return y + (date.getTime() - start) / (end - start);
}
