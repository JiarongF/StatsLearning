import React, { useMemo, useRef, useState, useEffect } from 'react';
import {
  Container,
  Paper,
  Title,
  Text,
  Button,
  TextInput,
  Group,
  Stack,
  Progress,
  Badge,
  Card,
  Divider,
  Center,
  Alert,
  Collapse
} from '@mantine/core';
import { IconTarget } from '@tabler/icons-react';

/* -------------------- Types (simplified: no per-trial accuracy/score) -------------------- */
interface DataPoint { x: number; y: number; }

interface TrialResponse {
  trial: number;
  actualCorrelation: number;
  userGuess: number;
  isCorrect: boolean;
  timestamp: number;
}

interface StudyData {
  totalTrials: number;
  totalCorrect: number;
  percentCorrect: number;  // 0..100
  responses: TrialResponse[];
  timeSpent: number;       // ms
  correlations: number[];
}

interface StudyConfig {
  timeLimit?: number;        // IGNORED (no timer now)
  correlations?: number[];   // optional override sequence (default 0.1..1.0)
}

interface ControlProps {
  onComplete?: (data: StudyData) => void;
  studyConfig?: StudyConfig;
  participantData?: Record<string, any>;
  trialIndex?: number;
  setAnswer?: (answer: any) => void; // kept for compatibility (unused)
}

interface ScatterPlotProps {
  data: DataPoint[];
  correlation: number;
  width?: number;
  height?: number;
}

/* -------------------- Layout constants -------------------- */
const FEEDBACK_CARD_W = 560;      // fixed width so Why? toggle doesn't change layout
const PLOT_Q_SIZE = 320;          // question plot size
const PLOT_FB_SIZE = 300;         // feedback plot size

/* -------------------- Exact-r helpers (seeded, smooth) -------------------- */
const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
const sd = (a: number[]) => {
  const m = mean(a);
  const v = a.reduce((s, v) => s + (v - m) ** 2, 0) / Math.max(1, a.length - 1);
  return Math.sqrt(Math.max(v, 1e-12));
};
const zscore = (a: number[]) => {
  const m = mean(a), s = sd(a) || 1;
  return a.map(v => (v - m) / s);
};
const rescale = (a: number[], lo: number, hi: number) => {
  const mn = Math.min(...a), mx = Math.max(...a), d = mx - mn || 1;
  return a.map(v => lo + ((v - mn) / d) * (hi - lo));
};

class SeededRandom {
  private seed: number;
  constructor(seed: number) { this.seed = seed >>> 0; }
  random(): number {
    this.seed = (1664525 * this.seed + 1013904223) >>> 0;
    return this.seed / 0x100000000;
  }
}
function boxMuller(rng: SeededRandom) {
  let u1 = 0; while (u1 === 0) u1 = rng.random(); // avoid log(0)
  const u2 = rng.random();
  const R = Math.sqrt(-2 * Math.log(u1));
  return { z1: R * Math.cos(2 * Math.PI * u2), z2: R * Math.sin(2 * Math.PI * u2) };
}

/** Build a stable base (Xs, Zperp) once per trial (sample-orthogonal). */
function makeBase(n = 100, seed = 777): { Xs: number[]; Zperp: number[] } {
  const rng = new SeededRandom(seed);
  const X0 = Array.from({ length: n }, () => boxMuller(rng).z1);
  const Z0 = Array.from({ length: n }, () => boxMuller(rng).z2);

  const Xs = zscore(X0);

  // orthogonalize Z0 against Xs so sample corr(Xs, Zperp) = 0
  const denom = Xs.reduce((s, x) => s + x * x, 0) || 1e-12;
  const beta = Xs.reduce((s, x, i) => s + x * Z0[i], 0) / denom;
  const Zperp = zscore(Z0.map((z, i) => z - beta * Xs[i]));

  return { Xs, Zperp };
}

/** Get points for any r using the same base; exact sample corr = r. */
function pointsAtR(
  base: { Xs: number[]; Zperp: number[] },
  r: number,
  xRange: [number, number] = [0, 10],
  yRange: [number, number] = [0, 10],
): DataPoint[] {
  const { Xs, Zperp } = base;
  const b = Math.sqrt(Math.max(0, 1 - r * r));
  const Y = Xs.map((x, i) => r * x + b * Zperp[i]);   // exact sample r
  const Xp = rescale(Xs, xRange[0], xRange[1]);
  const Yp = rescale(Y,  yRange[0], yRange[1]);
  return Xp.map((x, i) => ({ x, y: Yp[i] }));
}

