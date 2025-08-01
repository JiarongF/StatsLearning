import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  Card,
  Title,
  Text,
  Slider,
  Stack,
  Group,
  Divider,
  Button,
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
  correlationStrength: number;
  userPoints: Point[];
}

interface CorrelationParams extends StimulusParams<any> {
  // No additional props needed - using parameters.taskid
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function CorrelationExplorer({
  parameters,
  setAnswer,
  provenanceState,
}: StimulusParams<any, any>) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [correlationStrength, setCorrelationStrength] = useState<number>(0.8);
  const [displayCorrelation, setDisplayCorrelation] = useState<number>(0.8); // For smooth transitions
  const [generatedPoints, setGeneratedPoints] = useState<Point[]>([]);
  const [userPoints, setUserPoints] = useState<Point[]>([]);
  const animationRef = useRef<number | null>(null);
  const { taskid } = parameters;

  // Check if there's replay state in parameters
  console.log("Parameters received:", parameters);
  console.log("Provenance state received:", provenanceState);

  const { actions, trrack } = useMemo(() => {
    const reg = Registry.create();

    const sliderChange = reg.register(
      "sliderChange",
      (state, value: number) => {
        state.correlationStrength = value;
        return state;
      },
    );

    const addUserPoint = reg.register("addPoint", (state, point: Point) => {
      state.userPoints = [...(state.userPoints || []), point];
      return state;
    });

    const clearPoints = reg.register("clearPoints", (state, _: void) => {
      state.userPoints = [];
      return state;
    });

    const trrackInst = initializeTrrack({
      registry: reg,
      initialState: {
        correlationStrength: 0.8,
        userPoints: [],
      },
    });

    return {
      actions: { sliderChange, addUserPoint, clearPoints },
      trrack: trrackInst,
    };
  }, []);

  // Set initial answer when component mounts
  useEffect(() => {
    setAnswer({
      status: true,
      provenanceGraph: trrack.graph.backend,
      answers: {
        [taskid]: "initialized",
      },
    });
  }, [setAnswer, taskid, trrack]);

  const updateAnswer = useCallback(() => {
    setAnswer({
      status: true,
      provenanceGraph: trrack.graph.backend,
      answers: {
        [taskid]: `correlation:${correlationStrength},points:${userPoints.length}`,
      },
    });
  }, [setAnswer, taskid, trrack, correlationStrength, userPoints]);

  useEffect(() => {
    if (provenanceState) {
      console.log("Syncing with provenance state:", provenanceState);
      if (provenanceState.correlationStrength !== undefined) {
        setCorrelationStrength(provenanceState.correlationStrength);
        setDisplayCorrelation(provenanceState.correlationStrength);
      }
      if (provenanceState.userPoints !== undefined) {
        setUserPoints(provenanceState.userPoints);
      }
    }
  }, [provenanceState]);

  // Smooth transition for correlation strength
  useEffect(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }

    const startValue = displayCorrelation;
    const endValue = correlationStrength;
    const duration = 200; // Faster 200ms animation
    const startTime = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Use easeOutQuad for snappier but smooth deceleration
      const easedProgress = 1 - (1 - progress) * (1 - progress);
      const currentValue = startValue + (endValue - startValue) * easedProgress;

