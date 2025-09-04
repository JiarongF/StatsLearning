import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Card, Title, Text, Stack, Group, Divider, Button } from '@mantine/core';
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
  const yCorr = x.map(
    (vx, i) => targetCorrelation * vx + Math.sqrt(1 - targetCorrelation * targetCorrelation) * yHat[i],
  );

  // 6) scale independently to [0.5, 9.5] (affine transforms preserve r)
  const xRange = d3.extent(x) as [number, number];
  const yRange = d3.extent(yCorr) as [number, number];
  const sx = d3.scaleLinear().domain(xRange).range([0.5, 9.5]);
  const sy = d3.scaleLinear().domain(yRange).range([0.5, 9.5]);

  return x.map((vx, i) => ({ x: sx(vx), y: sy(yCorr[i]) }));
}

export default function RFixedPostIncrease({
  parameters,
  setAnswer,
  provenanceState,
}: StimulusParams<any, any>) {
  const svgRef = useRef<SVGSVGElement>(null);
  const gRef = useRef<SVGGElement | null>(null);
  const genGroupRef = useRef<SVGGElement | null>(null);
  const userGroupRef = useRef<SVGGElement | null>(null);

  const [generatedPoints, setGeneratedPoints] = useState<Point[]>([]);
  const [userPoints, setUserPoints] = useState<Point[]>([]);
  const { taskid } = parameters;

  const width = 400;
  const height = 300;
  const margin = { top: 20, right: 20, bottom: 40, left: 40 };
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

  // Provenance: only track adding/clearing points (no slider events here)
  const { actions, trrack } = useMemo(() => {
    const reg = Registry.create();

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
      initialState: { userPoints: [] as Point[] },
    });

    return { actions: { addUserPoint, clearPoints }, trrack: trrackInst };
  }, []);

  // init svg + interactions
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

    // click to add a user point
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
  }, [innerHeight, innerWidth, xScale, yScale, actions, trrack]);

  // initialize fixed generated points at r = 0.1
  useEffect(() => {
    setGeneratedPoints(generateCorrelatedData(0.1));
  }, []);

  // hydrate from provenance if provided
  useEffect(() => {
    if (provenanceState?.userPoints !== undefined) {
      setUserPoints(provenanceState.userPoints);
    }
  }, [provenanceState]);

  // push answer/provenance
  useEffect(() => {
    setAnswer({ status: true, provenanceGraph: trrack.graph.backend, answers: {} });
  }, [setAnswer, taskid, trrack]);

  const updateAnswer = useCallback(() => {
    setAnswer({ status: true, provenanceGraph: trrack.graph.backend, answers: {} });
  }, [setAnswer, trrack]);

  const handleClearPoints = useCallback(() => {
    trrack.apply('Points Cleared', actions.clearPoints(undefined));
    setUserPoints([]);
    updateAnswer();
  }, [trrack, actions, updateAnswer]);

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
        .attr('fill', '#2f9e44') // green
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
        .attr('fill', '#1c7ed6') // blue
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

  return (
    <Card padding="md" radius="md">
      <Stack gap="sm">

        <Text size="lg">Please draw 5 datapoints that you think would DECREASE the correlation of this scatterplot.  When you are ready to submit, click the Next button
</Text>

        <svg
          ref={svgRef}
          width={width}
          height={height}
          style={{ border: '1px solid #ccc' }}
        />

        <Group justify="space-between" mt="xs">
          <Text fw={500}>
            Total points: {generatedPoints.length + userPoints.length}
          </Text>
          {userPoints.length > 0 && (
            <Button size="xs" color="red" onClick={handleClearPoints}>
              Clear My Points
            </Button>
          )}
        </Group>
      </Stack>
    </Card>
  );
}
