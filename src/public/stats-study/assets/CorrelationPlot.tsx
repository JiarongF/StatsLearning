import React, { useMemo } from 'react';

/* -------------------- Types -------------------- */
interface DataPoint { x: number; y: number; }
interface CorrelationPlotProps {
  correlation?: number;              // r in [-1, 1]
  slope?: number | null;             // desired slope magnitude; sign comes from r
  seed?: number;
  numPoints?: number;
  width?: number;
  height?: number;
  xRange?: [number, number];
  yRange?: [number, number];
  pointColor?: string;
  pointRadius?: number;
  showTitle?: boolean;
  showSlope?: boolean;               // (unused in this code, left for compat)
  showSlopeLine?: boolean;
  domainPadFrac?: number;            // padding applied to fixed ranges
  leftMargin?: number;
  rightMargin?: number;
  topMargin?: number;
  bottomMargin?: number;
  parameters?: Record<string, any>;

  /** NEW: choose how axes are computed. 'fixed' recommended for comparisons */
  axisMode?: 'fixed' | 'tight';
}

/* -------------------- tiny coercion helpers -------------------- */
const isNil = (v: any) => v === undefined || v === null || v === '';
const num = (v: any, d: number) => {
  if (isNil(v)) return d;
  const n = Number(typeof v === 'string' ? v.trim() : v);
  return Number.isFinite(n) ? n : d;
};
const bool = (v: any, d: boolean) => {
  if (isNil(v)) return d;
  if (typeof v === 'boolean') return v;
  const s = String(v).toLowerCase().trim();
  return s === 'true' || s === '1' ? true : s === 'false' || s === '0' ? false : d;
};
const range = (v: any, d: [number, number]): [number, number] => {
  if (isNil(v)) return d;
  if (Array.isArray(v) && v.length >= 2) return [num(v[0], d[0]), num(v[1], d[1])];
  if (typeof v === 'string') {
    const s = v.replace(/[\[\]\(\)\s]/g, '');
    const parts = s.split(/,|;|:|\.\.|-/).filter(Boolean);
    if (parts.length >= 2) return [num(parts[0], d[0]), num(parts[1], d[1])];
  }
  return d;
};

/* -------------------- helpers -------------------- */
const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
const sd = (a: number[]) => {
  const m = mean(a);
  const v = a.reduce((s, v) => s + (v - m) ** 2, 0) / Math.max(1, a.length - 1);
  return Math.sqrt(Math.max(v, 1e-12));
};
const zscore = (a: number[]) => {
  const m = mean(a), s = sd(a) || 1;
  return a.map(v => (v - m) / s);
};

class SeededRandom {
  private seed: number;
  constructor(seed: number){ this.seed = seed >>> 0; }
  random(){ this.seed = (1664525*this.seed + 1013904223)>>>0; return this.seed/0x100000000; }
}

function boxMuller(rng: SeededRandom){
  let u1=0;
  while(u1===0) u1=rng.random();
  const u2=rng.random();
  const R=Math.sqrt(-2*Math.log(u1));
  return { z1: R*Math.cos(2*Math.PI*u2), z2: R*Math.sin(2*Math.PI*u2) };
}

function makeBase(n: number, seed: number){
  const rng = new SeededRandom(seed);
  // Generate two independent standard-normal streams
  const X0 = Array.from({length:n}, () => boxMuller(rng).z1);
  const Z0 = Array.from({length:n}, () => boxMuller(rng).z2);
  const Xs = zscore(X0);

  // Orthogonalize Z0 against Xs for numerical stability
  const denom = Xs.reduce((s,x)=>s+x*x,0) || 1e-12;
  const beta = Xs.reduce((s,x,i)=>s+x*Z0[i],0) / denom;
  const Zperp = zscore(Z0.map((z,i)=> z - beta*Xs[i]));
  return { Xs, Zperp };
}

/**
 * Generate correlated (X, Y) with correlation r.
 * If targetSlope is provided, we set sd(Y)/sd(X) so that the *OLS slope*
 * is |targetSlope| but the SIGN of the slope (and of the relationship)
 * is determined by the sign of r. This guarantees consistency:
 *   sign(slope) === sign(r)
 * which is a mathematical identity when X, Y are centered.
 */
