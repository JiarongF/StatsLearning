import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Card, Title, Text, Stack, Group, Divider, Button } from '@mantine/core';
import * as d3 from 'd3';
import { initializeTrrack, Registry } from '@trrack/core';
import type { StimulusParams } from '../../../store/types';

interface Point {
  x: number;
  y: number;
}

export default function CorrelationFreeDraw({
  parameters,
  setAnswer,
  provenanceState,
}: StimulusParams<any, any>) {
  const svgRef = useRef<SVGSVGElement>(null);
  const gRef = useRef<SVGGElement | null>(null);
  const userGroupRef = useRef<SVGGElement | null>(null);

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

  // Provenance: track adding/clearing points
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

  // init svg + axes + click handler
  useEffect(() => {
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);
    gRef.current = g.node() as SVGGElement;

    g.append('g')
      .attr('class', 'x-axis')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(d3.axisBottom(xScale));

    g.append('g')
      .attr('class', 'y-axis')
      .call(d3.axisLeft(yScale));

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

    const userG = g.append('g').attr('class', 'user-points');
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

  // draw/update user circles
  useEffect(() => {
    const userG = d3.select(userGroupRef.current);

    const userSel = userG
      .selectAll<SVGCircleElement, Point>('circle')
      .data(userPoints, (_, i) => `user-${i}`);

    userSel.join(
      (enter) =>
        enter
          .append('circle')
          .attr('r', 5)
          .attr('fill', '#1c7ed6') // blue
          .attr('opacity', 0)
          .attr('cx', (d) => xScale(d.x))
          .attr('cy', (d) => yScale(d.y))
          .transition()
          .duration(200)
          .attr('opacity', 1),
      (update) =>
        update
          .transition()
          .duration(150)
          .ease(d3.easeCubicOut)
          .attr('cx', (d) => xScale(d.x))
          .attr('cy', (d) => yScale(d.y)),
      (exit) => exit.transition().duration(150).attr('opacity', 0).remove(),
    );
  }, [userPoints, xScale, yScale]);

  return (
    <Card padding="md" radius="md">
      <Stack gap="sm">
        <Text size="lg">For the next question, we are going to ask you to draw datapoints on a scatterplot, go ahead and try out this new feature
</Text>

        <Divider my="sm" />

        {/* CHART */}
        <svg
          ref={svgRef}
          width={width}
          height={height}
          style={{ border: '1px solid #ccc' }}
        />

        <Group justify="space-between" mt="xs">
          <Text fw={500}>Your points: {userPoints.length}</Text>
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