/* -------------------- Scatter Plot -------------------- */
const ScatterPlot: React.FC<ScatterPlotProps> = ({
  data,
  correlation,
  width = PLOT_Q_SIZE,
  height = PLOT_Q_SIZE
}) => {
  const margin = 36;
  const plotWidth = width - 2 * margin;
  const plotHeight = height - 2 * margin;

  const xMin = Math.min(...data.map(d => d.x));
  const xMax = Math.max(...data.map(d => d.x));
  const yMin = Math.min(...data.map(d => d.y));
  const yMax = Math.max(...data.map(d => d.y));

  const xScale = (x: number): number => ((x - xMin) / (xMax - xMin)) * plotWidth + margin;
  const yScale = (y: number): number => height - (((y - yMin) / (yMax - yMin)) * plotHeight + margin);

  return (
    <Center>
      <div style={{ padding: '0.35rem', background: 'white', borderRadius: '8px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
        <svg width={width} height={height} style={{ background: 'white' }}>
          {/* Grid lines */}
          {[0.25, 0.5, 0.75].map(tick => (
            <g key={tick}>
              <line
                x1={margin + tick * plotWidth}
                y1={margin}
                x2={margin + tick * plotWidth}
                y2={height - margin}
                stroke="#f1f3f4"
                strokeWidth="1"
              />
              <line
                x1={margin}
                y1={margin + tick * plotHeight}
                x2={width - margin}
                y2={margin + tick * plotHeight}
                stroke="#f1f3f4"
                strokeWidth="1"
              />
            </g>
          ))}

          {/* Axes */}
          <line x1={margin} y1={height - margin} x2={width - margin} y2={height - margin} stroke="#495057" strokeWidth="2" />
          <line x1={margin} y1={margin} x2={margin} y2={height - margin} stroke="#495057" strokeWidth="2" />

          {/* Data points */}
          {data.map((point, i) => (
            <circle
              key={i}
              cx={xScale(point.x)}
              cy={yScale(point.y)}
              r="3"
              fill="#228be6"
              fillOpacity="0.7"
              stroke="#1c7ed6"
              strokeWidth="1"
            />
          ))}
        </svg>
      </div>
    </Center>
  );
};

/* -------------------- Main Control Component -------------------- */
const Control: React.FC<ControlProps> = ({
  onComplete,
  studyConfig = {},
  participantData = {},
  trialIndex = 0,
  setAnswer
}) => {
  const defaultCorrs = useMemo(
    () => studyConfig.correlations ?? [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0],
    [studyConfig.correlations]
  );

  // shuffle once (remove shuffle to preserve provided order)
  const [shuffledCorrelations] = useState<number[]>(
    () => [...defaultCorrs].sort(() => Math.random() - 0.5)
  );

  // Create deterministic seeds per trial (share these with slider condition later)
  const baseSeeds = useMemo(
    () => shuffledCorrelations.map((_, i) => 1000 + i),
    [shuffledCorrelations]
  );

  // Build bases once per trial
  const bases = useMemo(
    () => baseSeeds.map(seed => makeBase(100, seed)),
    [baseSeeds]
  );

  // Build plots for each trial at its target r* (render ~0.99 for the “1.0” label)
  const plotData = useMemo(
    () => shuffledCorrelations.map((r, i) => pointsAtR(bases[i], Math.min(r, 0.99))),
    [shuffledCorrelations, bases]
  );

  const [studyStarted, setStudyStarted] = useState<boolean>(false);
  const [currentTrial, setCurrentTrial] = useState<number>(0);
  const [userGuess, setUserGuess] = useState<number | string>('');
  const [showFeedback, setShowFeedback] = useState<boolean>(false);
  const [responses, setResponses] = useState<TrialResponse[]>([]);
  const [isComplete, setIsComplete] = useState<boolean>(false);
  const [showAlert, setShowAlert] = useState<boolean>(false);
  const [whyOpen, setWhyOpen] = useState<boolean>(false);

  // time tracking
  const startRef = useRef<number | null>(null);

  // Custom Next button control - keep parity with your previous behavior
  useEffect(() => {
    const controlNextButton = () => {
      const nextButton = document.querySelector('button[type="submit"]') as HTMLButtonElement;
      if (nextButton) {
        if (!isComplete) {
          nextButton.disabled = true;
          nextButton.style.opacity = '0.5';
          nextButton.style.cursor = 'not-allowed';
          nextButton.title = `Complete all ${shuffledCorrelations.length} trials to continue`;
        } else {
          nextButton.disabled = false;
          nextButton.style.opacity = '1';
          nextButton.style.cursor = 'pointer';
          nextButton.title = '';
        }
      }
    };

    controlNextButton();
    const observer = new MutationObserver(controlNextButton);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [isComplete, shuffledCorrelations.length]);

  const startStudy = (): void => {
    setStudyStarted(true);
    startRef.current = performance.now();
  };

  const actualCorrelation = shuffledCorrelations[currentTrial];
  const currentData = plotData[currentTrial];
  const guessNumber = typeof userGuess === 'string' ? parseFloat(userGuess) : userGuess;

  const handleSubmit = (): void => {
    const guess = typeof userGuess === 'string' ? parseFloat(userGuess) : userGuess;

    // Validate input range
    if (userGuess === '' || isNaN(guess) || guess < 0 || guess > 1) {
      setShowAlert(true);
      return;
    }
    setShowAlert(false);

    const isCorrect = Number(guess.toFixed(1)) === Number(actualCorrelation.toFixed(1));

    const responseData: TrialResponse = {
      trial: currentTrial + 1,
      actualCorrelation,
      userGuess: Number(guess.toFixed(2)),
      isCorrect,
      timestamp: Date.now()
    };

    setResponses(prev => [...prev, responseData]);
    setShowFeedback(true);
  };

  const nextTrial = (): void => {
    if (currentTrial < shuffledCorrelations.length - 1) {
      setCurrentTrial(t => t + 1);
      setUserGuess('');
      setShowFeedback(false);
      setShowAlert(false);
      setWhyOpen(false);
    } else {
      completeStudy();
    }
  };

  const completeStudy = (): void => {
    setIsComplete(true);
    const end = performance.now();
    const timeSpent = startRef.current ? end - startRef.current : 0;

    const totalTrials = responses.length; // each submit pushes a response
    const correlations = shuffledCorrelations.slice(0, totalTrials);
    const totalCorrect = responses.filter(r => r.isCorrect).length;
    const percentCorrect = totalTrials > 0 ? (totalCorrect / totalTrials) * 100 : 0;

    const studyData: StudyData = {
      totalTrials,
      totalCorrect,
      percentCorrect,
      responses,
      timeSpent,
      correlations
    };

    onComplete?.(studyData);
  };

  const progress = ((currentTrial + (showFeedback ? 1 : 0)) / shuffledCorrelations.length) * 100;

  // Helpers for feedback display
  const displayedGuess = (typeof userGuess === 'number' ? userGuess : guessNumber);
  const isCorrect = Number(displayedGuess?.toFixed(1)) === Number(actualCorrelation.toFixed(1));

  /* -------------------- RENDER -------------------- */
  if (!studyStarted) {
    return (
      <Container size="lg" py="xl">
        <Paper shadow="md" p="xl" radius="md">
          <Stack gap="lg" align="center">
            <Title order={2} ta="center">Positive Correlation Estimation</Title>

            <Stack gap="md" maw={720}>
              <Text size="lg">
                In this task, you will view scatter plots and estimate their <strong>positive correlation coefficients</strong>.
              </Text>

              <Alert color="blue" title="About the Data">
                These plots are generated to illustrate a range of positive correlations — they are not from real data,
                but are created to help you practice estimating correlation strength.
              </Alert>

              <Card withBorder p="md" bg="blue.0">
                <Stack gap="sm">
                  <Text fw={500}>Instructions:</Text>
                  <Text size="sm">• View scatter plots one at a time</Text>
                  <Text size="sm">• Estimate the <strong>correlation coefficient</strong> (0.0 to 1.0)</Text>
                  <Text size="sm">• You'll get brief feedback after each guess</Text>
                  <Text size="sm">• Complete all {defaultCorrs.length} trials</Text>
                  <Text size="sm">• 🎙️ Please remember to think-aloud as you explore</Text>
                </Stack>
              </Card>
            </Stack>

            <Button size="lg" onClick={startStudy}>
              Start Task
            </Button>
          </Stack>
        </Paper>
      </Container>
    );
  }

  // Completion screen
  if (isComplete) {
    const totalTrials = responses.length;
    const totalCorrect = responses.filter(r => r.isCorrect).length;
    const percentCorrect = totalTrials > 0 ? ((totalCorrect / totalTrials) * 100).toFixed(1) : '0.0';

    return (
      <Container size="lg" py="xl">
        <Paper shadow="md" p="xl" radius="md">
          <Stack gap="lg" align="center">
            <Title order={2}>Task Complete!</Title>

            <Group gap="xl">
              <Stack gap="xs" align="center">
                <Badge size="lg" variant="light" color="blue">
                  {responses.length} Questions
                </Badge>
                <Text size="sm" c="dimmed">Completed</Text>
              </Stack>

              <Stack gap="xs" align="center">
                <Badge size="lg" variant="light" color="violet">
                  {percentCorrect}%
                </Badge>
                <Text size="sm" c="dimmed">Percent Correct</Text>
              </Stack>
            </Group>

            <Text ta="center" c="dimmed" fw={500}>
              ✅ All questions completed! You can now proceed to the next section.
            </Text>
          </Stack>
        </Paper>
      </Container>
    );
  }

  // Trial screen
  return (
    <Container size="lg" py="md">
      <Stack gap="md" align="center">
        {/* Sticky progress */}
        <Card
          withBorder
          radius="md"
          p="sm"
          bg="gray.0"
          maw={720}
          w="100%"
          style={{ position: 'sticky', top: 0, zIndex: 5, backdropFilter: 'blur(4px)' }}
        >
          <Group justify="space-between" align="center">
            <Text fw={600}>Question {currentTrial + 1} of {shuffledCorrelations.length}</Text>
            <Progress value={progress} w={180} size="sm" />
          </Group>
        </Card>

        {/* Main content */}
        <Card withBorder radius="md" p="md" shadow="sm" maw={720} w="100%">
          {!showFeedback ? (
            <Stack gap="md" align="center">
              <Title order={3} ta="center" c="dark.8">
                Estimate the Correlation
              </Title>

              {/* plot wrapper matches fixed feedback width for alignment */}
              <div style={{ width: FEEDBACK_CARD_W, maxWidth: '100%' }}>
                <ScatterPlot data={currentData} correlation={actualCorrelation} width={PLOT_Q_SIZE} height={PLOT_Q_SIZE} />
              </div>

              <Stack gap="sm" align="center" w="100%" maw={360}>
                <Stack gap="xs" w="100%">
                  <Text fw={500} ta="center">Your estimate (0.0 to 1.0):</Text>
                  <TextInput
                    placeholder="e.g., 0.7"
                    value={userGuess}
                    onChange={(event) => {
                      setUserGuess(event.currentTarget.value);
                      if (showAlert) setShowAlert(false);
                    }}
                    size="md"
                    radius="md"
                    error={showAlert ? "Value must be between 0.0 and 1.0" : null}
                    styles={{
                      input: {
                        textAlign: 'center',
                        fontSize: '1.1rem',
                        fontWeight: 500
                      }
                    }}
                  />
                  <Text size="xs" ta="center" c="dimmed">
                    0.0 = no relationship, 1.0 = perfect positive relationship
                  </Text>
                </Stack>

                <Button
                  size="md"
                  onClick={handleSubmit}
                  leftSection={<IconTarget size={16} />}
                  radius="md"
                  variant="filled"
                  fullWidth
                >
                  Submit Answer
                </Button>
              </Stack>
            </Stack>
          ) : (
            <Stack gap="md" align="center">
              {/* Status header — fixed width */}
              <Card withBorder radius="md" p="xs" bg={isCorrect ? 'teal.0' : 'red.0'} w={FEEDBACK_CARD_W} mx="auto">
                <Text fw={700} c={isCorrect ? 'teal.8' : 'red.8'}>
                  {isCorrect ? '✅ Correct' : '❌ Not quite'}
                </Text>
              </Card>

              {/* Plot — fixed width wrapper to align with cards */}
              <div style={{ width: FEEDBACK_CARD_W, maxWidth: '100%' }}>
                <ScatterPlot data={currentData} correlation={actualCorrelation} width={PLOT_FB_SIZE} height={PLOT_FB_SIZE} />
              </div>

              {/* Details — fixed width */}
              <Card withBorder p="md" radius="md" w={FEEDBACK_CARD_W} mx="auto" bg="gray.0">
                <Stack gap="sm">
                  <Group justify="space-between" align="center">
                    <Text fw={500}>Your answer</Text>
                    <Badge color="blue" size="lg" variant="light">
                      {(typeof userGuess === 'number' ? userGuess : guessNumber).toFixed(1)}
                    </Badge>
                  </Group>

                  <Group justify="space-between" align="center">
                    <Text fw={500}>Correct answer</Text>
                    <Badge color="green" size="lg" variant="light">
                      {actualCorrelation.toFixed(1)}
                    </Badge>
                  </Group>

                  <Divider />

                  {/* Optional small hint */}
                  <Text size="sm" c="dimmed">
                    Tighter clustering around a clear upward line → higher r; more diffuse cloud → lower r.
                  </Text>
                </Stack>
              </Card>

              <Button
                size="md"
                onClick={nextTrial}
                color="green"
                radius="md"
                fullWidth
                maw={320}
                variant="filled"
              >
                {currentTrial < shuffledCorrelations.length - 1 ? 'Next Question' : 'Complete'}
              </Button>
            </Stack>
          )}
        </Card>
      </Stack>
    </Container>
  );
};

export default Control;
