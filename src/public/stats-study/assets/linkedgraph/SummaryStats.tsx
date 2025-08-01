import { useEffect, useRef, useState } from "react";
import { Card, Text, Title, Tooltip } from "@mantine/core";
import { mean, median, deviation, extent } from "d3-array";
import { mode } from "simple-statistics";

interface DataItem {
  id: number;
  value: number;
}

interface SummaryStatsProps {
  data: DataItem[];
}

interface Stats {
  mean: number;
  median: number;
  sd: number;
  mode: number;
  min: number;
  max: number;
  range: number;
}

interface Changes {
  [key: string]: string;
}

interface PrevStats {
  mean: number | null;
  median: number | null;
  sd: number | null;
  min: number | null;
  max: number | null;
  range: number | null;
  mode: number | null;
}

function getChangeLabel(current: number, prev: number): string {
  const diff = current - prev;
  if (Math.abs(diff) < 1e-6) return "⚪ no change";
  return diff > 0 ? "🟢 increased" : "🔴 decreased";
}

export default function SummaryStats({ data }: SummaryStatsProps) {
  const [changes, setChanges] = useState<Changes>({});
  const prevStats = useRef<PrevStats>({
    mean: null,
    median: null,
    sd: null,
    min: null,
    max: null,
    range: null,
    mode: null,
  });

  const values = data.map((d) => d.value);
  const [minVal, maxVal] = extent(values) as [number, number];

  const currentStats: Stats = {
    mean: mean(values) || 0,
    median: median(values) || 0,
    sd: deviation(values) || 0,
    mode: mode(values),
    min: minVal,
    max: maxVal,
    range: maxVal - minVal,
  };

  useEffect(() => {
    const newChanges: Changes = {};
    for (const key of Object.keys(currentStats) as Array<keyof Stats>) {
      const current = currentStats[key];
      const prev = prevStats.current[key];
      if (prev !== null && typeof current === "number") {
        newChanges[key] = getChangeLabel(current, prev);
      }
    }
    prevStats.current = { ...currentStats };
    setChanges(newChanges);
  }, [data]);

  return (
    <Card shadow="sm" padding="sm" radius="md" withBorder>
      <Title order={5}>Summary Statistics</Title>

      <Tooltip label="Mean: (Σx) / n">
        <Text>
          Mean:
          {currentStats.mean.toFixed(2)} {changes.mean && `→ ${changes.mean}`}
        </Text>
      </Tooltip>

      <Tooltip label="Median: Middle value (sorted)">
        <Text>
          Median:
          {currentStats.median.toFixed(2)}{" "}
          {changes.median && `→ ${changes.median}`}
        </Text>
      </Tooltip>

      <Tooltip label="Mode: Most frequent value">
        <Text>
          Mode:
          {currentStats.mode} {changes.mode && `→ ${changes.mode}`}
        </Text>
      </Tooltip>

      <Tooltip label="Std Dev: √(Σ(x − mean)² / (n − 1))">
        <Text>
          Std Dev:
          {currentStats.sd.toFixed(2)} {changes.sd && `→ ${changes.sd}`}
        </Text>
      </Tooltip>

      <Tooltip label="Minimum value">
        <Text>
          Min:
          {currentStats.min}
        </Text>
      </Tooltip>

      <Tooltip label="Maximum value">
        <Text>
          Max:
          {currentStats.max}
        </Text>
      </Tooltip>

      <Tooltip label="Range: Max − Min">
        <Text>
          Range:
          {currentStats.range}
        </Text>
      </Tooltip>
    </Card>
  );
}
