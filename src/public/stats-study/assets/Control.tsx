import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  Alert
} from '@mantine/core';
import { IconTarget, IconTrendingUp, IconAlertCircle } from '@tabler/icons-react';

// -------------------- Types (UNCHANGED) --------------------
interface DataPoint { x: number; y: number; }

interface TrialResponse {
  trial: number;
  actualCorrelation: number;
  userGuess: number;
  accuracy: number;      // absolute error: |actual - guess|
  trialScore: number;    // 0–100
  timestamp: number;
}

interface StudyData {
  totalTrials: number;
  totalScore: number;        // sum of trialScore
  averageAccuracy: number;   // mean of trialScore
  responses: TrialResponse[];
  timeSpent: number;         // ms
  correlations: number[];
}

interface StudyConfig {
  timeLimit?: number;        // IGNORED (no timer now)
  correlations?: number[];   // optional override sequence (default 0.1..0.9)
}

interface ControlProps {
  onComplete?: (data: StudyData) => void;
  studyConfig?: StudyConfig;
  participantData?: Record<string, any>;
  trialIndex?: number;
}

interface ScatterPlotProps {
  data: DataPoint[];
  correlation: number;
  width?: number;
  height?: number;
}

// -------------------- Helpers --------------------
const generateCorrelationData = (correlation: number, n: number = 100): DataPoint[] => {
  const data: DataPoint[] = [];
  for (let i = 0; i < n; i++) {
    const x = Math.random() * 10;
    const noise = Math.random() * Math.sqrt(1 - correlation * correlation);
    const y = correlation * x + noise * 5 + Math.random() * 2;
    data.push({ x, y });
  }
  return data;
};

