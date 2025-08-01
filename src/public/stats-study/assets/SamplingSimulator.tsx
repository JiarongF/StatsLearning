import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  Button,
  Card,
  Group,
  NumberInput,
  Select,
  Stack,
  Title,
  Text,
} from "@mantine/core";
import * as d3 from "d3";
import { initializeTrrack, Registry } from "@trrack/core";
import type { StimulusParams } from "../../../store/types";

type PopulationShape = "Normal" | "Uniform" | "Skewed";

interface ProvenanceState {
  shape: PopulationShape;
  sampleSize: number;
  numSamples: number;
  population: number[];
  sampleMeans: number[];
  popMean: number | null;
  sampleMeanAvg: number | null;
}

export default function SamplingSimulator({
  parameters,
  setAnswer,
  provenanceState,
}: StimulusParams<any, ProvenanceState>) {
  const populationSvgRef = useRef<SVGSVGElement>(null);
  const samplingDistSvgRef = useRef<SVGSVGElement>(null);
  const { taskid } = parameters;

  // React state
  const [shape, setShape] = useState<PopulationShape>("Normal");
  const [sampleSize, setSampleSize] = useState<number>(30);
  const [numSamples, setNumSamples] = useState<number>(200);
  const [population, setPopulation] = useState<number[]>([]);
  const [sampleMeans, setSampleMeans] = useState<number[]>([]);
  const [popMean, setPopMean] = useState<number | null>(null);
  const [sampleMeanAvg, setSampleMeanAvg] = useState<number | null>(null);

  // provenance registry & Trrack
  const { actions, trrack } = useMemo(() => {
    const reg = Registry.create();

    const changeShape = reg.register(
      "changeShape",
      (state, newShape: PopulationShape) => {
        state.shape = newShape;
        const pop = generatePopulation(newShape);
        state.population = pop;
        state.sampleMeans = []; // Clear simulation results
        state.popMean = calculateMean(pop);
        state.sampleMeanAvg = null; // Clear simulation results
        return state;
      },
    );

    const changeSampleSize = reg.register(
      "changeSampleSize",
      (state, size: number) => {
        state.sampleSize = size;
        state.sampleMeans = []; // Clear simulation results when parameters change
        state.sampleMeanAvg = null; // Clear simulation results when parameters change
        return state;
      },
    );

    const changeNumSamples = reg.register(
      "changeNumSamples",
      (state, num: number) => {
        state.numSamples = num;
        state.sampleMeans = []; // Clear simulation results when parameters change
        state.sampleMeanAvg = null; // Clear simulation results when parameters change
        return state;
      },
    );

    const runSimulation = reg.register("runSimulation", (state, _: void) => {
      const means = Array.from({ length: state.numSamples }, () =>
        sampleMean(state.population, state.sampleSize),
      );
      state.sampleMeans = means;
      state.sampleMeanAvg = calculateMean(means);
      return state;
    });

    const initialPop = generatePopulation("Normal");
    return {
      actions: {
        changeShape,
        changeSampleSize,
        changeNumSamples,
        runSimulation,
      },
      trrack: initializeTrrack({
        registry: reg,
        initialState: {
          shape: "Normal" as PopulationShape,
          sampleSize: 30,
          numSamples: 200,
          population: initialPop,
          sampleMeans: [],
          popMean: calculateMean(initialPop),
          sampleMeanAvg: null,
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
          shape,
          sampleSize,
          numSamples,
          popMean,
          sampleMeanAvg,
          hasRunSimulation: sampleMeans.length > 0,
        }),
      },
    });
  }, [
    setAnswer,
    taskid,
    trrack,
    shape,
    sampleSize,
    numSamples,
    popMean,
    sampleMeanAvg,
    sampleMeans.length,
  ]);

  // initial answer
  useEffect(() => {
    const initialPop = generatePopulation("Normal");
    setPopulation(initialPop);
    setPopMean(calculateMean(initialPop));
    updateAnswer();
  }, []);

  // replay sync
  useEffect(() => {
    if (provenanceState) {
      if (provenanceState.shape !== undefined) setShape(provenanceState.shape);
      if (provenanceState.sampleSize !== undefined)
        setSampleSize(provenanceState.sampleSize);
      if (provenanceState.numSamples !== undefined)
        setNumSamples(provenanceState.numSamples);
      if (provenanceState.population) setPopulation(provenanceState.population);
      if (provenanceState.popMean !== undefined)
        setPopMean(provenanceState.popMean);

      // Only restore sampleMeans and sampleMeanAvg if they exist in provenance state
      // The provenance actions should have already cleared them when parameters changed
      if (provenanceState.sampleMeans !== undefined) {
        setSampleMeans(provenanceState.sampleMeans);
      }
      if (provenanceState.sampleMeanAvg !== undefined) {
        setSampleMeanAvg(provenanceState.sampleMeanAvg);
      }

      updateAnswer();
    }
  }, [provenanceState, updateAnswer]);

  // Draw population distribution
  useEffect(() => {
    if (!population.length) return;

    const width = 400;
    const height = 300;
    const margin = {
      top: 20,
      right: 20,
      bottom: 40,
      left: 50,
    };
    const svg = d3.select(populationSvgRef.current);
    svg.selectAll("*").remove();

    const bins = d3
      .histogram()
      .domain(d3.extent(population) as [number, number])
      .thresholds(20)(population);

    const xScale = d3
      .scaleLinear()
      .domain(d3.extent(population) as [number, number])
      .range([margin.left, width - margin.right]);

    const yScale = d3
      .scaleLinear()
      .domain([0, d3.max(bins, (d) => d.length) as number])
      .range([height - margin.bottom, margin.top]);

    // Add axes
    svg
      .append("g")
      .attr("transform", `translate(0,${height - margin.bottom})`)
      .call(d3.axisBottom(xScale));

    svg
      .append("g")
      .attr("transform", `translate(${margin.left},0)`)
      .call(d3.axisLeft(yScale));

    // Add bars
    svg
      .selectAll("rect")
      .data(bins)
      .join("rect")
      .attr("x", (d) => xScale(d.x0!))
      .attr("y", (d) => yScale(d.length))
      .attr("width", (d) => Math.max(0, xScale(d.x1!) - xScale(d.x0!)))
      .attr("height", (d) => yScale(0) - yScale(d.length))
      .attr("fill", "#4dabf7")
      .attr("stroke", "white")
      .attr("stroke-width", 1);

    // Add mean line
    if (popMean !== null) {
      svg
        .append("line")
        .attr("x1", xScale(popMean))
        .attr("x2", xScale(popMean))
        .attr("y1", margin.top)
        .attr("y2", height - margin.bottom)
        .attr("stroke", "#1971c2")
        .attr("stroke-width", 2)
        .attr("stroke-dasharray", "4,4");
    }
  }, [population, popMean]);

  // Draw sampling distribution
  useEffect(() => {
    if (!sampleMeans.length) {
      const svg = d3.select(samplingDistSvgRef.current);
      svg.selectAll("*").remove();
      return;
    }

    const width = 400;
    const height = 300;
    const margin = {
      top: 20,
      right: 20,
      bottom: 40,
      left: 50,
    };
    const svg = d3.select(samplingDistSvgRef.current);
    svg.selectAll("*").remove();

    const bins = d3
      .histogram()
      .domain(d3.extent(sampleMeans) as [number, number])
      .thresholds(20)(sampleMeans);

    const xScale = d3
      .scaleLinear()
      .domain(d3.extent(sampleMeans) as [number, number])
      .range([margin.left, width - margin.right]);

    const yScale = d3
      .scaleLinear()
      .domain([0, d3.max(bins, (d) => d.length) as number])
      .range([height - margin.bottom, margin.top]);

    // Add axes
    svg
      .append("g")
      .attr("transform", `translate(0,${height - margin.bottom})`)
      .call(d3.axisBottom(xScale));

    svg
      .append("g")
      .attr("transform", `translate(${margin.left},0)`)
      .call(d3.axisLeft(yScale));

    // Add bars with animation
    svg
      .selectAll("rect")
      .data(bins)
      .join("rect")
      .attr("x", (d) => xScale(d.x0!))
      .attr("y", height - margin.bottom)
      .attr("width", (d) => Math.max(0, xScale(d.x1!) - xScale(d.x0!)))
      .attr("height", 0)
      .attr("fill", "#fab005")
      .attr("stroke", "white")
      .attr("stroke-width", 1)
      .transition()
      .duration(500)
      .attr("y", (d) => yScale(d.length))
      .attr("height", (d) => yScale(0) - yScale(d.length));

    // Add mean line
    if (sampleMeanAvg !== null) {
      svg
        .append("line")
        .attr("x1", xScale(sampleMeanAvg))
        .attr("x2", xScale(sampleMeanAvg))
        .attr("y1", margin.top)
        .attr("y2", height - margin.bottom)
        .attr("stroke", "#e67700")
        .attr("stroke-width", 2)
        .attr("stroke-dasharray", "4,4")
        .attr("opacity", 0)
        .transition()
        .duration(500)
        .attr("opacity", 1);
    }
  }, [sampleMeans, sampleMeanAvg]);

  const handleShapeChange = (newShape: string | null) => {
    if (!newShape || !["Normal", "Uniform", "Skewed"].includes(newShape))
      return;
    const shapeValue = newShape as PopulationShape;
    trrack.apply("Shape Changed", actions.changeShape(shapeValue));
    setShape(shapeValue);
    const pop = generatePopulation(shapeValue);
    setPopulation(pop);
    setSampleMeans([]); // Clear local state
    setPopMean(calculateMean(pop));
    setSampleMeanAvg(null); // Clear local state
    updateAnswer();
  };

  const handleSampleSizeChange = (value: string | number) => {
    const size = typeof value === "string" ? parseInt(value) : value;
    if (isNaN(size)) return;
    trrack.apply("Sample Size Changed", actions.changeSampleSize(size));
    setSampleSize(size);
    setSampleMeans([]); // Clear local state
    setSampleMeanAvg(null); // Clear local state
    updateAnswer();
  };

  const handleNumSamplesChange = (value: string | number) => {
    const num = typeof value === "string" ? parseInt(value) : value;
    if (isNaN(num)) return;
    trrack.apply("Number of Samples Changed", actions.changeNumSamples(num));
    setNumSamples(num);
    setSampleMeans([]); // Clear local state
    setSampleMeanAvg(null); // Clear local state
    updateAnswer();
  };

  const handleRunSimulation = () => {
    trrack.apply("Simulation Run", actions.runSimulation(undefined));
    const means = Array.from({ length: numSamples }, () =>
      sampleMean(population, sampleSize),
    );
    setSampleMeans(means);
    setSampleMeanAvg(calculateMean(means));
    updateAnswer();
  };

  return (
    <Stack gap="md">
      <Title order={3}>Sample Distribution Simulator</Title>
      <Group grow>
        <Select
          label="Population Shape"
          value={shape}
          onChange={handleShapeChange}
          data={["Normal", "Uniform", "Skewed"]}
        />
        <NumberInput
          label="Sample Size (n)"
          value={sampleSize}
          onChange={handleSampleSizeChange}
          min={1}
          max={1000}
        />
        <NumberInput
          label="# of Samples"
          value={numSamples}
          onChange={handleNumSamplesChange}
          min={10}
          max={1000}
        />
        <Stack gap={0}>
          <div style={{ height: 8 }} />
          <Button onClick={handleRunSimulation}>Simulate</Button>
        </Stack>
      </Group>

      <Group grow>
        {/* Population Distribution */}
        <Card shadow="xs" padding="sm" radius="md" withBorder>
          <Title order={5}>Population Distribution</Title>
          <Text size="sm" c="blue" fw={700} mb="xs">
            Population Mean: {popMean ? popMean.toFixed(2) : "N/A"}
          </Text>
          <svg
            ref={populationSvgRef}
            width={400}
            height={300}
            style={{ border: "1px solid #e9ecef" }}
          />
        </Card>

        {/* Sampling Distribution */}
        <Card shadow="xs" padding="sm" radius="md" withBorder>
          <Title order={5}>Sampling Distribution of the Mean</Title>
          <Text size="sm" c="orange" fw={700} mb="xs">
            Mean of Sample Means:{" "}
            {sampleMeanAvg ? sampleMeanAvg.toFixed(2) : "Run simulation"}
          </Text>
          <svg
            ref={samplingDistSvgRef}
            width={400}
            height={300}
            style={{ border: "1px solid #e9ecef" }}
          />
        </Card>
      </Group>
    </Stack>
  );
}

// Helper function to calculate mean
function calculateMean(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

// Generate a population distribution
function generatePopulation(
  shape: PopulationShape,
  size: number = 10000,
): number[] {
  if (shape === "Normal") {
    // Box-Muller transform for normal distribution
    const normal: number[] = [];
    for (let i = 0; i < size; i += 2) {
      const u1 = Math.random();
      const u2 = Math.random();
      const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      const z1 = Math.sqrt(-2 * Math.log(u1)) * Math.sin(2 * Math.PI * u2);
      normal.push(z0 * 2 + 5, z1 * 2 + 5); // scale and shift
    }
    return normal.slice(0, size);
  }
  if (shape === "Uniform")
    return Array.from({ length: size }, () => Math.random() * 10);
  if (shape === "Skewed")
    return Array.from({ length: size }, () => Math.random() ** 2 * 10);
  return [];
}

// Draw a sample of n values and return its mean
function sampleMean(population: number[], n: number): number {
  const sample = Array.from(
    { length: n },
    () => population[Math.floor(Math.random() * population.length)],
  );
  return sample.reduce((a, b) => a + b, 0) / n;
}
