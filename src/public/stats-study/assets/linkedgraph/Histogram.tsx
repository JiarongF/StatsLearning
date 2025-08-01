import { useEffect, useRef } from "react";
import * as d3 from "d3";

interface DataItem {
  id: number;
  value: number;
}

interface Margin {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

interface HistogramProps {
  data: DataItem[];
  width?: number;
  height?: number;
  margin?: Margin;
}

export default function Histogram({
  data,
  width = 500,
  height = 400,
  margin = {
    top: 20,
    right: 30,
    bottom: 40,
    left: 50,
  },
}: HistogramProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!data || data.length === 0) return;

    const values = data.map((d) => d.value);
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove(); // Clear previous content

    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const x = d3
      .scaleLinear()
      .domain([
        Math.floor(d3.min(values) || 0) - 0.5,
        Math.ceil(d3.max(values) || 0) + 0.5,
      ])
      .nice()
      .range([0, innerWidth]);

    const binGenerator = d3
      .bin()
      .domain(x.domain() as [number, number])
      .thresholds(x.ticks(10));

    const bins = binGenerator(values);

    const y = d3
      .scaleLinear()
      .domain([0, d3.max(bins, (d) => d.length) || 0])
      .nice()
      .range([innerHeight, 0]);

    const svgG = svg
      .attr("width", width)
      .attr("height", height)
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // Draw bars
    svgG
      .selectAll("rect")
      .data(bins)
      .enter()
      .append("rect")
      .attr("x", (d) => x(d.x0 || 0))
      .attr("y", (d) => y(d.length))
      .attr("width", (d) => {
        const binWidth = x(d.x1 || 0) - x(d.x0 || 0) - 1;
        return binWidth > 0 ? binWidth : 0;
      })
      .attr("height", (d) => innerHeight - y(d.length))
      .attr("fill", "#33A1FD") // blue color
      .attr("stroke", "black") // thin border
      .attr("stroke-width", 0.5)
      .attr("shape-rendering", "crispEdges"); // avoid anti-aliasing blur

    // X-axis
    svgG
      .append("g")
      .attr("transform", `translate(0,${innerHeight})`)
      .call(d3.axisBottom(x).ticks(10));

    // Y-axis
    svgG.append("g").call(d3.axisLeft(y));
  }, [data, width, height, margin]);

  return <svg ref={svgRef} />;
}