const ScatterPlot: React.FC<ScatterPlotProps> = ({
  data,
  correlation,
  width = 320,
  height = 320
}) => {
  const margin = 40;
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
      <div style={{ padding: '0.5rem', background: 'white', borderRadius: '8px', boxShadow: '0 1px 4px rgba(0,0,0,0.1)' }}>
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

// -------------------- Main Component --------------------
const Control: React.FC<ControlProps> = ({
  onComplete,
  studyConfig = {},
  participantData = {},
  trialIndex = 0
}) => {
  const defaultCorrs = useMemo(
    () => studyConfig.correlations ?? [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9],
    [studyConfig.correlations]
  );

  // shuffle once
  const [shuffledCorrelations] = useState<number[]>(
    () => [...defaultCorrs].sort(() => Math.random() - 0.5)
  );

  const [plotData] = useState<DataPoint[][]>(
    () => shuffledCorrelations.map(corr => generateCorrelationData(corr))
  );

  const [studyStarted, setStudyStarted] = useState<boolean>(false);
  const [currentTrial, setCurrentTrial] = useState<number>(0);
  const [userGuess, setUserGuess] = useState<number | string>('');
  const [showFeedback, setShowFeedback] = useState<boolean>(false);
  const [score, setScore] = useState<number>(0);
  const [responses, setResponses] = useState<TrialResponse[]>([]);
  const [isComplete, setIsComplete] = useState<boolean>(false);
  const [showAlert, setShowAlert] = useState<boolean>(false);

  // time tracking (no limit, just duration)
  const startRef = useRef<number | null>(null);

  // Remove keyboard shortcuts - no useEffect for keyboard handling

  const startStudy = (): void => {
    setStudyStarted(true);
    startRef.current = performance.now();
  };

  const actualCorrelation = shuffledCorrelations[currentTrial];
  const currentData = plotData[currentTrial];
  const guessNumber = typeof userGuess === 'string' ? parseFloat(userGuess) : userGuess;

  const handleSubmit = (): void => {
    const guess = typeof userGuess === 'string' ? parseFloat(userGuess) : userGuess;
    
    // Validate input range - check for empty, non-numeric, or out of range
    if (userGuess === '' || isNaN(guess) || guess < 0 || guess > 1) {
      setShowAlert(true);
      return;
    }

    setShowAlert(false); // Hide alert if valid

    const accuracy = Math.abs(actualCorrelation - guess);
    const trialScore = Math.max(0, 100 - accuracy * 100);

    const responseData: TrialResponse = {
      trial: currentTrial + 1,
      actualCorrelation,
      userGuess: guess,
      accuracy,
      trialScore,
      timestamp: Date.now()
    };

    setResponses(prev => [...prev, responseData]);
    setScore(prev => prev + trialScore);
    setShowFeedback(true);
  };

  const nextTrial = (): void => {
    if (currentTrial < shuffledCorrelations.length - 1) {
      setCurrentTrial(t => t + 1);
      setUserGuess('');
      setShowFeedback(false);
      setShowAlert(false);
    } else {
      completeStudy();
    }
  };

  const completeStudy = (): void => {
    setIsComplete(true);
    const end = performance.now();
    const timeSpent = startRef.current ? end - startRef.current : 0;

    const totalTrials = responses.length + (showFeedback ? 1 : 0);
    const correlations = shuffledCorrelations.slice(0, totalTrials);
    const totalScore = responses.reduce((s, r) => s + r.trialScore, 0);
    const averageAccuracy = responses.length > 0 ? totalScore / responses.length : 0;

    const studyData: StudyData = {
      totalTrials,
      totalScore,
      averageAccuracy,
      responses,
      timeSpent,
      correlations
    };

    onComplete?.(studyData);
  };

  const progress = ((currentTrial + (showFeedback ? 1 : 0)) / shuffledCorrelations.length) * 100;

  // --------------- RENDER ----------------
  if (!studyStarted) {
    return (
      <Container size="lg" py="xl">
        <Paper shadow="md" p="xl" radius="md">
          <Stack gap="lg" align="center">
            <Title order={2} ta="center">Correlation Estimation Task - Control</Title>

            <Stack gap="md" maw={600}>
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

  if (isComplete) {
    const averageScore = responses.length > 0 ? (score / responses.length).toFixed(1) : '0.0';
    return (
      <Container size="md" py="xl">
        <Paper shadow="md" p="xl" radius="md">
          <Stack gap="lg" align="center">
            <Title order={2}>Task Complete!</Title>

            <Group gap="xl">
              <Stack gap="xs" align="center">
                <Badge size="lg" variant="light" color="blue">
                  {responses.length} Trials
                </Badge>
                <Text size="sm" c="dimmed">Completed</Text>
              </Stack>

              <Stack gap="xs" align="center">
                <Badge size="lg" variant="light" color="green">
                  {score.toFixed(1)}
                </Badge>
                <Text size="sm" c="dimmed">Total Score</Text>
              </Stack>

              <Stack gap="xs" align="center">
                <Badge size="lg" variant="light" color="violet">
                  {averageScore}%
                </Badge>
                <Text size="sm" c="dimmed">Avg Accuracy</Text>
              </Stack>
            </Group>

            <Text ta="center" c="dimmed">
              Thank you for completing this part of the study!
            </Text>
          </Stack>
        </Paper>
      </Container>
    );
  }

  return (
    <Container size="sm" py="md">
      <Stack gap="lg">
        {/* Simple progress indicator */}
        <Card withBorder radius="md" p="md" bg="gray.0">
          <Group justify="space-between" align="center">
            <Text fw={600}>Trial {currentTrial + 1} of {shuffledCorrelations.length}</Text>
            <Progress value={progress} w={120} size="sm" />
          </Group>
        </Card>

        {/* Main content */}
        <Card withBorder radius="md" p="lg" shadow="sm">
          {!showFeedback ? (
            <Stack gap="lg" align="center">
              <Title order={3} ta="center" c="dark.8">
                Estimate the Correlation
              </Title>

              <ScatterPlot data={currentData} correlation={actualCorrelation} width={320} height={320} />

              <Stack gap="md" align="center" w="100%" maw={300}>
                <Stack gap="xs" w="100%">
                  <Text fw={500} ta="center">Your estimate (0.0 to 1.0):</Text>
                  <TextInput
                    placeholder="e.g., 0.7"
                    value={userGuess}
                    onChange={(event) => {
                      setUserGuess(event.currentTarget.value);
                      if (showAlert) setShowAlert(false);
                    }}
                    size="lg"
                    radius="md"
                    error={showAlert ? "Please enter a number between 0.0 and 1.0 (e.g., 0.3, 0.7)" : null}
                    styles={{ 
                      input: { 
                        textAlign: 'center',
                        fontSize: '1.2rem',
                        fontWeight: 500
                      } 
                    }}
                  />
                  <Text size="xs" ta="center" c="dimmed">
                    0.0 = no relationship, 1.0 = perfect positive relationship
                  </Text>
                </Stack>

                <Button
                  size="lg"
                  onClick={handleSubmit}
                  radius="md"
                  variant="filled"
                  fullWidth
                >
                  Submit Answer
                </Button>
              </Stack>
            </Stack>
          ) : (
            <Stack gap="lg" align="center">
              <Title order={3} c="green.7" ta="center">Feedback</Title>

              <ScatterPlot data={currentData} correlation={actualCorrelation} width={280} height={280} />

              <Card withBorder p="md" radius="md" w="100%" maw={300} bg="gray.0">
                <Stack gap="md">
                  <Group justify="space-between" align="center">
                    <Text fw={500}>Your Answer</Text>
                    <Badge color="blue" size="lg" variant="light">
                      {(typeof userGuess === 'number' ? userGuess : guessNumber).toFixed(1)}
                    </Badge>
                  </Group>

                  <Group justify="space-between" align="center">
                    <Text fw={500}>Correct Answer</Text>
                    <Badge color="green" size="lg" variant="light">
                      {actualCorrelation.toFixed(1)}
                    </Badge>
                  </Group>
                </Stack>
              </Card>

              <Button 
                size="lg" 
                onClick={nextTrial} 
                color="green"
                radius="md"
                fullWidth
                maw={250}
                variant="filled"
              >
                {currentTrial < shuffledCorrelations.length - 1 ? 'Next Trial' : 'Complete Study'}
              </Button>
            </Stack>
          )}
        </Card>
      </Stack>
    </Container>
  );
};

export default Control;