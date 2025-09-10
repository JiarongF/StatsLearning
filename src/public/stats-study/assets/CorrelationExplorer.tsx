import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from 'react';
import {
  Card,
  Title,
  Text,
  Slider,
  Stack,
  Group,
} from '@mantine/core';
import * as d3 from 'd3';
import { initializeTrrack, Registry } from '@trrack/core';
import type { StimulusParams } from '../../../store/types';

interface Point {
  x: number;
  y: number;
}

type Mode = 'positive' | 'negative';

type Props = StimulusParams<any, any> & {
  mode?: Mode; // default 'positive'
};

/** ---------- utilities ---------- */

// Keep base normals stable across re-generations
let cachedBasePoints: { x: number; y: number }[] | null = null;

/**
 * Make generated points whose *sample* correlation equals targetCorrelation.
 * Key: orthogonalize Y against X before mixing.
 * Works for any targetCorrelation in [-1, 1].
 */
function generateCorrelatedData(targetCorrelation: number, n = 30): Point[] {
  // 1) Stable base normals
  if (!cachedBasePoints || cachedBasePoints.length !== n) {
    const rng = d3.randomLcg(42);
    const randNorm = d3.randomNormal.source(rng)(0, 1);
    cachedBasePoints = Array.from({ length: n }, () => ({
      x: randNorm(),
      y: randNorm(),
    }));
  }

  // 2) Center & normalize to unit variance
  const xs0 = cachedBasePoints.map((p) => p.x);
  const ys0 = cachedBasePoints.map((p) => p.y);
  const meanX = d3.mean(xs0)!;
  const meanY = d3.mean(ys0)!;
  const xC = xs0.map((v) => v - meanX);
  const yC = ys0.map((v) => v - meanY);
  const stdX = Math.sqrt(d3.variance(xC)!);
  const stdY = Math.sqrt(d3.variance(yC)!);
  const x = xC.map((v) => v / stdX);
  const y = yC.map((v) => v / stdY);

  // 3) Gram–Schmidt: remove projection of y on x
  const dotXY = d3.sum(x.map((vx, i) => vx * y[i]));
  const dotXX = d3.sum(x.map((vx) => vx * vx));
  const proj = dotXY / dotXX;
  const yPerp = y.map((vy, i) => vy - proj * x[i]);

  // 4) Normalize yPerp to unit variance
  const yPerpMean = d3.mean(yPerp)!;
  const yPerpC = yPerp.map((v) => v - yPerpMean);
  const yPerpStd = Math.sqrt(d3.variance(yPerpC)!);
  const yHat = yPerpC.map((v) => v / yPerpStd);

  // 5) Mix to achieve the exact sample correlation (up to floating error)
  const yCorr = x.map(
    (vx, i) =>
      targetCorrelation * vx +
      Math.sqrt(1 - targetCorrelation * targetCorrelation) * yHat[i],
  );

  // 6) Scale independently to [0.5, 9.5] (affine transforms preserve r)
  const xRange = d3.extent(x) as [number, number];
  const yRange = d3.extent(yCorr) as [number, number];
  const sx = d3.scaleLinear().domain(xRange).range([0.5, 9.5]);
  const sy = d3.scaleLinear().domain(yRange).range([0.5, 9.5]);

  return x.map((vx, i) => ({
    x: sx(vx),
    y: sy(yCorr[i]),
  }));
}

function computePearsonR(data: Point[]): number | null {
  if (data.length < 2) return null;
  const xs = data.map((d) => d.x);
  const ys = data.map((d) => d.y);
  const meanX = d3.mean(xs);
  const meanY = d3.mean(ys);
  if (meanX === undefined || meanY === undefined) return null;
  const num = d3.sum(xs.map((x, i) => (x - meanX) * (ys[i] - meanY)));
  const den =
    Math.sqrt(d3.sum(xs.map((x) => (x - meanX) ** 2))) *
    Math.sqrt(d3.sum(ys.map((y) => (y - meanY) ** 2)));
  return den === 0 ? null : num / den;
}

// Avoid displaying "-0.00"
function formatR(r: number | null) {
  if (r === null) return null;
  const val = Object.is(r, -0) ? 0 : r;
  return val.toFixed(2);
}

