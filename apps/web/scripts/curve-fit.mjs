/**
 * Core polynomial least-squares fit — used by generate-demo-data.mjs to
 * fabricate realistic historical calibration curves.
 *
 * This is a plain-JS TWIN of the core fit primitives in
 * `apps/web/src/lib/demo/curve-fit.ts` (`polyfit`, `polyval`, `selectDegree`).
 * The generator runs under plain Node and can't import a `.ts` file, so the
 * ~80 lines of Vandermonde/Gaussian-elimination math below are duplicated
 * rather than shared. Keep the two in sync if the fitting algorithm changes —
 * they must produce identical results given the same inputs.
 */

function buildVandermonde(x, degree) {
  return x.map((xi) => {
    const row = new Array(degree + 1);
    for (let k = 0; k <= degree; k++) row[k] = Math.pow(xi, degree - k);
    return row;
  });
}

function transpose(m) {
  return m[0].map((_, col) => m.map((row) => row[col]));
}

function matMul(a, b) {
  const result = [];
  for (let i = 0; i < a.length; i++) {
    const row = [];
    for (let j = 0; j < b[0].length; j++) {
      let sum = 0;
      for (let k = 0; k < b.length; k++) sum += a[i][k] * b[k][j];
      row.push(sum);
    }
    result.push(row);
  }
  return result;
}

function matVec(a, v) {
  return a.map((row) => row.reduce((sum, aij, j) => sum + aij * v[j], 0));
}

/** Solve Ax = b via Gaussian elimination with partial pivoting. */
function solveLinearSystem(a, b) {
  const n = a.length;
  const m = a.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    let pivotRow = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(m[r][col]) > Math.abs(m[pivotRow][col])) pivotRow = r;
    }
    [m[col], m[pivotRow]] = [m[pivotRow], m[col]];

    const pivot = m[col][col];
    if (Math.abs(pivot) < 1e-12) continue;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = m[r][col] / pivot;
      for (let c = col; c <= n; c++) m[r][c] -= factor * m[col][c];
    }
  }

  return m.map((row, i) => (Math.abs(row[i]) < 1e-12 ? 0 : row[row.length - 1] / row[i]));
}

function invertMatrix(a) {
  const n = a.length;
  const m = a.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);

  for (let col = 0; col < n; col++) {
    let pivotRow = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(m[r][col]) > Math.abs(m[pivotRow][col])) pivotRow = r;
    }
    [m[col], m[pivotRow]] = [m[pivotRow], m[col]];

    const pivot = m[col][col];
    if (Math.abs(pivot) < 1e-12) return null;
    for (let c = 0; c < 2 * n; c++) m[col][c] /= pivot;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = m[r][col];
      for (let c = 0; c < 2 * n; c++) m[r][c] -= factor * m[col][c];
    }
  }

  return m.map((row) => row.slice(n));
}

/** Evaluate a polynomial at x. `coefficients` are highest-degree-first (numpy.polyfit convention). */
export function polyval(coefficients, x) {
  let result = 0;
  for (const c of coefficients) result = result * x + c;
  return result;
}

export function generateXRange(min, max, nPoints) {
  const step = (max - min) / (nPoints - 1);
  return Array.from({ length: nPoints }, (_, i) => min + step * i);
}

/**
 * Fit y = f(x) as a degree-N polynomial via least squares.
 * @returns {{ coefficients: number[], covariance: number[][] | null }}
 */
export function polyfit(x, y, degree) {
  const X = buildVandermonde(x, degree);
  const Xt = transpose(X);
  const XtX = matMul(Xt, X);
  const Xty = matVec(Xt, y);
  const coefficients = solveLinearSystem(XtX, Xty);

  let covariance = null;
  const dof = x.length - (degree + 1);
  if (dof > 0) {
    const residuals = x.map((xi, i) => y[i] - polyval(coefficients, xi));
    const sigma2 = residuals.reduce((s, r) => s + r * r, 0) / dof;
    const XtXInv = invertMatrix(XtX);
    if (XtXInv) covariance = XtXInv.map((row) => row.map((v) => v * sigma2));
  }
  return { coefficients, covariance };
}

function aic(n, rss, k) {
  if (rss <= 0 || n <= 0) return Infinity;
  return n * Math.log(rss / n) + 2 * k;
}

/** Auto-select polynomial degree using AIC with a parsimony rule (mirrors calculations.py's `_select_degree`). */
export function selectDegree(x, y, maxDegree = 5) {
  const n = x.length;
  let bestDegree = 1;
  let bestAic = Infinity;
  const upper = Math.min(maxDegree, n - 1);

  for (let d = 1; d <= upper; d++) {
    const { coefficients } = polyfit(x, y, d);
    const rss = x.reduce((s, xi, i) => s + (y[i] - polyval(coefficients, xi)) ** 2, 0);
    const k = d + 1;
    const candidateAic = aic(n, rss, k);
    if (candidateAic < bestAic - 2) {
      bestAic = candidateAic;
      bestDegree = d;
    } else if (d > 1 && candidateAic >= bestAic - 2) {
      break;
    }
  }
  return bestDegree;
}
