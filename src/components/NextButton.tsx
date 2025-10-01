import { Alert, Button, Group } from '@mantine/core';
import {
  JSX, useEffect, useMemo, useState,
} from 'react';
import { IconInfoCircle, IconAlertTriangle } from '@tabler/icons-react';
import { useNavigate } from 'react-router';
import { useNextStep } from '../store/hooks/useNextStep';
import { IndividualComponent, ResponseBlockLocation } from '../parser/types';
import { useStudyConfig } from '../store/hooks/useStudyConfig';
import { PreviousButton } from './PreviousButton';

import { useStoreSelector } from '../store/store';
import { useCurrentIdentifier } from '../routes/utils';
import type { StoredAnswer, ValidationStatus } from '../store/types';

type Props = {
  label?: string;
  disabled?: boolean;
  configInUse?: IndividualComponent;
  location?: ResponseBlockLocation;
  checkAnswer: JSX.Element | null;
};

export function NextButton({
  label = 'Next',
  disabled = false,
  configInUse,
  location,
  checkAnswer,
}: Props) {
  const { isNextDisabled, goToNextStep } = useNextStep();
  const studyConfig = useStudyConfig();
  const navigate = useNavigate();

  const nextButtonDisableTime = useMemo(
    () => configInUse?.nextButtonDisableTime ?? studyConfig.uiConfig.nextButtonDisableTime,
    [configInUse, studyConfig]
  );
  const nextButtonEnableTime = useMemo(
    () => configInUse?.nextButtonEnableTime ?? studyConfig.uiConfig.nextButtonEnableTime ?? 0,
    [configInUse, studyConfig]
  );

  const [timer, setTimer] = useState<number | undefined>(undefined);
  useEffect(() => {
    let time = 0;
    const interval = setInterval(() => {
      time += 100;
      setTimer(time);
    }, 100);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (timer && nextButtonDisableTime && timer >= nextButtonDisableTime && studyConfig.uiConfig.timeoutReject) {
      navigate('./../__timedOut');
    }
  }, [nextButtonDisableTime, timer, navigate, studyConfig.uiConfig.timeoutReject]);

  const buttonTimerSatisfied = useMemo(() => {
    const nextButtonDisableSatisfied = nextButtonDisableTime && timer ? timer <= nextButtonDisableTime : true;
    const nextButtonEnableSatisfied = timer ? timer >= nextButtonEnableTime : true;
    return nextButtonDisableSatisfied && nextButtonEnableSatisfied;
  }, [nextButtonDisableTime, nextButtonEnableTime, timer]);

  const nextOnEnter = useMemo(
    () => configInUse?.nextOnEnter ?? studyConfig.uiConfig.nextOnEnter,
    [configInUse, studyConfig]
  );

  // ======== NEW: numeric out-of-range guard (computed here) ========
  const identifier = useCurrentIdentifier();
  const trialValidation = useStoreSelector((state) => state.trialValidation);
  const currentValidation = trialValidation?.[identifier];

  // Merge values across response blocks for this step (same pattern used in useNextStep)
  const currentAnswers = useMemo(() => {
    if (!currentValidation) return {};
    const merged = Object.values(currentValidation).reduce((acc: Record<string, unknown>, curr) => {
      if (curr && Object.hasOwn(curr, 'values')) {
        return { ...acc, ...((curr as ValidationStatus).values as Record<string, unknown>) };
      }
      return acc;
    }, {});
    return merged;
  }, [currentValidation]);

  // Find this component's definition to get its responses (min/max live there)
  const componentName = useMemo(() => identifier.slice(0, identifier.lastIndexOf('_')), [identifier]);
  const componentConfig = useMemo(() => studyConfig?.components?.[componentName], [studyConfig, componentName]);

  const hasNumericOutOfRange = useMemo(() => {
    if (!componentConfig || !Array.isArray((componentConfig as any).response)) return false;
    return (componentConfig as any).response.some((r: any) => {
      if (r?.type !== 'numerical') return false;

      const min = r.min ?? Number.NEGATIVE_INFINITY;
      const max = r.max ?? Number.POSITIVE_INFINITY;

      const raw = (currentAnswers as Record<string, unknown>)[r.id];
      if (raw === '' || raw === null || raw === undefined) return false;

      const num = Number(raw);
      if (Number.isNaN(num)) return true;
      if (num < min) return true;
      if (num > max) return true;
      return false;
    });
  }, [componentConfig, currentAnswers]);

  // ================================================================

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Enter' && !disabled && !isNextDisabled && buttonTimerSatisfied && !hasNumericOutOfRange) {
        goToNextStep();
      }
    };
    if (nextOnEnter) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
    return () => { };
  }, [disabled, isNextDisabled, buttonTimerSatisfied, hasNumericOutOfRange, goToNextStep, nextOnEnter]);

  const nextButtonDisabled = useMemo(
    () => disabled || isNextDisabled || !buttonTimerSatisfied || hasNumericOutOfRange,
    [disabled, isNextDisabled, buttonTimerSatisfied, hasNumericOutOfRange]
  );

  const previousButtonText = useMemo(
    () => configInUse?.previousButtonText ?? studyConfig.uiConfig.previousButtonText ?? 'Previous',
    [configInUse, studyConfig]
  );

  return (
    <>
      <Group justify="right" gap="xs" mt="sm">
        {configInUse?.previousButton && (
          <PreviousButton
            label={previousButtonText}
            px={location === 'sidebar' && checkAnswer ? 8 : undefined}
          />
        )}
        {checkAnswer}
        <Button
          type="submit"
          disabled={nextButtonDisabled}
          onClick={() => goToNextStep()}
          px={location === 'sidebar' && checkAnswer ? 8 : undefined}
        >
          {label}
        </Button>
      </Group>

      {/* existing timer alerts */}
      {timer && (
        <>
          {nextButtonEnableTime > 0 && timer < nextButtonEnableTime && (
            <Alert mt="md" title="Please wait" color="blue" icon={<IconInfoCircle />}>
              The next button will be enabled in {Math.ceil((nextButtonEnableTime - timer) / 1000)} seconds.
            </Alert>
          )}
          {nextButtonDisableTime && timer && nextButtonDisableTime - timer < 10000 && (
            nextButtonDisableTime - timer > 0 ? (
              <Alert mt="md" title="Next button disables soon" color="yellow" icon={<IconAlertTriangle />}>
                The next button disables in {Math.ceil((nextButtonDisableTime - timer) / 1000)} seconds.
              </Alert>
            ) : !studyConfig.uiConfig.timeoutReject && (
              <Alert mt="md" title="Next button disabled" color="red" icon={<IconAlertTriangle />}>
                The next button has timed out and is now disabled.
                <Group justify="right" mt="sm">
                  <Button onClick={() => goToNextStep(false)} variant="link" color="red">Proceed</Button>
                </Group>
              </Alert>
            )
          )}
        </>
      )}
    </>
  );
}