function generateCorrelationSlopeData(
  r: number,
  targetSlope: number | null,
  n = 100,
  seed = 777,
  xRange: [number, number] = [0, 10],
  yRange: [number, number] = [0, 10]
): { data: DataPoint[]; actualSlope: number } {
  // keep r in range
  const rr = Math.max(-0.999, Math.min(0.999, r));
  const rSign = Math.sign(rr) || 1;       // define sign for r=0 edge
  const rAbs = Math.max(Math.abs(rr), 1e-6);

  const { Xs, Zperp } = makeBase(n, seed);

  // Standardized base Y before scaling into the box
  // This ensures Corr(Xs, Y0) ~= rr
  const Y0 = Xs.map((x, i) => rr * x + Math.sqrt(1 - rr * rr) * Zperp[i]);

  // Box (data-units) info
  const cx = 0.5 * (xRange[0] + xRange[1]);
  const cy = 0.5 * (yRange[0] + yRange[1]);
  const xSpan = Math.max(1e-9, xRange[1] - xRange[0]);
  const ySpan = Math.max(1e-9, yRange[1] - yRange[0]);

  const sx0 = sd(Xs);           // ~1
  const sy0 = sd(Y0);           // ~1

  // How many sds should fit inside half-ranges
  const padFrac = 0.05;         // breathing room
  const halfX = 0.5 * xSpan * (1 - padFrac);
  const halfY = 0.5 * ySpan * (1 - padFrac);
  const sigmaThreshold = 2.5;   // most points stay in-bounds

  // Decide X scaling (a). If targetSlope provided, also enforce Y sd.
  let a: number;

  if (targetSlope !== null && Number.isFinite(targetSlope)) {
    // IMPORTANT: slope sign must match corr sign (mathematically true)
    // We take only the magnitude from targetSlope.
    const mAbs = Math.abs(targetSlope);

    // For centered vars, OLS slope = r * (sdY / sdX).
    // So sdY / sdX should be mAbs / |r|.
    // We'll set sdX = a*sx0, sdY = (mAbs/rAbs)*a*sx0, subject to box constraints.
    const mAbsOverR = mAbs / rAbs;

    const a_max_x = halfX / (sigmaThreshold * sx0);
    const a_max_y = halfY / (sigmaThreshold * sx0 * mAbsOverR);
    a = Math.max(1e-9, Math.min(a_max_x, a_max_y) * 0.95);

    const desiredSy = mAbsOverR * a * sx0;
    const scaleY = desiredSy / (sy0 || 1);

    // NO sign flip: sign(slope) should equal sign(r).
    // Therefore we just scale Y0; its sign already matches rr.
    const Xp = Xs.map(x => cx + a * x);
    const Yp = Y0.map(y => cy + scaleY * y);

    // Compute actual slope (least-squares) in data coords
    const xMean = mean(Xp);
    const yMean = mean(Yp);
    const numCov = Xp.reduce((s, x, i) => s + (x - xMean) * (Yp[i] - yMean), 0);
    const denVar = Xp.reduce((s, x) => s + (x - xMean) ** 2, 0);
    const actualSlope = denVar > 0 ? numCov / denVar : 0;

    return { data: Xp.map((x, i) => ({ x, y: Yp[i] })), actualSlope };
  }

  // No explicit slope target: scale X to box; Y follows to preserve r and natural spread
  a = Math.max(1e-9, halfX / (sigmaThreshold * sx0) * 0.95);

  const Xp = Xs.map(x => cx + a * x);
  const scaleY = a * (sy0 || 1);        // keep comparable spread
  const Yp = Y0.map(y => cy + (y / (sy0 || 1)) * scaleY);

  const xMean = mean(Xp);
  const yMean = mean(Yp);
  const numCov = Xp.reduce((s, x, i) => s + (x - xMean) * (Yp[i] - yMean), 0);
  const denVar = Xp.reduce((s, x) => s + (x - xMean) ** 2, 0);
  const actualSlope = denVar > 0 ? numCov / denVar : 0;

  return { data: Xp.map((x, i) => ({ x, y: Yp[i] })), actualSlope };
}

