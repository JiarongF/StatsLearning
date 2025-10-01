import React, { useMemo, useRef, useState } from "react";

type Pt = { x: number; y: number; id: number };

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const mean = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
const variance = (a: number[]) => {
  const m = mean(a);
  return a.length > 1
    ? a.reduce((s, v) => s + (v - m) * (v - m), 0) / (a.length - 1)
    : 0;
};
const sd = (a: number[]) => Math.sqrt(Math.max(variance(a), 0));

function pearsonR(points: Pt[]): number | null {
  if (points.length < 2) return null;
  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);
  const mx = mean(xs), my = mean(ys);
  const sdx = sd(xs), sdy = sd(ys);
  if (sdx === 0 || sdy === 0) return null;
  const cov =
    points.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0) / (points.length - 1);
  return clamp(cov / (sdx * sdy), -1, 1);
}

function leastSquares(points: Pt[]): { m: number; b: number } | null {
  if (points.length < 2) return null;
  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);
  const mx = mean(xs), my = mean(ys);
  const denom = points.reduce((s, p) => s + (p.x - mx) ** 2, 0);
  if (denom === 0) return null;
  const m = points.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0) / denom;
  const b = my - m * mx;
  return { m, b };
}

interface Props {
  width?: number;
  height?: number;
  padding?: number;
  pointRadius?: number;
  showBestFit?: boolean;
  background?: string;
}

