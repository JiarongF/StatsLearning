import { useEffect, useMemo, useRef } from "react";
import { Card, Title, Text, Stack } from "@mantine/core";
import * as d3 from "d3";

interface Point { x: number; y: number; }

/** ---------- Anscombe datasets ---------- */
// #1: Influential point (Anscombe IV)
const anscombeX4 = [8,8,8,8,8,8,8,19,8,8,8];
const anscombeY4 = [6.58,5.76,7.71,8.84,8.47,7.04,5.25,12.50,5.56,7.91,6.89];
// #2: Linear with outliers (Anscombe II)
const anscombeX2 = [10,8,13,9,11,14,6,4,12,7,5];
const anscombeY2 = [9.14,8.14,8.74,8.77,9.26,8.10,6.13,3.10,9.13,7.26,4.74];
// #3: Curved arch (Anscombe III)
const anscombeX3 = [10,8,13,9,11,14,6,4,12,7,5];
const anscombeY3 = [7.46,6.77,12.74,7.11,7.81,8.84,6.08,5.39,8.15,6.42,5.73];

const toPts = (x:number[], y:number[]): Point[] => x.map((xi,i)=>({x:xi,y:y[i]}));

/** ---------- Symmetric U and ∩ ---------- */
function mirroredNoise(n:number, seed:number, sd=0.45) {
  const half = Math.floor(n/2);
  const rng = d3.randomLcg(seed);
  const norm = d3.randomNormal.source(rng)(0, sd);
  const halfNoise = d3.range(half).map(()=>norm());
  return (n%2===0) ? [...halfNoise, ...halfNoise.slice().reverse()] : [...halfNoise,0,...halfNoise.slice().reverse()];
}

function makeTallU(n=60): Point[] {
  const xs = d3.range(n).map(i=>d3.scaleLinear().domain([0,n-1]).range([2,18])(i));
  const noise = mirroredNoise(n,2025,0.55);
  const ys = xs.map((x,i)=>6 + 0.25*(x-10)**2 + noise[i]);
  return xs.map((x,i)=>({x,y:ys[i]}));
}



function makeTallCap(n=60): Point[] {
  const xs = d3.range(n).map(i=>d3.scaleLinear().domain([0,n-1]).range([2,18])(i));
  const noise = mirroredNoise(n,4242,0.55);
  const ys = xs.map((x,i)=>22 - 0.25*(x-10)**2 + noise[i]);
  return xs.map((x,i)=>({x,y:ys[i]}));
}


/** ---------- Pearson r ---------- */
function pearsonR(data:Point[]): number|null {
  if (data.length < 2) return null;
  const xs=data.map(d=>d.x), ys=data.map(d=>d.y);
  const mx=d3.mean(xs)!, my=d3.mean(ys)!;
  const num=d3.sum(xs.map((x,i)=>(x-mx)*(ys[i]-my)))!;
  const den=Math.sqrt(d3.sum(xs.map(x=>(x-mx)**2))!)*Math.sqrt(d3.sum(ys.map(y=>(y-my)**2))!);
  return den===0?null:num/den;
}

/** ---------- Reusable plot card ---------- */
function PatternCard({
  title,data,
  xDomain=[0,20],yDomain=[0,15],
  xTicks=[0,5,10,15,20],yTicks=[0,5,10,15],
  hideTicks=false
}:{title:string;data:Point[];xDomain?:[number,number];yDomain?:[number,number];
  xTicks?:number[];yTicks?:number[];hideTicks?:boolean}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const width=380,height=300;
  const margin={top:20,right:20,bottom:40,left:40};
  const iw=width-margin.left-margin.right;
  const ih=height-margin.top-margin.bottom;

  const xScale=useMemo(()=>d3.scaleLinear().domain(xDomain).range([0,iw]),[iw,xDomain]);
  const yScale=useMemo(()=>d3.scaleLinear().domain(yDomain).range([ih,0]),[ih,yDomain]);

  useEffect(()=>{
    if(!svgRef.current)return;
    const svg=d3.select(svgRef.current);
    svg.selectAll("*").remove();
    const g=svg.append("g").attr("transform",`translate(${margin.left},${margin.top})`);
    const xAxis=d3.axisBottom(xScale);
    const yAxis=d3.axisLeft(yScale);
    if(hideTicks){
      xAxis.tickValues([]);
      yAxis.tickValues([]);
    } else {
      xAxis.tickValues(xTicks);
      yAxis.tickValues(yTicks);
    }
    g.append("g").attr("transform",`translate(0,${ih})`).call(xAxis);
    g.append("g").call(yAxis);
    g.append("g").selectAll("circle").data(data).join("circle")
      .attr("cx",d=>xScale(d.x)).attr("cy",d=>yScale(d.y))
      .attr("r",3).attr("fill","#2f9e44");
  },[data,xScale,yScale,ih,hideTicks,xTicks,yTicks]);

  const r=pearsonR(data);

  return (
    <Card padding="sm" radius="md" shadow="sm" style={{marginBottom:16}}>
      <Stack gap="xs" align="center">
        <Title order={4}>{title}</Title>
        {r!==null && <Text size="sm" c="green">correlation = {r.toFixed(3)}</Text>}
        <svg ref={svgRef} width={width} height={height}
             style={{border:"1px solid #ccc",borderRadius:6,display:"block"}}/>
      </Stack>
    </Card>
  );
}

/** ---------- Main component ---------- */
export default function FivePatternsSuite() {
  const ds1=toPts(anscombeX4,anscombeY4);
  const ds2=toPts(anscombeX2,anscombeY2);
  const ds3=toPts(anscombeX3,anscombeY3);
  const ds4=makeTallU();

  const ds5=makeTallCap();

  return (
    <Stack>
      <PatternCard title="1. Influential Point (Anscombe IV)" data={ds1}/>
      <PatternCard title="2. Linear with Outliers (Anscombe II)" data={ds2}/>
      <PatternCard title="3. Curved Arch (Anscombe III)" data={ds3}/>
      <PatternCard title="4. Symmetric U (tall)" data={ds4} yDomain={[0,30]} hideTicks/>
      <PatternCard title="5. Symmetric ∩ (tall)" data={ds5} yDomain={[0,30]} hideTicks/>
    </Stack>
  );
}
