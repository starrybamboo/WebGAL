import { useSelector } from 'react-redux';
import { RootState } from '@/store/store';
import { useStageState } from '@/hooks/useStageState';
import { useSetBg } from '@/Stage/MainStage/useSetBg';
import { useSetFigure } from '@/Stage/MainStage/useSetFigure';
import { setStageObjectEffects } from '@/Stage/MainStage/useSetEffects';
import { useApplySpeakerFocus } from '@/Stage/MainStage/useApplySpeakerFocus';
import { isSpeakerFocusEnabled } from '@/Core/util/speakerFocusConfig';

export function MainStage() {
  const stageState = useStageState();
  const speakerFocusEnabled = useSelector((state: RootState) => isSpeakerFocusEnabled(state.userData.globalGameVar));
  useSetBg(stageState);
  useSetFigure(stageState);
  setStageObjectEffects(stageState);
  useApplySpeakerFocus(stageState, speakerFocusEnabled);
  return <div style={{ display: 'none' }} />;
}