/** Click to add, drag to move, Shift+click (or right-click) to delete */
const CorrelationSketch: React.FC<Props> = ({
  width = 560,
  height = 360,
  padding = 28,
  pointRadius = 5,
  showBestFit = true,
  background = "#fff",
}) => {
  const [pts, setPts] = useState<Pt[]>([]);
  const [hoverId, setHoverId] = useState<number | null>(null);
  const [dragId, setDragId] = useState<number | null>(null);
  const [showLine, setShowLine] = useState(showBestFit);
  const idRef = useRef(0);

  // Data space ranges (fixed 0..100 for simplicity)
  const xMin = 0, xMax = 100, yMin = 0, yMax = 100;

  const innerW = width - 2 * padding;
  const innerH = height - 2 * padding;

  const xToPx = (x: number) => padding + ((x - xMin) / (xMax - xMin)) * innerW;
  const yToPx = (y: number) => padding + innerH - ((y - yMin) / (yMax - yMin)) * innerH;
  const pxToX = (px: number) => xMin + ((px - padding) / innerW) * (xMax - xMin);
  const pxToY = (py: number) =>
    yMin + ((height - padding - py) / innerH) * (yMax - yMin);

  const r = useMemo(() => pearsonR(pts), [pts]);
  const line = useMemo(() => (showLine ? leastSquares(pts) : null), [pts, showLine]);

  const addPoint = (x: number, y: number) => {
    idRef.current += 1;
    setPts(p => [...p, { x, y, id: idRef.current }]);
  };

  const deletePoint = (id: number) => {
    setPts(p => p.filter(q => q.id !== id));
  };

  const handleBackgroundClick: React.MouseEventHandler<SVGRectElement> = (e) => {
    // Ignore if a drag just ended
    if (dragId !== null) return;
    const svg = (e.currentTarget.ownerSVGElement ?? e.currentTarget) as SVGSVGElement;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const cursor = pt.matrixTransform(svg.getScreenCTM()?.inverse());
    const x = clamp(pxToX(cursor.x), xMin, xMax);
    const y = clamp(pxToY(cursor.y), yMin, yMax);
    if (e.shiftKey || e.button === 2) return; // shift-click reserved for deletions on points
    addPoint(x, y);
  };

  const startDrag = (id: number) => setDragId(id);
  const endDrag = () => setDragId(null);

  const onMouseMove: React.MouseEventHandler<SVGSVGElement> = (e) => {
    if (dragId === null) return;
    const svg = e.currentTarget;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const cursor = pt.matrixTransform(svg.getScreenCTM()?.inverse());
    const x = clamp(pxToX(cursor.x), xMin, xMax);
    const y = clamp(pxToY(cursor.y), yMin, yMax);
    setPts(p =>
      p.map(q => (q.id === dragId ? { ...q, x, y } : q))
    );
  };

  const toggleLine = () => setShowLine(s => !s);
  const clearAll = () => setPts([]);
  const undo = () => setPts(p => p.slice(0, -1));

  // Axes ticks (0..100 step 20)
  const ticks = [0, 20, 40, 60, 80, 100];

  // Compute best-fit line endpoints in data space and map to pixels
  let lineSeg: { x1: number; y1: number; x2: number; y2: number } | null = null;
  if (line) {
    const yAt = (x: number) => line.m * x + line.b;
    const x1 = xMin, x2 = xMax;
    const y1 = yAt(x1), y2 = yAt(x2);
    lineSeg = {
      x1: xToPx(x1),
      y1: yToPx(y1),
      x2: xToPx(x2),
      y2: yToPx(y2),
    };
  }

  return (
    <div style={{ fontFamily: "Inter, system-ui, sans-serif", width }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
        <strong>r:</strong>
        <span style={{ fontVariantNumeric: "tabular-nums" }}>
          {r === null ? "—" : r.toFixed(3)}
        </span>
        <button onClick={toggleLine} style={{ padding: "4px 10px", borderRadius: 8 }}>
          {showLine ? "Hide best-fit line" : "Show best-fit line"}
        </button>
        <button onClick={undo} style={{ padding: "4px 10px", borderRadius: 8 }}>Undo</button>
        <button onClick={clearAll} style={{ padding: "4px 10px", borderRadius: 8 }}>Clear</button>
      </div>

      <svg
        width={width}
        height={height}
        onMouseMove={onMouseMove}
        onMouseUp={endDrag}
        onContextMenu={(e) => e.preventDefault()} // prevent context menu for right-click deletes
        style={{ background }}
      >
        {/* Plot area background (click to add) */}
        <rect
          x={padding}
          y={padding}
          width={innerW}
          height={innerH}
          fill="#fafafa"
          stroke="#ddd"
          onMouseDown={handleBackgroundClick}
        />

        {/* X axis */}
        <line
          x1={padding}
          y1={height - padding}
          x2={width - padding}
          y2={height - padding}
          stroke="#999"
        />
        {ticks.map(t => (
          <g key={`xt-${t}`}>
            <line
              x1={xToPx(t)}
              y1={height - padding}
              x2={xToPx(t)}
              y2={height - padding + 6}
              stroke="#999"
            />
            <text
              x={xToPx(t)}
              y={height - padding + 18}
              textAnchor="middle"
              fontSize={11}
              fill="#555"
            >
              {t}
            </text>
          </g>
        ))}
        <text
          x={padding + innerW / 2}
          y={height - 4}
          textAnchor="middle"
          fontSize={12}
          fill="#333"
        >
          X
        </text>

        {/* Y axis */}
        <line
          x1={padding}
          y1={padding}
          x2={padding}
          y2={height - padding}
          stroke="#999"
        />
        {ticks.map(t => (
          <g key={`yt-${t}`}>
            <line
              x1={padding}
              y1={yToPx(t)}
              x2={padding - 6}
              y2={yToPx(t)}
              stroke="#999"
            />
            <text
              x={padding - 10}
              y={yToPx(t) + 3}
              textAnchor="end"
              fontSize={11}
              fill="#555"
            >
              {t}
            </text>
          </g>
        ))}
        <text
          x={12}
          y={padding + innerH / 2}
          transform={`rotate(-90, 12, ${padding + innerH / 2})`}
          textAnchor="middle"
          fontSize={12}
          fill="#333"
        >
          Y
        </text>

        {/* Best-fit line */}
        {showLine && lineSeg && (
          <line
            x1={lineSeg.x1}
            y1={lineSeg.y1}
            x2={lineSeg.x2}
            y2={lineSeg.y2}
            stroke="#444"
            strokeDasharray="6 6"
            strokeWidth={2}
          />
        )}

        {/* Points */}
        {pts.map(p => (
          <g key={p.id} transform={`translate(${xToPx(p.x)}, ${yToPx(p.y)})`}>
            <circle
              r={pointRadius + (hoverId === p.id ? 1 : 0)}
              fill="#3b82f6"
              stroke="#1e40af"
              onMouseEnter={() => setHoverId(p.id)}
              onMouseLeave={() => setHoverId(h => (h === p.id ? null : h))}
              onMouseDown={(e) => {
                if (e.shiftKey || e.button === 2) {
                  deletePoint(p.id);
                } else {
                  startDrag(p.id);
                }
              }}
            />
          </g>
        ))}
      </svg>

      <div style={{ fontSize: 12, color: "#666", marginTop: 8, lineHeight: 1.4 }}>
        Tip: Click to add a point. Drag a point to move it. Shift-click (or right-click) a point to delete.
      </div>
    </div>
  );
};

export default CorrelationSketch;