      setDisplayCorrelation(currentValue);

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      }
    };

    if (Math.abs(endValue - startValue) > 0.005) {
      // Slightly higher threshold for stability
      animationRef.current = requestAnimationFrame(animate);
    } else {
      // For very small changes, just snap to the end value
      setDisplayCorrelation(endValue);
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [correlationStrength]);

  // Generate points based on display correlation for smooth transitions
  useEffect(() => {
    const newPoints = generateCorrelatedData(displayCorrelation);
    setGeneratedPoints(newPoints);
  }, [displayCorrelation]);

  useEffect(() => {
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const width = 400;
    const height = 300;
    const margin = {
      top: 20,
      right: 20,
      bottom: 40,
      left: 40,
    };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const xScale = d3.scaleLinear().domain([0, 10]).range([0, innerWidth]);
    const yScale = d3.scaleLinear().domain([0, 10]).range([innerHeight, 0]);

    const g = svg
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    g.append("g")
      .attr("transform", `translate(0,${innerHeight})`)
      .call(d3.axisBottom(xScale));
    g.append("g").call(d3.axisLeft(yScale));

    svg
      .append("text")
      .attr("x", margin.left + innerWidth / 2)
      .attr("y", height - 5)
      .attr("text-anchor", "middle")
      .text("X");

    svg
      .append("text")
      .attr("transform", "rotate(-90)")
      .attr("x", -height / 2)
      .attr("y", 15)
      .attr("text-anchor", "middle")
      .text("Y");

    // Animated points with smooth transitions
    const genPointsSelection = g
      .selectAll(".gen-point")
      .data(generatedPoints, (d: any, i: number) => i);

    // Enter selection - appear at full size
    genPointsSelection
      .enter()
      .append("circle")
      .attr("class", "gen-point")
      .attr("cx", (d) => xScale(d.x))
      .attr("cy", (d) => yScale(d.y))
      .attr("r", 4) // Full size immediately
      .attr("fill", "#2f9e44")
      .attr("opacity", 0)
      .transition()
      .duration(150)
      .attr("opacity", 1);

    // Update selection - snappy movement
    genPointsSelection
      .transition()
      .duration(150)
      .attr("cx", (d) => xScale(d.x))
      .attr("cy", (d) => yScale(d.y));

    // Exit selection - fade out only
    genPointsSelection
      .exit()
      .transition()
      .duration(100)
      .attr("opacity", 0)
      .remove();

    // User points with fade-in only
    const userPointsSelection = g
      .selectAll(".user-point")
      .data(userPoints, (d: any, i: number) => `user-${i}`);

    userPointsSelection
      .enter()
      .append("circle")
      .attr("class", "user-point")
      .attr("cx", (d) => xScale(d.x))
      .attr("cy", (d) => yScale(d.y))
      .attr("r", 5) // Full size immediately
      .attr("fill", "#1c7ed6")
      .attr("opacity", 0)
      .transition()
      .duration(200)
      .attr("opacity", 1);

    userPointsSelection
      .transition()
      .duration(150)
      .attr("cx", (d) => xScale(d.x))
      .attr("cy", (d) => yScale(d.y));

    userPointsSelection
      .exit()
      .transition()
      .duration(150)
      .attr("opacity", 0)
      .remove();

    svg.on("click", (event) => {
      const [mouseX, mouseY] = d3.pointer(event);
      const chartX = mouseX - margin.left;
      const chartY = mouseY - margin.top;
      const xVal = xScale.invert(chartX);
      const yVal = yScale.invert(chartY);
      if (xVal >= 0 && xVal <= 10 && yVal >= 0 && yVal <= 10) {
        const newPoint = { x: xVal, y: yVal };
        trrack.apply("User Point Added", actions.addUserPoint(newPoint));
        setUserPoints((prev) => [...prev, newPoint]);
        updateAnswer();
      }
    });
  }, [generatedPoints, userPoints, actions, trrack, updateAnswer]);

  const combinedPoints = [...generatedPoints, ...userPoints];
  const r = computePearsonR(combinedPoints);

  const handleSliderChange = useCallback(
    (val: number) => {
      trrack.apply("Slider Changed", actions.sliderChange(val));
      setCorrelationStrength(val);
      updateAnswer();
    },
    [trrack, actions, updateAnswer],
  );

  const handleClearPoints = useCallback(() => {
    trrack.apply("Points Cleared", actions.clearPoints(undefined));
    setUserPoints([]);
    updateAnswer();
  }, [trrack, actions, updateAnswer]);

  return (
    <Card padding="md" radius="md">
      <Stack gap="sm">
        <Title order={3}>Correlation</Title>
        <Text size="sm">
          <strong>Step 1:</strong> Use the slider to adjust the strength and
          direction of the relationship.
        </Text>
        <Text size="sm">
          <strong>Step 2:</strong> Click on the chart to add your own points.
        </Text>
        <Text size="sm">
          <strong>Step 3:</strong> Observe how the correlation changes.
        </Text>

        <Divider my="sm" />

        <Slider
          label="Generated Correlation"
          value={correlationStrength}
          onChange={handleSliderChange}
          step={0.01}
          min={-1}
          max={1}
          marks={[-1, -0.5, 0, 0.5, 1].map((v) => ({
            value: v,
            label: v.toFixed(1),
          }))}
          styles={{
            track: {
              transition: "all 0.1s ease",
            },
            thumb: {
              transition: "all 0.1s ease",
            },
          }}
        />

        <Group justify="space-between" align="center" mt="sm">
          {/* left side: total points */}
          <Text fw={500}>
            Total points:
            {combinedPoints.length}
          </Text>

          {/* right side: r-text + clear-button */}
          <Group gap="xs" align="center">
            {r !== null && (
              <Text
                fw={500}
                c={Math.abs(r) > 0.6 ? "green" : "orange"}
                style={{
                  transition: "color 0.15s ease",
                }}
              >
                r = {r.toFixed(2)} →<em>{interpretCorrelation(r)}</em>
              </Text>
            )}

            {userPoints.length > 0 && (
              <Button
                size="xs"
                color="red"
                onClick={handleClearPoints}
                style={{
                  transition: "all 0.1s ease",
                }}
              >
                Clear My Points
              </Button>
            )}
          </Group>
        </Group>

        <Text size="sm" c="dimmed">
          Hint: Try setting the slider to 0 and adding points in a straight
          line. What happens to <em>r</em>?
        </Text>

        <svg
          ref={svgRef}
          width={400}
          height={300}
          style={{
            border: "1px solid #ccc",
            transition: "all 0.1s ease",
          }}
        />
      </Stack>
    </Card>
  );
}