export default function CorrelationExplorerUnified({
  parameters,
  setAnswer,
  provenanceState,
  mode = 'positive',
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const gRef = useRef<SVGGElement | null>(null);
  const genGroupRef = useRef<SVGGElement | null>(null);

  // For RAF animation
  const prevPointsRef = useRef<Point[] | null>(null);
  const animIdRef = useRef<number | null>(null);

  // Mode-dependent config
  const { title, sliderMin, sliderMax, initialCorr, helpTextRange } = useMemo(() => {
    if (mode === 'negative') {
      return {
        title: 'Negative Correlation',
        sliderMin: -1,
        sliderMax: 0,
        initialCorr: -0.8,
        helpTextRange: 'between -1.0 and 0.0',
      };
    }
    return {
      title: 'Positive Correlation',
      sliderMin: 0,
      sliderMax: 1,
      initialCorr: 0.8,
      helpTextRange: 'between 0.0 and 1.0',
    };
  }, [mode]);

  // State
  const [correlationStrength, setCorrelationStrength] = useState<number>(initialCorr);
  const [generatedPoints, setGeneratedPoints] = useState<Point[]>([]);

  // Chart dimensions
  const width = 400;
  const height = 380;
  const margin = { top: 20, right: 20, bottom: 40, left: 40 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  // Scales
  const xScale = useMemo(
    () => d3.scaleLinear().domain([0, 10]).range([0, innerWidth]),
    [innerWidth],
  );
  const yScale = useMemo(
    () => d3.scaleLinear().domain([0, 10]).range([innerHeight, 0]),
    [innerHeight],
  );

  // Trrack (only slider changes now) — recreate when mode changes so initial state matches
  const { actions, trrack } = useMemo(() => {
    const reg = Registry.create();
    const sliderChange = reg.register('sliderChange', (state, value: number) => {
      state.correlationStrength = value;
      return state;
    });
    const trrackInst = initializeTrrack({
      registry: reg,
      initialState: {
        correlationStrength: initialCorr,
        mode,
      },
    });
    return { actions: { sliderChange }, trrack: trrackInst };
  }, [initialCorr, mode]);

  // Re-seed slider when mode changes
  useEffect(() => {
    setCorrelationStrength(initialCorr);
    const initial = generateCorrelatedData(initialCorr);
    prevPointsRef.current = initial;
    setGeneratedPoints(initial);
  }, [initialCorr, mode]);

  // Initialize SVG
  useEffect(() => {
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const g = svg
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);
    gRef.current = g.node() as SVGGElement;

    // Axes
    g.append('g')
      .attr('class', 'x-axis')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(d3.axisBottom(xScale));
    g.append('g').attr('class', 'y-axis').call(d3.axisLeft(yScale));

    // Axis labels
    svg
      .append('text')
      .attr('x', margin.left + innerWidth / 2)
      .attr('y', height - 5)
      .attr('text-anchor', 'middle')
      .text('X');
    svg
      .append('text')
      .attr('transform', 'rotate(-90)')
      .attr('x', -height / 2)
      .attr('y', 15)
      .attr('text-anchor', 'middle')
      .text('Y');

    // Point group
    const genG = g.append('g').attr('class', 'gen-points');
    genGroupRef.current = genG.node() as SVGGElement;
  }, [height, innerHeight, innerWidth, margin.left, xScale, yScale]);

  // ReVISit answer
  const updateAnswer = useCallback(() => {
    setAnswer({
      status: true,
      provenanceGraph: trrack.graph.backend,
      answers: {},
    });
  }, [setAnswer, trrack]);

  useEffect(() => {
    setAnswer({
      status: true,
      provenanceGraph: trrack.graph.backend,
      answers: {},
    });
  }, [setAnswer, trrack]);

  // Load provenance (supports correlationStrength only)
  useEffect(() => {
    if (provenanceState && provenanceState.correlationStrength !== undefined) {
      setCorrelationStrength(provenanceState.correlationStrength);
    }
  }, [provenanceState]);

  /** ---------- Smooth per-point tween to new correlation ---------- */
  const animateTo = useCallback((nextCorr: number) => {
    const from =
      (prevPointsRef.current ?? generateCorrelatedData(nextCorr)).map(p => ({ ...p }));
    const to = generateCorrelatedData(nextCorr);

    prevPointsRef.current = from; // tween from current

    if (animIdRef.current) cancelAnimationFrame(animIdRef.current);

    const duration = 400; // ms
    const start = performance.now();
    const ease = (t: number) => 1 - Math.pow(1 - t, 3); // easeOutCubic

    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const e = ease(p);

      const interp = from.map((fp, i) => {
        const tp = to[i];
        return {
          x: fp.x + (tp.x - fp.x) * e,
          y: fp.y + (tp.y - fp.y) * e,
        };
      });

      setGeneratedPoints(interp);

      if (p < 1) {
        animIdRef.current = requestAnimationFrame(tick);
      } else {
        setGeneratedPoints(to);      // snap final
        prevPointsRef.current = to;  // next tween starts here
        animIdRef.current = null;
      }
    };

    animIdRef.current = requestAnimationFrame(tick);
  }, []);

  // Draw/update generated circles (no d3 transitions)
  useEffect(() => {
    const genG = d3.select(genGroupRef.current);

    const genSel = genG
      .selectAll<SVGCircleElement, Point>('circle')
      .data(generatedPoints, (_, i) => i as any);

    genSel.join(
      (enter) =>
        enter
          .append('circle')
          .attr('r', 4)
          .attr('fill', '#2f9e44')
          .attr('fill-opacity', 0.8)
          .attr('cx', (d) => xScale(d.x))
          .attr('cy', (d) => yScale(d.y)),
      (update) =>
        update
          .attr('fill-opacity', 0.8)
          .attr('cx', (d) => xScale(d.x))
          .attr('cy', (d) => yScale(d.y)),
      (exit) => exit.remove(),
    );
  }, [generatedPoints, xScale, yScale]);

  const generatedR = computePearsonR(generatedPoints);

  // Slider handler
  const handleSliderChange = useCallback(
    (val: number) => {
      setCorrelationStrength(val);
      animateTo(val); // smooth motion
      trrack.apply('Slider Changed', actions.sliderChange(val));
      updateAnswer();
    },
    [animateTo, trrack, actions, updateAnswer],
  );

  // Slider marks
  const marks = useMemo(() => {
    const steps = 10;
    const arr: { value: number; label: string }[] = [];
    for (let i = 0; i <= steps; i++) {
      const v = sliderMin + (i * (sliderMax - sliderMin)) / steps;
      const rounded = Math.round(v * 10) / 10;
      // avoid "-0.0" labels
      const labelVal = (Object.is(rounded, -0) ? 0 : rounded).toFixed(1);
      arr.push({ value: rounded, label: labelVal });
    }
    return arr;
  }, [sliderMin, sliderMax]);

  return (
    <Card padding="md" radius="md">
      <Stack gap="sm" align="center">
        <Title order={3}>{title}</Title>

        <Text size="md" ta="left" maw={600}>
          The scatterplot shows a set of simulated data points.
          These values don’t come from a real dataset — they are randomly generated — but they are constructed so the relationship
          between X and Y matches the correlation (<em>r</em>) you choose. <br />
          Use the slider below to set the correlation value (<em>r</em>) {helpTextRange}.
          As you adjust the slider, the scatterplot below will move the points so their relationship matches the chosen value. <br />
          Please interact with the scatterplots and explore different correlation values using the slider for <strong>at least 1 minute</strong>.<br />
          After one minute, you will be able to click the next button and advance.<br />
          🎙️ Please remember to think-aloud as you explore the tutorial!
        </Text>

        {generatedR !== null && (
          <Text size="sm" c="green" ta="center" mt={0}>
            correlation = {formatR(generatedR)}
          </Text>
        )}

        <svg
          ref={svgRef}
          width={width}
          height={height}
          style={{
            border: '1px solid #ccc',
            borderRadius: 6,
            transition: 'all 0.1s ease',
            display: 'block',
            margin: '0 auto',
          }}
        />

        <Group justify="center" w="100%">
          <div style={{ width: 400, maxWidth: '100%', marginBottom: 10 }}>
            <Slider
              value={correlationStrength}
              onChange={handleSliderChange}
              step={0.1}
              min={sliderMin}
              max={sliderMax}
              marks={marks}
              styles={{
                track: { transition: 'all 0.1s ease' },
                thumb: { transition: 'all 0.1s ease' },
              }}
            />
          </div>
        </Group>
      </Stack>
    </Card>
  );
}
