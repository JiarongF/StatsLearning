import {
  useEffect, useMemo, useRef, useState, useCallback,
} from 'react';
import {
  Card,
  Title,
  Text,
  Slider,
  Stack,
  Group,
  Divider,
  Button,
  Collapse,
} from '@mantine/core';
import * as d3 from 'd3';
import { initializeTrrack, Registry } from '@trrack/core';
import type { StimulusParams } from '../../../store/types';

interface Point {
  x: number;
  y: number;
}

/** ---------- utilities ---------- */

// keep base normals stable across re-generations
let cachedBasePoints: { x: number; y: number }[] | null = null;

/** Make generated points whose *sample* correlation equals targetCorrelation.
 *  Key: orthogonalize Y against X before mixing.
 */
function generateCorrelatedData(targetCorrelation: number, n = 30): Point[] {
  // 1) stable base normals
  if (!cachedBasePoints || cachedBasePoints.length !== n) {
    const rng = d3.randomLcg(42);
    const randNorm = d3.randomNormal.source(rng)(0, 1);
    cachedBasePoints = Array.from({ length: n }, () => ({ x: randNorm(), y: randNorm() }));
  }

  // 2) center & normalize to unit variance
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

  // 4) normalize yPerp to unit variance (ensure proper mixing)
  const yPerpMean = d3.mean(yPerp)!;
  const yPerpC = yPerp.map((v) => v - yPerpMean);
  const yPerpStd = Math.sqrt(d3.variance(yPerpC)!);
  const yHat = yPerpC.map((v) => v / yPerpStd);

  // 5) mix to achieve the exact sample correlation (up to floating error)
  const yCorr = x.map((vx, i) => targetCorrelation * vx + Math.sqrt(1 - targetCorrelation * targetCorrelation) * yHat[i]);

  // 6) scale independently to [0.5, 9.5] (affine transforms preserve r)
  const xRange = d3.extent(x) as [number, number];
  const yRange = d3.extent(yCorr) as [number, number];
  const sx = d3.scaleLinear().domain(xRange).range([0.5, 9.5]);
  const sy = d3.scaleLinear().domain(yRange).range([0.5, 9.5]);

  return x.map((vx, i) => ({ x: sx(vx), y: sy(yCorr[i]) }));
}

function computePearsonR(data: Point[]): number | null {
  if (data.length < 2) return null;
  const xs = data.map((d) => d.x);
  const ys = data.map((d) => d.y);
  const meanX = d3.mean(xs);
  const meanY = d3.mean(ys);
  if (meanX === undefined || meanY === undefined) return null;
  const num = d3.sum(xs.map((x, i) => (x - meanX) * (ys[i] - meanY)));
  const den = Math.sqrt(d3.sum(xs.map((x) => (x - meanX) ** 2)))
    * Math.sqrt(d3.sum(ys.map((y) => (y - meanY) ** 2)));
  return den === 0 ? null : num / den;
}

function interpretCorrelation(r: number): string {
  if (r >= 0.8) return 'Very Strong Positive';
  if (r >= 0.6) return 'Strong Positive';
  if (r >= 0.4) return 'Moderate Positive';
  if (r >= 0.2) return 'Weak Positive';
  if (r > 0) return 'Very Weak Positive';
  if (r === 0) return 'No Correlation';
  if (r > -0.2) return 'Very Weak Negative';
  if (r > -0.4) return 'Weak Negative';
  if (r > -0.6) return 'Moderate Negative';
  if (r > -0.8) return 'Strong Negative';
  return 'Very Strong Negative';
}

