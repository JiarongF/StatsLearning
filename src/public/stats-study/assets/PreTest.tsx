import React, { useState, useEffect, useRef } from 'react';
import img01 from './pre-test-images/pre-test-image-1.png';
import img02 from './pre-test-images/pre-test-image-2.png';
import img03 from './pre-test-images/pre-test-image-3.png';
import img04 from './pre-test-images/pre-test-image-4.png';
import img05 from './pre-test-images/pre-test-image-5.png';
import img06 from './pre-test-images/pre-test-image-6.png';

type SetAnswerFn = (value: any) => void;

const ScatterPlotImage = ({
  imageSrc,
  alt,
  width = 350,
  height = 280
}: {
  imageSrc: string;
  alt: string;
  width?: number;
  height?: number;
}) => (
  <div className="flex justify-center">
    <img
      src={imageSrc}
      alt={alt}
      width={width}
      height={height}
      className="border border-gray-300 rounded"
      style={{ maxWidth: '100%', height: 'auto' }}
    />
  </div>
);

// NOTE: default param {} prevents "Cannot destructure property 'setAnswer' of undefined"
export default function PreTest(
  { setAnswer }: { setAnswer?: SetAnswerFn } = {}
) {
  const [plots, setPlots] = useState<
    Array<{ id: string; imageSrc: string; actualCorrelation: number }>
  >([]);
  const [currentPlotIndex, setCurrentPlotIndex] = useState(0);
  const [currentGuess, setCurrentGuess] = useState<string>('');
  const [guesses, setGuesses] = useState<
    Array<{ plotId: string; guess: number; actualCorrelation: number }>
  >([]);
  const [gameComplete, setGameComplete] = useState(false);
  const reportedCompleteRef = useRef(false);

  useEffect(() => {
    const correlationData = [
      { correlation: 0.9, imageSrc: img01 },
      { correlation: 0.4, imageSrc: img02 },
      { correlation: 0.2, imageSrc: img03 },
      { correlation: 0.4, imageSrc: img04 },
      { correlation: 0.2, imageSrc: img05 },
      { correlation: 0.6, imageSrc: img06 },
    ];
    const shuffled = [...correlationData].sort(() => Math.random() - 0.5);
    const newPlots = shuffled.map((item, idx) => ({
      id: `plot-${idx}`,
      imageSrc: item.imageSrc,
      actualCorrelation: item.correlation,
    }));
    setPlots(newPlots);
    setCurrentPlotIndex(0);
    setCurrentGuess('');
    setGuesses([]);
    setGameComplete(false);
    reportedCompleteRef.current = false;
  }, []);

  const currentPlot =
    plots.length > 0 && currentPlotIndex >= 0 && currentPlotIndex < plots.length
      ? plots[currentPlotIndex]
      : undefined;

  const isLastPlot = plots.length > 0 && currentPlotIndex === plots.length - 1;

  const handleSubmitGuess = () => {
    if (!currentPlot) return;
    const numGuess = parseFloat(currentGuess);
    if (isNaN(numGuess) || numGuess < 0 || numGuess > 1) return;

    const newGuess = {
      plotId: currentPlot.id,
      guess: numGuess,
      actualCorrelation: currentPlot.actualCorrelation,
    };

    setGuesses((prev) => [...prev, newGuess]);
    setCurrentGuess('');

    if (isLastPlot) {
      setGameComplete(true);
    } else {
      setCurrentPlotIndex((prev) => prev + 1);
    }
  };

  // Report "complete" exactly once so ReVISit can enable Next
  useEffect(() => {
    if (!gameComplete) return;
    if (reportedCompleteRef.current) return;
    reportedCompleteRef.current = true;

    // ReVISit gate: requiredValue === 'complete'
    try {
      setAnswer?.('complete'); // simple string value (safest)
    } catch {
      // Swallow in case we're running outside ReVISit; UI still shows "Complete!"
    }
  }, [gameComplete, setAnswer]);

  const canSubmit =
    currentGuess !== '' &&
    !isNaN(parseFloat(currentGuess)) &&
    parseFloat(currentGuess) >= 0 &&
    parseFloat(currentGuess) <= 1;

  if (plots.length === 0 || !currentPlot) {
    return <div className="flex justify-center items-center h-64">Loading...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto p-6 bg-gray-50 min-h-screen">
      <div className="mb-8 text-center">
        <div className="bg-white p-6 rounded-lg shadow-md mb-6 text-left max-w-4xl mx-auto">
          <h2 className="text-xl font-semibold mb-3">Definition of Correlation:</h2>
          <p className="text-gray-700 mb-4">
            Correlations describe the strength of the relationship between two numerical variables, such as height and weight.
          </p>
          <p className="text-gray-700 mb-4">
            Below are scatter plots showing correlations that range between 0 (no relationship) and 1 (a very strong positive relationship).
          </p>
          <p className="text-gray-700 font-medium">
            Please make your best guess as to what the correlation is for these graphs.
          </p>
        </div>
      </div>
    </div>
  );
}