/* -------------------- Component -------------------- */
const CorrelationPlot: React.FC<CorrelationPlotProps> = (props) => {
  const p = props.parameters ?? {};

  const correlation = num(p.correlation ?? props.correlation, 0.7);
  const slope = (isNil(p.slope) && isNil(props.slope)) ? null : num(p.slope ?? props.slope, 1);
  const seed = num(p.seed ?? props.seed, 777);
  const numPoints = num(p.numPoints ?? props.numPoints, 100);
  const width = num(p.width ?? props.width, 412);
  const height = num(p.height ?? props.height, 400);
  const xRange = range(p.xRange ?? props.xRange, [0, 10]);
  const yRange = range(p.yRange ?? props.yRange, [0, 10]);
  const pointColor = (p.pointColor ?? props.pointColor ?? '#228be6') as string;
  const pointRadius = num(p.pointRadius ?? props.pointRadius, 3);
  const domainPadFrac = num(p.domainPadFrac ?? props.domainPadFrac, 0.03);

  const leftMargin = num(p.leftMargin ?? props.leftMargin, 60);
  const rightMargin = num(p.rightMargin ?? props.rightMargin, 36);
  const topMargin = num(p.topMargin ?? props.topMargin, 36);
  const bottomMargin = num(p.bottomMargin ?? props.bottomMargin, 36);

  const showTitle = bool(p.showTitle ?? props.showTitle, false);
  const showSlopeLine = bool(p.showSlopeLine ?? props.showSlopeLine, false);

  const axisMode = (p.axisMode ?? props.axisMode ?? 'fixed') as 'fixed' | 'tight';

  const r = Number.isFinite(Number(correlation)) ? Number(correlation) : 0;

  const { data, actualSlope } = useMemo(
    () => generateCorrelationSlopeData(r, slope, numPoints, seed, xRange, yRange),
    [r, slope, numPoints, seed, xRange, yRange]
  );

  const plotWidth = Math.max(1, width - leftMargin - rightMargin);
  const plotHeight = Math.max(1, height - topMargin - bottomMargin);

  const eps = 1e-9;

  // ===== Axes =====
  let xMin: number, xMax: number, yMin: number, yMax: number;

  if (axisMode === 'fixed') {
    // Use provided ranges; apply optional padding ONCE (consistent across plots)
    const pad = domainPadFrac;
    const xMid = 0.5 * (xRange[0] + xRange[1]);
    const yMid = 0.5 * (yRange[0] + yRange[1]);
    const xHalf = 0.5 * (xRange[1] - xRange[0]) * (1 + pad * 2);
    const yHalf = 0.5 * (yRange[1] - yRange[0]) * (1 + pad * 2);
    xMin = xMid - xHalf; xMax = xMid + xHalf;
    yMin = yMid - yHalf; yMax = yMid + yHalf;
  } else {
    // Tight fit to data (optional, but not good for comparing slopes visually)
    const rawXMin = Math.min(...data.map(d => d.x));
    const rawXMax = Math.max(...data.map(d => d.x));
    const rawYMin = Math.min(...data.map(d => d.y));
    const rawYMax = Math.max(...data.map(d => d.y));
    const xSpan0 = Math.max(eps, rawXMax - rawXMin);
    const ySpan0 = Math.max(eps, rawYMax - rawYMin);
    xMin = rawXMin - xSpan0 * domainPadFrac;
    xMax = rawXMax + xSpan0 * domainPadFrac;
    yMin = rawYMin - ySpan0 * domainPadFrac;
    yMax = rawYMax + ySpan0 * domainPadFrac;
  }

  const xScale = (x: number) =>
    ((x - xMin) / Math.max(eps, xMax - xMin)) * plotWidth + leftMargin;
  const yScale = (y: number) =>
    height - (((y - yMin) / Math.max(eps, yMax - yMin)) * plotHeight + bottomMargin);

  const clipId = useMemo(
    () => `clip-${Math.abs(((seed ^ numPoints) + width + height) % 1_000_000)}`,
    [seed, numPoints, width, height]
  );

  // Regression line for display (in *data* coords)
  const xMean = mean(data.map(d => d.x));
  const yMean = mean(data.map(d => d.y));
  const intercept = yMean - actualSlope * xMean;
  const lineX1 = xMin;
  const lineY1 = actualSlope * lineX1 + intercept;
  const lineX2 = xMax;
  const lineY2 = actualSlope * lineX2 + intercept;

  return (
    <div style={{ display: 'inline-block' }}>
      {showTitle && (
        <div style={{ textAlign: 'center', marginBottom: 10, fontWeight: 700, fontSize: 20 }}>
          Estimate the correlation of this scatterplot
        </div>
      )}

      <div style={{ padding: '0.35rem', background: 'white', borderRadius: 8, boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
        <svg width={width} height={height} style={{ background: 'white' }}>
          <defs>
            <clipPath id={clipId}>
              <rect x={leftMargin} y={topMargin} width={plotWidth} height={plotHeight} />
            </clipPath>
          </defs>

          {[0.25, 0.5, 0.75].map(tick => (
            <g key={tick}>
              <line x1={leftMargin + tick * plotWidth} y1={topMargin} x2={leftMargin + tick * plotWidth} y2={height - bottomMargin} stroke="#f1f3f4" strokeWidth={1}/>
              <line x1={leftMargin} y1={topMargin + tick * plotHeight} x2={width - rightMargin} y2={topMargin + tick * plotHeight} stroke="#f1f3f4" strokeWidth={1}/>
            </g>
          ))}

          <line x1={leftMargin} y1={height - bottomMargin} x2={width - rightMargin} y2={height - bottomMargin} stroke="#495057" strokeWidth={2}/>
          <line x1={leftMargin} y1={topMargin} x2={leftMargin} y2={height - bottomMargin} stroke="#495057" strokeWidth={2}/>

          <g clipPath={`url(#${clipId})`}>
            {showSlopeLine && (
              <line
                x1={xScale(lineX1)}
                y1={yScale(lineY1)}
                x2={xScale(lineX2)}
                y2={yScale(lineY2)}
                stroke="#e03131"
                strokeWidth={2}
                strokeDasharray="5,5"
                opacity={0.7}
              />
            )}
            {data.map((p, i) => (
              <circle
                key={i}
                cx={xScale(p.x)}
                cy={yScale(p.y)}
                r={pointRadius}
                fill={pointColor}
                fillOpacity={0.7}
                stroke={pointColor}
                strokeWidth={1}
                style={{ filter: 'brightness(0.9)' }}
              />
            ))}
          </g>
        </svg>
      </div>
    </div>
  );
};

export default CorrelationPlot;
