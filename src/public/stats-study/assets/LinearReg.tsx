import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  Card,
  Title,
  Text,
  Stack,
  Button,
  Group,
  Switch,
  Divider,
  Table,
  Collapse,
  ScrollArea,
} from "@mantine/core";
import * as d3 from "d3";
import { initializeTrrack, Registry } from "@trrack/core";
import type { StimulusParams } from "../../../store/types";

interface Point {
  x: number;
  y: number;
}
interface ProvenanceState {
  points: Point[];
  showResiduals: boolean;
  stepMode: boolean;
}

export default function LinearReg({
  parameters,
  setAnswer,
  provenanceState,
}: StimulusParams<any, ProvenanceState>) {
  const svgRef = useRef<SVGSVGElement>(null);
  const { taskid } = parameters;

  // initial default points
  const initialPoints: Point[] = [
    { x: 10, y: 20 },
    { x: 20, y: 35 },
    { x: 30, y: 50 },
    { x: 40, y: 65 },
  ];

  // React state
  const [points, setPoints] = useState<Point[]>(initialPoints);
  const [showResiduals, setShowResiduals] = useState<boolean>(true);
  const [stepMode, setStepMode] = useState<boolean>(false);

  // provenance registry & Trrack
  const { actions, trrack } = useMemo(() => {
    const reg = Registry.create();
    const addPoint = reg.register("addPoint", (state, p: Point) => {
      state.points = [...(state.points || []), p];
      return state;
    });
    const clearPoints = reg.register("clearPoints", (state, _: void) => {
      state.points = initialPoints;
      return state;
    });
    const toggleResiduals = reg.register(
      "toggleResiduals",
      (state, v: boolean) => {
        state.showResiduals = v;
        return state;
      },
    );
    const toggleStepMode = reg.register(
      "toggleStepMode",
      (state, v: boolean) => {
        state.stepMode = v;
        return state;
      },
    );

    return {
      actions: {
        addPoint,
        clearPoints,
        toggleResiduals,
        toggleStepMode,
      },
      trrack: initializeTrrack({
        registry: reg,
        initialState: {
          points: initialPoints,
          showResiduals: true,
          stepMode: false,
        },
      }),
    };
  }, []);

  // push answer + graph snapshot
  const updateAnswer = useCallback(() => {
    setAnswer({
      status: true,
      provenanceGraph: trrack.graph.backend,
      answers: {
        [taskid]: JSON.stringify({
          pointCount: points.length,
          showResiduals,
          stepMode,
        }),
      },
    });
  }, [setAnswer, taskid, trrack, points, showResiduals, stepMode]);

  // initial answer
  useEffect(() => {
    updateAnswer();
  }, []);

  // replay sync
  useEffect(() => {
    if (provenanceState) {
      if (provenanceState.points) setPoints(provenanceState.points);
      if (provenanceState.showResiduals !== undefined)
        setShowResiduals(provenanceState.showResiduals);
      if (provenanceState.stepMode !== undefined)
        setStepMode(provenanceState.stepMode);
      updateAnswer();
    }
  }, [provenanceState, updateAnswer]);

  // draw
  useEffect(() => {
    const width = 500;
    const height = 350;
    const margin = {
      top: 20,
      right: 20,
      bottom: 40,
      left: 50,
    };
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const xScale = d3
      .scaleLinear()
      .domain([0, 100])
      .range([margin.left, width - margin.right]);
    const yScale = d3
      .scaleLinear()
      .domain([0, 100])
      .range([height - margin.bottom, margin.top]);

    svg
      .append("g")
      .attr("transform", `translate(0,${height - margin.bottom})`)
      .call(d3.axisBottom(xScale).ticks(10));
    svg
      .append("g")
      .attr("transform", `translate(${margin.left},0)`)
      .call(d3.axisLeft(yScale).ticks(10));

    // Smooth circle animations with proper enter/update/exit pattern
    svg
      .selectAll("circle")
      .data(points, (d, i) => `point-${i}`) // Key function for proper data binding
      .join(
        (enter) =>
          enter
            .append("circle")
            .attr("cx", (d) => xScale(d.x))
            .attr("cy", (d) => yScale(d.y))
            .attr("r", 0) // Start with radius 0
            .attr("fill", "#1c7ed6")
            .call(
              (enter) => enter.transition().duration(300).attr("r", 5), // Animate to full size
            ),
        (update) =>
          update.call((update) =>
            update
              .transition()
              .duration(300)
              .attr("cx", (d) => xScale(d.x))
              .attr("cy", (d) => yScale(d.y))
              .attr("r", 5),
          ),
        (exit) =>
          exit.call((exit) =>
            exit
              .transition()
              .duration(300)
              .attr("r", 0) // Shrink to 0 before removing
              .remove(),
          ),
      );

    const reg = computeLinearRegression(points);
    if (reg) {
      const { slope, intercept } = reg;
      const [p1, p2] = [0, 100].map((x) => ({ x, y: slope * x + intercept }));
      svg
        .append("line")
        .attr("x1", xScale(p1.x))
        .attr("y1", yScale(p1.y))
        .attr("x2", xScale(p2.x))
        .attr("y2", yScale(p2.y))
        .attr("stroke", "darkgreen")
        .attr("stroke-width", 2)
        .attr("stroke-dasharray", stepMode ? "5,5" : "");

      if (showResiduals) {
        const preds = computePredictions(points, slope, intercept);
        svg
          .selectAll("line.residual")
          .data(preds)
          .join("line")
          .attr("class", "residual")
          .transition()
          .duration(300)
          .attr("x1", (d) => xScale(d.x))
          .attr("y1", (d) => yScale(d.y))
          .attr("x2", (d) => xScale(d.x))
          .attr("y2", (d) => yScale(d.predicted))
          .attr("stroke", "red")
          .attr("stroke-dasharray", "3,2");
      }
    }

    svg.on("click", (event) => {
      const [mx, my] = d3.pointer(event);
      const x = xScale.invert(mx);
      const y = yScale.invert(my);
      if (x >= 0 && x <= 100 && y >= 0 && y <= 100) {
        const pt = { x, y };
        trrack.apply("Point Added", actions.addPoint(pt));
        setPoints((prev) => [...prev, pt]);
        updateAnswer();
      }
    });
  }, [points, showResiduals, stepMode, actions, trrack, updateAnswer]);

  // UI
  return (
    <Card shadow="sm" padding="md" radius="md" withBorder>
      <Stack gap="sm">
        <Title order={3}>Linear Regression</Title>
        <Text size="sm">Click to add points; line & residuals update.</Text>

        <Group>
          <Switch
            label="Show Residuals"
            checked={showResiduals}
            onChange={(e) => {
              const v = e.currentTarget.checked;
              trrack.apply("Toggle Residuals", actions.toggleResiduals(v));
              setShowResiduals(v);
              updateAnswer();
            }}
          />
          <Switch
            label="Step-by-Step Mode"
            checked={stepMode}
            onChange={(e) => {
              const v = e.currentTarget.checked;
              trrack.apply("Toggle Step Mode", actions.toggleStepMode(v));
              setStepMode(v);
              updateAnswer();
            }}
          />
          <Button
            size="xs"
            color="red"
            disabled={points.length <= initialPoints.length}
            onClick={() => {
              trrack.apply("Points Cleared", actions.clearPoints(undefined));
              setPoints(initialPoints);
              updateAnswer();
            }}
          >
            Clear Points
          </Button>
        </Group>

        <Divider my="sm" />
        {computeLinearRegression(points) && (
          <>
            <Text>
              Equation:{" "}
              <code>
                y ={computeLinearRegression(points)!.slope.toFixed(2)}x +
                {computeLinearRegression(points)!.intercept.toFixed(2)}
              </code>
            </Text>
            <Text>
              SSE:{" "}
              {computeSSE(
                computePredictions(
                  points,
                  computeLinearRegression(points)!.slope,
                  computeLinearRegression(points)!.intercept,
                )!,
              ).toFixed(2)}
            </Text>
            <Collapse in={stepMode}>
              <Divider my="xs" label="Prediction Table" />
              <ScrollArea
                h={150}
                offsetScrollbars
                scrollbarSize={6}
                style={{ border: "1px solid #e9ecef", borderRadius: "4px" }}
              >
                <Table striped withColumnBorders style={{ minWidth: "100%" }}>
                  <Table.Thead
                    style={{
                      position: "sticky",
                      top: 0,
                      backgroundColor: "white",
                      zIndex: 1,
                    }}
                  >
                    <Table.Tr>
                      <Table.Th>x</Table.Th>
                      <Table.Th>y</Table.Th>
                      <Table.Th>ŷ</Table.Th>
                      <Table.Th>Residual</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {computePredictions(
                      points,
                      computeLinearRegression(points)!.slope,
                      computeLinearRegression(points)!.intercept,
                    )!.map((d, i) => (
                      <Table.Tr key={i}>
                        <Table.Td>{d.x.toFixed(2)}</Table.Td>
                        <Table.Td>{d.y.toFixed(2)}</Table.Td>
                        <Table.Td>{d.predicted.toFixed(2)}</Table.Td>
                        <Table.Td>{d.residual.toFixed(2)}</Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </ScrollArea>
            </Collapse>
          </>
        )}

        <svg
          ref={svgRef}
          width={500}
          height={350}
          style={{ border: "1px solid #ccc" }}
        />
      </Stack>
    </Card>
  );
}

// Helpers
function computeLinearRegression(
  data: Point[],
): { slope: number; intercept: number } | null {
  if (data.length < 2) return null;
  const xs = data.map((d) => d.x);
  const ys = data.map((d) => d.y);
  const mX = d3.mean(xs)!;
  const mY = d3.mean(ys)!;
  const num = d3.sum(data, (d) => (d.x - mX) * (d.y - mY));
  const den = d3.sum(data, (d) => (d.x - mX) ** 2);
  if (!den) return null;
  return { slope: num / den, intercept: mY - (num / den) * mX };
}

function computePredictions(
  data: Point[],
  slope: number,
  intercept: number,
): Array<Point & { predicted: number; residual: number }> {
  return data.map((d) => {
    const pred = slope * d.x + intercept;
    return { ...d, predicted: pred, residual: d.y - pred };
  });
}

function computeSSE(
  preds: Array<Point & { predicted: number; residual: number }>,
): number {
  return d3.sum(preds, (d) => d.residual ** 2);
}
