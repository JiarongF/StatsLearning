import * as d3 from "d3";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Box, Slider } from "@mantine/core";
import { initializeTrrack, Registry } from "@trrack/core";
import { useChartDimensions } from "../../example-cleveland/assets/hooks/useChartDimensions";
import { StimulusParams } from "../../../store/types";

const chartSettings = {
  marginBottom: 40,
  marginLeft: 40,
  marginTop: 15,
  marginRight: 15,
  height: 650,
  width: 850,
};

interface ClickAccuracyTest {
  distance: number;
  speed: number;
  clickX: number;
  clickY: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ClickAccuracyTest({
  parameters,
  setAnswer,
  provenanceState,
}: StimulusParams<any, any>) {
  const [ref, dms] = useChartDimensions(chartSettings);
  const [x, setX] = useState(100);
  const [y, setY] = useState(100);
  const [speed, setSpeed] = useState(parameters.speed);
  const [distance, setDistance] = useState<number | null>(null);
  const { taskid } = parameters;

  useEffect(() => {
    if (provenanceState) {
      setDistance(provenanceState.distance);
      setSpeed(provenanceState.speed);
    }
  }, [provenanceState]);

  const { actions, trrack } = useMemo(() => {
    const reg = Registry.create();

    const clickAction = reg.register(
      "click",
      (
        state,
        click: { clickX: number; clickY: number; distance: number | null },
      ) => {
        state.clickX = click.clickX;
        state.clickY = click.clickY;
        state.distance = click.distance;
        return state;
      },
    );

    const speedAction = reg.register("drag", (state, ballSpeed: number) => {
      state.speed = ballSpeed;
      return state;
    });

    const trrackInst = initializeTrrack({
      registry: reg,
      initialState: {
        distance: 0,
        speed: 10,
        clickX: 0,
        clickY: 0,
      },
    });

    return {
      actions: {
        clickAction,
        speedAction,
      },
      trrack: trrackInst,
    };
  }, []);

  const updateAnswer = useCallback(() => {
    setAnswer({
      status: true,
      provenanceGraph: trrack.graph.backend,
      answers: {
        [taskid]: distance || "",
      },
    });
  }, [setAnswer, taskid, trrack, distance]);

  useEffect(() => {
    trrack.apply("SpeedChanged", actions.speedAction(speed));
    updateAnswer();
  }, [trrack, actions, speed, updateAnswer]);

  useEffect(() => {
    trrack.apply(
      "Clicked",
      actions.clickAction({ distance: distance || null, clickX: 0, clickY: 0 }),
    );
    updateAnswer();
  }, [trrack, actions, speed, updateAnswer, distance]);

  const clickCallback = useCallback((e: React.MouseEvent) => {
    const circle = d3.select("#movingCircle");
    const svg = d3.select("#clickAccuracySvg");
    const pointer = d3.pointer(e, svg.node());

    const circelPos = [+circle.attr("cx"), +circle.attr("cy")];
    const _distance = Math.round(
      Math.sqrt(
        (pointer[0] - circelPos[0]) ** 2 + (pointer[1] - circelPos[1]) ** 2,
      ),
    );
    setDistance(_distance);
  }, []);

  useEffect(() => {
    const nxtX = Math.random() * 800;
    const nxtY = Math.random() * 600;
    const _distance = Math.sqrt((nxtX - x) ** 2 + (nxtY - y) ** 2);
    const time = (_distance / speed) * 1000;
    const svgElement = d3.select(ref.current);
    svgElement
      .select("circle")
      .transition()
      .duration(time)
      .ease(d3.easeLinear)
      .attr("cx", nxtX)
      .attr("cy", nxtY)
      .on("end", () => {
        setX(nxtX);
        setY(nxtY);
      });
  }, [ref, speed, x, y]);

  return (
    <>
      <div
        className="Chart__wrapper"
        ref={ref}
        onClick={clickCallback}
        style={{ height: "650px" }}
      >
        <svg id="clickAccuracySvg" width={dms.width} height={dms.height}>
          <g
            transform={`translate(${[
              dms.marginLeft / 2,
              dms.marginTop / 2,
            ].join(",")})`}
          >
            <rect
              width="800"
              height="600"
              stroke="black"
              strokeWidth="5"
              fill="none"
            />
            <circle id="movingCircle" cx="100" cy="100" r="10" />
          </g>
        </svg>
      </div>
      <Box>
        Adjust speed (px/s):
        <Slider w={800} min={10} max={1000} value={speed} onChange={setSpeed} />
      </Box>
    </>
  );
}

export default ClickAccuracyTest;
