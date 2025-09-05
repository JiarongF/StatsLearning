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
  Divider,
} from '@mantine/core';
import * as d3 from 'd3';
import { initializeTrrack, Registry } from '@trrack/core';
import type { StimulusParams } from '../../../store/types';

interface Point {
  x: number;
  y: number;
}

/** ---------- utilities ---------- */

// Keep base normals stable across re-generations
let cachedBasePoints: { x: number; y: number }[] | null = null;

/**
 * Make generated points whose *sample* correlation equals targetCorrelation.
 * Key: orthogonalize Y against X before mixing.
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
  const dotXX = d3.sum(x.map((vx) => vx * vx)); // ~ (n-1)
  const proj = dotXY / dotXX;
  const yPerp = y.map((vy, i) => vy - proj * x[i]);

  // 4) Normalize yPerp to unit variance (ensure proper mixing)
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

export default function CorrelationExplorer({
  parameters,
  setAnswer,
  provenanceState,
}: StimulusParams<any, any>) {
  const svgRef = useRef<SVGSVGElement>(null);
  const gRef = useRef<SVGGElement | null>(null);
  const genGroupRef = useRef<SVGGElement | null>(null);
  const animationRef = useRef<number | null>(null);

  // State (no user points anymore)
  const [correlationStrength, setCorrelationStrength] = useState<number>(0.8);
  const [displayCorrelation, setDisplayCorrelation] = useState<number>(0.8);
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

  // Trrack (only slider changes now)
  const { actions, trrack } = useMemo(() => {
    const reg = Registry.create();

    const sliderChange = reg.register('sliderChange', (state, value: number) => {
      state.correlationStrength = value;
      return state;
    });

    const trrackInst = initializeTrrack({
      registry: reg,
      initialState: {
        correlationStrength: 0.8,
      },
    });

    return {
      actions: { sliderChange },
      trrack: trrackInst,
    };
  }, []);

  // Initialize SVG (no click handler anymore)
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

  // Keep ReVISit answer updated (no userPoints now)
  const updateAnswer = useCallback(() => {
    setAnswer({
      status: true,
      provenanceGraph: trrack.graph.backend,
      answers: {},
    });
  }, [setAnswer, trrack]);

  // Initialize answer
  useEffect(() => {
    setAnswer({
      status: true,
      provenanceGraph: trrack.graph.backend,
      answers: {},
    });
  }, [setAnswer, trrack]);

  // Load provenance (only correlationStrength supported)
  useEffect(() => {
    if (provenanceState && provenanceState.correlationStrength !== undefined) {
      setCorrelationStrength(provenanceState.correlationStrength);
      setDisplayCorrelation(provenanceState.correlationStrength);
    }
  }, [provenanceState]);

  // Animate displayCorrelation to target (kept)
  useEffect(() => {
    if (animationRef.current) cancelAnimationFrame(animationRef.current);

    const startValue = displayCorrelation;
    const endValue = correlationStrength;
    const duration = 100;
    const startTime = performance.now();

    const animate = (t: number) => {
      const p = Math.min((t - startTime) / duration, 1);
      const eased = 1 - (1 - p) ** 4; // easeOutQuart
      const cur = startValue + (endValue - startValue) * eased;
      setDisplayCorrelation(cur);

      if (p < 1) {
        animationRef.current = requestAnimationFrame(animate);
      }
    };

    if (Math.abs(endValue - startValue) > 0.01) {
      animationRef.current = requestAnimationFrame(animate);
    } else {
      setDisplayCorrelation(endValue);
    }

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [correlationStrength, displayCorrelation]);

  // Regenerate points when displayCorrelation changes
  useEffect(() => {
    setGeneratedPoints(generateCorrelatedData(displayCorrelation));
  }, [displayCorrelation]);

  // Draw/update generated circles
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
          .attr('opacity', 0)
          .attr('cx', (d) => xScale(d.x))
          .attr('cy', (d) => yScale(d.y))
          .transition()
          .duration(150)
          .attr('opacity', 1),
      (update) =>
        update
          .transition()
          .duration(150)
          .ease(d3.easeQuadInOut)
          .attr('cx', (d) => xScale(d.x))
          .attr('cy', (d) => yScale(d.y)),
      (exit) =>
        exit.transition().duration(100).attr('opacity', 0).remove(),
    );
  }, [generatedPoints, xScale, yScale]);

  const generatedR = computePearsonR(generatedPoints);

  // Slider handler
  const handleSliderChange = useCallback(
    (val: number) => {
      setCorrelationStrength(val);
      trrack.apply('Slider Changed', actions.sliderChange(val));
      updateAnswer();
    },
    [trrack, actions, updateAnswer],
  );

  return (
  <Card padding="md" radius="md" >
    {/* Center children horizontally */}
    <Stack gap="sm" align="center">
      <Title order={3}>Positive Correlation</Title>

      <Text size="md" ta="left" maw={600}>
  The scatterplot shows a set of simulated data points with values on an <strong>X</strong> axis and a <strong>Y</strong> axis. 
  These values don’t come from a real dataset — they are randomly generated — but they are constructed so the relationship 
  between X and Y matches the correlation (<em>r</em>) you choose. <br /><br />
  Use the slider below to set the correlation value (<em>r</em>) between 0.0 and 1.0. 
  As you adjust the slider, the scatterplot below will move the points so their relationship matches the chosen value. <br /><br />
  Please study the scatterplots and their different correlation values for <strong>1 minute</strong>.
</Text>

      {/* Correlation readout, centered */}
      {generatedR !== null && (
        <Text size="sm" c="green" ta="center" mt={0}>
          correlation = {generatedR.toFixed(2)}
        </Text>
      )}

      {/* CHART — block + auto margins keeps it centered */}
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

      {/* SLIDER — fixed max width + centered */}
      <Group justify="center" w="100%">
        <div style={{ width: 400, maxWidth: '100%' , marginBottom: 10}}>
          <Slider
            value={correlationStrength}
            onChange={handleSliderChange}
            step={0.1}
            min={0}
            max={1}
            marks={Array.from({ length: 11 }, (_, i) => ({
              value: i / 10,
              label: (i / 10).toFixed(1),
            }))}
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
