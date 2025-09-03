import React, { useState, useEffect } from 'react';
import img01 from './pre-test-images/pre-test-image-1.png';
import img02 from './pre-test-images/pre-test-image-2.png';
import img03 from './pre-test-images/pre-test-image-3.png';
import img04 from './pre-test-images/pre-test-image-4.png';
import img05 from './pre-test-images/pre-test-image-5.png';
import img06 from './pre-test-images/pre-test-image-6.png';

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
}) => {
  return (
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
};

const PreTest = () => {
  const [plots, setPlots] = useState<Array<{
    id: string;
    imageSrc: string;
    actualCorrelation: number;
  }>>([]);
  
  const [currentPlotIndex, setCurrentPlotIndex] = useState(0);
  const [currentGuess, setCurrentGuess] = useState<string>('');
  const [guesses, setGuesses] = useState<Array<{
    plotId: string;
    guess: number;
    actualCorrelation: number;
  }>>([]);
  
  const [gameComplete, setGameComplete] = useState(false);

  // Initialize plots with different correlation strengths
  useEffect(() => {
    const correlationData = [
  { correlation: 0.9, imageSrc: img01 },
  { correlation: 0.4, imageSrc: img02 },
  { correlation: 0.2, imageSrc: img03 },
  { correlation: 0.4, imageSrc: img04 },
  { correlation: 0.2, imageSrc: img05 },
  { correlation: 0.6, imageSrc: img06 },
];
    
    // Shuffle the order randomly
    const shuffledData = [...correlationData].sort(() => Math.random() - 0.5);
    
    const newPlots = shuffledData.map((item, index) => ({
      id: `plot-${index}`,
      imageSrc: item.imageSrc,
      actualCorrelation: item.correlation,
    }));
    
    setPlots(newPlots);
    setCurrentPlotIndex(0);
    setCurrentGuess('');
    setGuesses([]);
    setGameComplete(false);
  }, []);

  const currentPlot = plots[currentPlotIndex];
  const isLastPlot = currentPlotIndex === plots.length - 1;

  const handleSubmitGuess = () => {
    const numGuess = parseFloat(currentGuess);
    if (isNaN(numGuess) || numGuess < 0 || numGuess > 1) return;
    
    const newGuess = {
      plotId: currentPlot.id,
      guess: numGuess,
      actualCorrelation: currentPlot.actualCorrelation
    };
    
    setGuesses(prev => [...prev, newGuess]);
    setCurrentGuess('');
    
    if (isLastPlot) {
      setGameComplete(true);
    } else {
      setCurrentPlotIndex(prev => prev + 1);
    }
  };

  const canSubmit = currentGuess !== '' && !isNaN(parseFloat(currentGuess)) && 
                   parseFloat(currentGuess) >= 0 && parseFloat(currentGuess) <= 1;

  if (plots.length === 0) {
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

      {!gameComplete ? (
        <div className="bg-white p-8 rounded-lg shadow-md text-center">
          <div className="mb-6">
            <h3 className="text-lg font-semibold mb-2">
              Plot {currentPlotIndex + 1} of {plots.length}
            </h3>
            <div className="w-full bg-gray-200 rounded-full h-2 mb-4">
              <div 
                className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
                style={{ width: `${((currentPlotIndex + 1) / plots.length) * 100}%` }}
              ></div>
            </div>
          </div>

          <div className="flex justify-center mb-6">
            <ScatterPlotImage 
              imageSrc={currentPlot.imageSrc}
              alt = ""
            />
          </div>
          
          <div className="space-y-4 max-w-md mx-auto">
            <div>
              <label htmlFor="correlation-guess" className="block text-sm font-medium text-gray-700 mb-2">
                What is your guess for the correlation? (0.0 - 1.0)
              </label>
              <input
                id="correlation-guess"
                type="number"
                min="0"
                max="1"
                step="0.01"
                value={currentGuess}
                onChange={(e) => setCurrentGuess(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-center text-lg"
                placeholder="0.00"
                autoFocus
              />
            </div>
            
            <button
              onClick={handleSubmitGuess}
              disabled={!canSubmit}
              className={`w-full py-3 px-6 rounded-md font-medium text-lg ${
                canSubmit
                  ? 'bg-blue-500 text-white hover:bg-blue-600'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
            >
              {isLastPlot ? 'Finish!' : 'Next Plot'}
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-white p-8 rounded-lg shadow-md text-center">
          <h3 className="text-2xl font-semibold mb-6 text-green-600">Complete!</h3>
          
        </div>
      )}
    </div>
  );
};

export default PreTest;