export default function CorrelationExplorer({
  parameters,
  setAnswer,
  provenanceState,
}: StimulusParams<any, any>) {
  const svgRef = useRef<SVGSVGElement>(null);
  const gRef = useRef<SVGGElement | null>(null);
  const genGroupRef = useRef<SVGGElement | null>(null);
  const userGroupRef = useRef<SVGGElement | null>(null);

  const [correlationStrength, setCorrelationStrength] = useState<number>(0.8);
  const [displayCorrelation, setDisplayCorrelation] = useState<number>(0.8);
  const [showRInfo, setShowRInfo] = useState<boolean>(false);
  const [displayedR, setDisplayedR] = useState<number | null>(null);
  const [generatedPoints, setGeneratedPoints] = useState<Point[]>([]);
  const [userPoints, setUserPoints] = useState<Point[]>([]);
  const animationRef = useRef<number | null>(null);
  const rAnimationRef = useRef<number | null>(null);
  const { taskid } = parameters;

  const width = 400;
  const height = 300;
  const margin = {
    top: 20, right: 20, bottom: 40, left: 40,
  };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const xScale = useMemo(
    () => d3.scaleLinear().domain([0, 10]).range([0, innerWidth]),
    [innerWidth],
  );
  const yScale = useMemo(
    () => d3.scaleLinear().domain([0, 10]).range([innerHeight, 0]),
    [innerHeight],
  );

  const { actions, trrack } = useMemo(() => {
    const reg = Registry.create();

    const sliderChange = reg.register('sliderChange', (state, value: number) => {
      state.correlationStrength = value;
      return state;
    });

    const addUserPoint = reg.register('addPoint', (state, point: Point) => {
      state.userPoints = [...(state.userPoints || []), point];
      return state;
    });

    const clearPoints = reg.register('clearPoints', (state, _: void) => {
      state.userPoints = [];
      return state;
    });

    const trrackInst = initializeTrrack({
      registry: reg,
      initialState: { correlationStrength: 0.8, userPoints: [] },
    });

    return { actions: { sliderChange, addUserPoint, clearPoints }, trrack: trrackInst };
  }, []);

  // init svg
  useEffect(() => {
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);
    gRef.current = g.node() as SVGGElement;

    g.append('g').attr('class', 'x-axis').attr('transform', `translate(0,${innerHeight})`)
      .call(d3.axisBottom(xScale));
    g.append('g').attr('class', 'y-axis').call(d3.axisLeft(yScale));

    svg.append('text')
      .attr('x', margin.left + innerWidth / 2)
      .attr('y', height - 5)
      .attr('text-anchor', 'middle')
      .text('X');

    svg.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('x', -height / 2)
      .attr('y', 15)
      .attr('text-anchor', 'middle')
      .text('Y');

    const genG = g.append('g').attr('class', 'gen-points');
    const userG = g.append('g').attr('class', 'user-points');
    genGroupRef.current = genG.node() as SVGGElement;
    userGroupRef.current = userG.node() as SVGGElement;

    svg.on('click', (event: MouseEvent) => {
      const [mouseX, mouseY] = d3.pointer(event);
      const chartX = mouseX - margin.left;
      const chartY = mouseY - margin.top;
      const xVal = xScale.invert(chartX);
      const yVal = yScale.invert(chartY);
      if (xVal >= 0 && xVal <= 10 && yVal >= 0 && yVal <= 10) {
        const newPoint = { x: xVal, y: yVal };
        trrack.apply('User Point Added', actions.addUserPoint(newPoint));
        setUserPoints((prev) => [...prev, newPoint]);
        updateAnswer();
      }
    });
  }, []);

  useEffect(() => {
    setAnswer({ status: true, provenanceGraph: trrack.graph.backend, answers: {} });
  }, [setAnswer, taskid, trrack]);

  const updateAnswer = useCallback(() => {
    setAnswer({ status: true, provenanceGraph: trrack.graph.backend, answers: {} });
  }, [setAnswer, taskid, trrack, correlationStrength, userPoints]);

  useEffect(() => {
    if (provenanceState) {
      if (provenanceState.correlationStrength !== undefined) {
        setCorrelationStrength(provenanceState.correlationStrength);
        setDisplayCorrelation(provenanceState.correlationStrength);
      }
      if (provenanceState.userPoints !== undefined) {
        setUserPoints(provenanceState.userPoints);
      }
    }
  }, [provenanceState]);

  // ease displayCorrelation toward target correlationStrength
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
      if (p < 1) animationRef.current = requestAnimationFrame(animate);
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

  // regenerate green points when eased value changes
  useEffect(() => {
    setGeneratedPoints(generateCorrelatedData(displayCorrelation));
  }, [displayCorrelation]);

  // r values
  const combinedPoints = [...generatedPoints, ...userPoints];
  const r = computePearsonR(combinedPoints);
  const generatedR = computePearsonR(generatedPoints);

  // smooth animate displayed r
  useEffect(() => {
    if (r === null) {
      setDisplayedR(null);
      return;
    }
    if (displayedR === null) {
      setDisplayedR(r);
      return;
    }

    if (rAnimationRef.current) cancelAnimationFrame(rAnimationRef.current);

    const start = displayedR;
    const end = r;
    const duration = 200;
    const t0 = performance.now();

    const step = (t: number) => {
      const p = Math.min((t - t0) / duration, 1);
      const eased = 1 - (1 - p) ** 3;
      setDisplayedR(start + (end - start) * eased);
      if (p < 1) rAnimationRef.current = requestAnimationFrame(step);
    };

    if (Math.abs(end - start) > 0.005) {
      rAnimationRef.current = requestAnimationFrame(step);
    } else {
      setDisplayedR(end);
    }

    return () => {
      if (rAnimationRef.current) cancelAnimationFrame(rAnimationRef.current);
    };
  }, [r, displayedR]);

  // draw/update circles
  useEffect(() => {
    const genG = d3.select(genGroupRef.current);
    const userG = d3.select(userGroupRef.current);

    const genSel = genG
      .selectAll<SVGCircleElement, Point>('circle')
      .data(generatedPoints, (_, i) => i as any);

    genSel.join(
      (enter) => enter
        .append('circle')
        .attr('r', 4)
        .attr('fill', '#2f9e44')
        .attr('opacity', 0)
        .attr('cx', (d) => xScale(d.x))
        .attr('cy', (d) => yScale(d.y))
        .transition()
        .duration(150)
        .attr('opacity', 1),
      (update) => update
        .transition()
        .duration(150)
        .ease(d3.easeQuadInOut)
        .attr('cx', (d) => xScale(d.x))
        .attr('cy', (d) => yScale(d.y)),
      (exit) => exit.transition().duration(100).attr('opacity', 0).remove(),
    );

    const userSel = userG
      .selectAll<SVGCircleElement, Point>('circle')
      .data(userPoints, (_, i) => `user-${i}`);

    userSel.join(
      (enter) => enter
        .append('circle')
        .attr('r', 5)
        .attr('fill', '#1c7ed6')
        .attr('opacity', 0)
        .attr('cx', (d) => xScale(d.x))
        .attr('cy', (d) => yScale(d.y))
        .transition()
        .duration(200)
        .attr('opacity', 1),
      (update) => update
        .transition()
        .duration(150)
        .ease(d3.easeCubicOut)
        .attr('cx', (d) => xScale(d.x))
        .attr('cy', (d) => yScale(d.y)),
      (exit) => exit.transition().duration(150).attr('opacity', 0).remove(),
    );
  }, [generatedPoints, userPoints, xScale, yScale]);

  const smoothR = displayedR !== null ? displayedR : r;

  const handleSliderChange = useCallback(
    (val: number) => {
      setCorrelationStrength(val);
      trrack.apply('Slider Changed', actions.sliderChange(val));
      updateAnswer();
    },
    [trrack, actions, updateAnswer],
  );

  const handleClearPoints = useCallback(() => {
    trrack.apply('Points Cleared', actions.clearPoints(undefined));
    setUserPoints([]);
    updateAnswer();
  }, [trrack, actions, updateAnswer]);

  return (
    <Card padding="md" radius="md">
      <Stack gap="sm">
        <Title order={3}>Correlation Explorer</Title>
        <Text size="sm">
          <strong>•</strong>
          {' '}
          Use the slider to adjust the correlation strength for generated (green) points.
        </Text>
        <Text size="sm">
          {' '}
          <strong>•</strong>
          {' '}
          Click anywhere on the chart to add your own points (blue) at any time.
        </Text>
        <Text size="sm">
          {' '}
          <strong>•</strong>
          {' '}
          Watch how the overall correlation coefficient changes as you experiment.
        </Text>

        <Group gap="xs" align="center" style={{ cursor: 'pointer' }} onClick={() => setShowRInfo((v) => !v)}>
          <Text fw={600}>What is r?</Text>
          <Text size="sm" c="dimmed">{showRInfo ? 'Hide' : 'Show'}</Text>
        </Group>

        <Collapse in={showRInfo}>
          <Card shadow="xs" padding="sm" radius="sm" withBorder mt={6}>
            <Text size="sm">
              <strong>r</strong>
              {' '}
              is the correlation coefficient. In this tool it always ranges from
              <strong> 0</strong>
              {' '}
              (no relationship) to
              <strong>1</strong>
              {' '}
              (perfect positive relationship).
            </Text>
            <Text size="sm" c="dimmed" mt={4}>
              Later you may encounter negative
              {' '}
              <strong>r</strong>
              {' '}
              values, which describe downward trends —
              but here we’ll focus on positive ones.
            </Text>
          </Card>
        </Collapse>

        <Divider my="sm" />

        {/* CHART */}
        <svg
          ref={svgRef}
          width={width}
          height={height}
          style={{ border: '1px solid #ccc', transition: 'all 0.1s ease' }}
        />

        {/* SLIDER */}
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
          styles={{ track: { transition: 'all 0.1s ease' }, thumb: { transition: 'all 0.1s ease' } }}
        />

        <Group justify="space-between" align="flex-start" mt="sm">
          <Stack gap="xs">
            <Text fw={500}>
              Total points:
              {generatedPoints.length + userPoints.length}
            </Text>
            {generatedR !== null && (
              <Text size="sm" c="green">
                Generated points r =
                {generatedR.toFixed(2)}
              </Text>
            )}
          </Stack>

          <Group gap="xs" align="center">
            {smoothR !== null && (
              <Text
                fw={500}
                c={Math.abs(smoothR) > 0.6 ? 'green' : Math.abs(smoothR) > 0.3 ? 'orange' : 'red'}
                style={{ transition: 'color 0.15s ease' }}
              >
                Overall r =
                {' '}
                {smoothR.toFixed(2)}
                {' '}
                →
                {' '}
                <em>{interpretCorrelation(smoothR)}</em>
              </Text>
            )}
            {userPoints.length > 0 && (
              <Button size="xs" color="red" onClick={handleClearPoints}>
                Clear My Points
              </Button>
            )}
          </Group>
        </Group>

        <Text size="sm" c="dimmed">
          <strong>Play around: </strong>
          {' '}
          Set the slider to 1, then place points wherever you like. See how the correlation changes when you go against the trend.
        </Text>
      </Stack>
    </Card>
  );
}
