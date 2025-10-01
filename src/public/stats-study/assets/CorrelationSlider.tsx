import React, { useState, useMemo } from 'react';

interface DataPoint { x: number; y: number; }

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
  const X0 = Array.from({length:n}, () => boxMuller(rng).z1);
  const Z0 = Array.from({length:n}, () => boxMuller(rng).z2);
  const Xs = zscore(X0);
  const denom = Xs.reduce((s,x)=>s+x*x,0) || 1e-12;
  const beta = Xs.reduce((s,x,i)=>s+x*Z0[i],0) / denom;
  const Zperp = zscore(Z0.map((z,i)=> z - beta*Xs[i]));
  return { Xs, Zperp };
}

function generateCorrelationData(
  r: number,
  n = 100,
  seed = 777,
  xRange: [number, number] = [0, 10],
  yRange: [number, number] = [0, 10]
): DataPoint[] {
  const rr = Math.max(-0.999, Math.min(0.999, r));
  const { Xs, Zperp } = makeBase(n, seed);
  const Y0 = Xs.map((x, i) => rr * x + Math.sqrt(1 - rr * rr) * Zperp[i]);
  const cx = 0.5 * (xRange[0] + xRange[1]);
  const cy = 0.5 * (yRange[0] + yRange[1]);
  const xSpan = Math.max(1e-9, xRange[1] - xRange[0]);
  const ySpan = Math.max(1e-9, yRange[1] - yRange[0]);
  const sx0 = sd(Xs);
  const sy0 = sd(Y0);
  const padFrac = 0.05;
  const halfX = 0.5 * xSpan * (1 - padFrac);
  const halfY = 0.5 * ySpan * (1 - padFrac);
  const sigmaThreshold = 2.5;
  const a = Math.max(1e-9, halfX / (sigmaThreshold * sx0) * 0.95);
  const Xp = Xs.map(x => cx + a * x);
  const scaleY = a * (sy0 || 1);
  const Yp = Y0.map(y => cy + (y / (sy0 || 1)) * scaleY);
  return Xp.map((x, i) => ({ x, y: Yp[i] }));
}

const CorrelationSlider: React.FC = () => {
  const [correlation, setCorrelation] = useState(0.5);

  const data = useMemo(
    () => generateCorrelationData(correlation, 100, 777, [0, 10], [0, 10]),
    [correlation]
  );

  const width = 600;
  const height = 500;
  const leftMargin = 60;
  const rightMargin = 36;
  const topMargin = 36;
  const bottomMargin = 60;
  const pointColor = '#228be6';
  const pointRadius = 4;

  const plotWidth = width - leftMargin - rightMargin;
  const plotHeight = height - topMargin - bottomMargin;

  const xRange: [number, number] = [0, 10];
  const yRange: [number, number] = [0, 10];
  const pad = 0.03;
  const xMid = 5;
  const yMid = 5;
  const xHalf = 5 * (1 + pad * 2);
  const yHalf = 5 * (1 + pad * 2);
  const xMin = xMid - xHalf;
  const xMax = xMid + xHalf;
  const yMin = yMid - yHalf;
  const yMax = yMid + yHalf;

  const xScale = (x: number) => ((x - xMin) / (xMax - xMin)) * plotWidth + leftMargin;
  const yScale = (y: number) => height - (((y - yMin) / (yMax - yMin)) * plotHeight + bottomMargin);

  return (
    <div style={{
      width: '100%',
      maxWidth: '896px',
      margin: '0 auto',
      padding: '24px',
      background: 'linear-gradient(135deg, #f8fafc 0%, #eff6ff 100%)',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      minHeight: '100vh',
      boxSizing: 'border-box'
    }}>
      <div style={{
        marginBottom: '32px',
        padding: '24px',
        backgroundColor: '#ffffff',
        borderLeft: '4px solid #3b82f6',
        borderRadius: '8px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
      }}>
        <h2 style={{
          fontSize: '20px',
          fontWeight: 'bold',
          color: '#1f2937',
          margin: '0 0 12px 0',
          textAlign: 'center'
        }}>
          📊 Positive Correlation
        </h2>
        <p style={{ fontSize: '14px', lineHeight: '1.6', color: '#374151', margin: '0 0 8px 0' }}>
          The scatterplot shows a set of simulated data points. These values don't come from a real dataset — they are randomly generated — but they are constructed so the relationship between X and Y matches the correlation (<em>r</em>) you choose.
        </p>
        <p style={{ fontSize: '14px', lineHeight: '1.6', color: '#374151', margin: '0 0 8px 0' }}>
          Use the slider below to set the correlation value (<em>r</em>). As you adjust the slider, the scatterplot will move the points so their relationship matches the chosen value.
        </p>
        <p style={{ fontSize: '14px', lineHeight: '1.6', color: '#1d4ed8', fontWeight: '600', margin: '0 0 8px 0' }}>
          Please interact with the scatterplot and explore different correlation values using the slider for <strong>at least 1 minute</strong>.
        </p>
        <p style={{ fontSize: '14px', lineHeight: '1.6', color: '#6b7280', fontStyle: 'italic', margin: '0' }}>
          🎙️ Please remember to think-aloud as you explore the tutorial!
        </p>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px' }}>
        <div style={{
          padding: '16px',
          backgroundColor: '#ffffff',
          borderRadius: '8px',
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
          boxSizing: 'border-box'
        }}>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center', 
            marginBottom: '12px',
            fontSize: '20px',
            fontWeight: 'bold',
            color: '#2563eb'
          }}>
            Correlation (r) = {correlation.toFixed(1)}
          </div>
          <svg width={width} height={height} style={{ background: 'white', display: 'block' }}>
            <defs>
              <clipPath id="clip-plot">
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

            <g clipPath="url(#clip-plot)">
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
                  style={{ 
                    filter: 'brightness(0.9)',
                    transition: 'cx 0.5s ease-out, cy 0.5s ease-out'
                  }}
                />
              ))}
            </g>
          </svg>
        </div>
      </div>

      <div style={{
        width: `${width + 32}px`,
        margin: '0 auto',
        paddingLeft: '16px',
        paddingRight: '16px',
        boxSizing: 'border-box'
      }}>
        <div style={{ marginBottom: '12px' }}>
          <label style={{ fontSize: '15px', fontWeight: '500', color: '#6b7280', display: 'block' }}>
            Adjust Correlation
          </label>
        </div>
        <input
          type="range"
          min="0"
          max="1"
          step="0.1"
          value={correlation}
          onChange={(e) => setCorrelation(parseFloat(e.target.value))}
          style={{
            width: '100%',
            height: '12px',
            borderRadius: '8px',
            appearance: 'none',
            WebkitAppearance: 'none',
            cursor: 'pointer',
            outline: 'none',
            background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${correlation * 100}%, #e5e7eb ${correlation * 100}%, #e5e7eb 100%)`
          }}
        />
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: '12px',
          color: '#6b7280',
          marginTop: '8px',
          paddingLeft: '4px',
          paddingRight: '4px'
        }}>
          {[0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0].map(v => (
            <span key={v}>{v.toFixed(1)}</span>
          ))}
        </div>
      </div>
    </div>
  );
};

export default CorrelationSlider;