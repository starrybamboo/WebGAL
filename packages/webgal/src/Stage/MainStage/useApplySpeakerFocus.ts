import { useEffect } from 'react';
import { IStageState } from '@/Core/Modules/stage/stageInterface';
import { applySpeakerFocusToPixi } from '@/Core/controller/stage/pixi/applySpeakerFocus';

const SPEAKING_BRIGHTNESS_MULTIPLIER = 1.12;

export function useApplySpeakerFocus(stageState: IStageState, enabled: boolean) {
  useEffect(() => {
    const handle = window.setTimeout(() => {
      applySpeakerFocusToPixi(stageState, enabled, {
        speakingBrightnessMultiplier: SPEAKING_BRIGHTNESS_MULTIPLIER,
      });
    }, 10);

    return () => {
      window.clearTimeout(handle);
    };
  }, [
    enabled,
    stageState.effects,
    stageState.figName,
    stageState.figNameLeft,
    stageState.figNameRight,
    stageState.freeFigure,
    stageState.PerformList,
    stageState.speakingFigureKey,
  ]);
}