function generateCorrelatedData(strength: number, n = 30): Point[] {
  const randNorm = d3.randomNormal.source(d3.randomLcg(123))(0, 1);

  // 1) draw (Z1, Z2) ~ iid N(0,1)
  const raw = Array.from({ length: n }, () => {
    const z1 = randNorm();
    const z2 = randNorm();
    // 2) mix so Corr(Z1, Y') = strength
    const yPrime = strength * z1 + Math.sqrt(1 - strength * strength) * z2;
    return { x: z1, y: yPrime };
  });

  // 3) rescale both to [0,10] without changing Corr
  const xs = raw.map((d) => d.x);
  const ys = raw.map((d) => d.y);
  const [minX, maxX] = [d3.min(xs)!, d3.max(xs)!];
  const [minY, maxY] = [d3.min(ys)!, d3.max(ys)!];

  return raw.map(({ x, y }) => ({
    x: ((x - minX) / (maxX - minX)) * 10,
    y: ((y - minY) / (maxY - minY)) * 10,
  }));
}

function computePearsonR(data: Point[]): number | null {
  if (data.length < 2) return null;
  const xs = data.map((d) => d.x);
  const ys = data.map((d) => d.y);
  const meanX = d3.mean(xs);
  const meanY = d3.mean(ys);
  if (meanX === undefined || meanY === undefined) return null;
  const numerator = d3.sum(xs.map((x, i) => (x - meanX) * (ys[i] - meanY)));
  const denominator =
    Math.sqrt(d3.sum(xs.map((x) => (x - meanX) ** 2))) *
    Math.sqrt(d3.sum(ys.map((y) => (y - meanY) ** 2)));
  return denominator === 0 ? null : numerator / denominator;
}

function interpretCorrelation(r: number): string {
  if (r >= 0.7) return "Strong Positive";
  if (r >= 0.3) return "Moderate Positive";
  if (r > -0.3) return "No Clear Correlation";
  if (r > -0.7) return "Moderate Negative";
  return "Strong Negative";
}
