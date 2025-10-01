import React, { useMemo } from "react";

/* ---------- Types ---------- */
interface Pt { x: number; y: number; }
interface Props {
  width?: number;
  height?: number;
  seed?: number;
  targetR?: number;
  nLine?: number;
  nTL?: number;
  nBR?: number;
  pointRadius?: number;
  pointColor?: string;
  showTitle?: boolean;
}

/* ---------- Math helpers ---------- */
const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
const sd = (a: number[]) => {
  const m = mean(a);
  const v = a.reduce((s, v) => s + (v - m) ** 2, 0) / Math.max(1, a.length - 1);
  return Math.sqrt(Math.max(v, 1e-12));
};
const pearson = (x:number[], y:number[]) => {
  const mx = mean(x), my = mean(y), sx = sd(x)||1, sy = sd(y)||1;
  let s = 0; for (let i=0;i<x.length;i++) s += ((x[i]-mx)/sx)*((y[i]-my)/sy);
  return s / x.length;
};

/* ---------- Deterministic RNG ---------- */
class RNG {
  private s: number;
  constructor(seed=123456789){ this.s = seed>>>0; }
  next(){ this.s = (1664525*this.s + 1013904223) >>> 0; return this.s; }
  u(a=0,b=1){ return a + (this.next()/0xffffffff)*(b-a); }
  n(mu=0,sig=1){
    const u1 = Math.max(1e-12, this.u()), u2 = Math.max(1e-12, this.u());
    const z = Math.sqrt(-2*Math.log(u1))*Math.cos(2*Math.PI*u2);
    return mu + sig*z;
  }
}

/* ---------- Samplers ---------- */
const pad = 2;
const inBounds = (x:number,y:number) => x>=pad && x<=100-pad && y>=pad && y<=100-pad;

function sampleBandPoint(rng: RNG, slope=0.75, intercept=5, noise=4): Pt {
  for (let k=0;k<50;k++){
    const x = rng.u(2, 98);
    const y = intercept + slope*x + rng.n(0, noise);
    if (inBounds(x,y)) return { x, y };
  }
  const x = Math.min(98, Math.max(2, rng.u(2,98)));
  const y = Math.min(98, Math.max(2, intercept + slope*x));
  return { x, y };
}

function sampleCluster(rng: RNG, cx:number, cy:number, sdX=2.0, sdY=2.0): Pt {
  for (let k=0;k<50;k++){
    const x = rng.n(cx, sdX), y = rng.n(cy, sdY);
    if (inBounds(x,y)) return { x, y };
  }
  return { x: Math.min(98, Math.max(2, cx)), y: Math.min(98, Math.max(2, cy)) };
}

/* Build one dataset with a given band noise */
function build(rng: RNG, nLine:number, nTL:number, nBR:number, bandNoise:number){
  const pts: Pt[] = [];
  for (let i=0;i<nLine;i++) pts.push(sampleBandPoint(rng, 0.7, 5, bandNoise));
  
  // Generate symmetric clusters - store top-left points and mirror them
  const tlPoints: Pt[] = [];
  for (let i=0;i<nTL;i++) {
    const pt = sampleCluster(rng, 10, 90, 2.3, 2.3);
    tlPoints.push(pt);
    pts.push(pt);
  }
  
  // Mirror top-left points to create bottom-right cluster with identical structure
  for (let i=0;i<Math.min(nBR, tlPoints.length);i++) {
    const pt = tlPoints[i];
    const dx = pt.x - 10;
    const dy = pt.y - 90;
    pts.push({ x: 90 + dy, y: 10 + dx });
  }
  
  const xs = pts.map(p=>p.x), ys = pts.map(p=>p.y);
  return { pts, r: pearson(xs, ys) };
}

/* Tune noise with binary search so r ≈ target */
function makeTarget(seed:number, nLine:number, nTL:number, nBR:number, targetR:number, tol=0.015){
  let lo = 1.0, hi = 10.0;
  let best = { pts: [] as Pt[], r: 0, err: Infinity };
  for (let it=0; it<28; it++){
    const mid = (lo+hi)/2;
    const out = build(new RNG(seed + it*7919), nLine, nTL, nBR, mid);
    const err = Math.abs(out.r - targetR);
    if (err < best.err) best = { pts: out.pts, r: out.r, err };
    if (out.r > targetR) lo = mid; else hi = mid;
    if (err <= tol) return { points: out.pts, r: out.r };
  }
  return { points: best.pts, r: best.r };
}

/* ---------- Scales & SVG ---------- */
function scale(d:number, [d0,d1]:[number,number], [r0,r1]:[number,number]){
  const t = (d - d0) / (d1 - d0 || 1);
  return r0 + t*(r1 - r0);
}

const MixtureRHalf: React.FC<Props> = ({
  width = 412,
  height = 400,
  seed = 95,
  targetR = 0.5,
  nLine = 70,
  nTL = 5,
  nBR = 5,
  pointRadius = 3,
  pointColor = '#228be6',
  showTitle = true,
}) => {
  const leftMargin = 60;
  const rightMargin = 36;
  const topMargin = 36;
  const bottomMargin = 36;

  const { points, r } = useMemo(
    () => makeTarget(seed, nLine, nTL, nBR, targetR, 0.005),
    [seed, nLine, nTL, nBR, targetR]
  );

  const plotWidth = width - leftMargin - rightMargin;
  const plotHeight = height - topMargin - bottomMargin;

  const sx = (x:number) => scale(x, [0,100], [leftMargin, width - rightMargin]);
  const sy = (y:number) => scale(y, [0,100], [height - bottomMargin, topMargin]);

  const clipId = useMemo(() => `clip-${Math.abs(seed % 1000000)}`, [seed]);

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

          {/* Grid lines */}
          {[0.25, 0.5, 0.75].map(tick => (
            <g key={tick}>
              <line 
                x1={leftMargin + tick * plotWidth} 
                y1={topMargin} 
                x2={leftMargin + tick * plotWidth} 
                y2={height - bottomMargin} 
                stroke="#f1f3f4" 
                strokeWidth={1}
              />
              <line 
                x1={leftMargin} 
                y1={topMargin + tick * plotHeight} 
                x2={width - rightMargin} 
                y2={topMargin + tick * plotHeight} 
                stroke="#f1f3f4" 
                strokeWidth={1}
              />
            </g>
          ))}

          {/* Axes */}
          <line 
            x1={leftMargin} 
            y1={height - bottomMargin} 
            x2={width - rightMargin} 
            y2={height - bottomMargin} 
            stroke="#495057" 
            strokeWidth={2}
          />
          <line 
            x1={leftMargin} 
            y1={topMargin} 
            x2={leftMargin} 
            y2={height - bottomMargin} 
            stroke="#495057" 
            strokeWidth={2}
          />

          {/* Points */}
          <g clipPath={`url(#${clipId})`}>
            {points.map((p, i) => (
              <circle
                key={i}
                cx={sx(p.x)}
                cy={sy(p.y)}
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

export default MixtureRHalf;