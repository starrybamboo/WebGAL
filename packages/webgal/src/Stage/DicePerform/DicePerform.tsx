import { useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { css } from '@emotion/css';
import useEscape from '@/hooks/useEscape';
import { RootState } from '@/store/store';
import styles from './dicePerform.module.scss';

interface DiceTextSegment {
  text: string;
  ruby?: string;
  style?: string;
  styleAllText?: string;
}

const OPTION_PATTERN = /^\s*([0-9０-９]+)\s*(?:[.)）．。、,:：，]\s*|\s+)(\S.*)$/;
const ENHANCED_PATTERN = /(\[(.*?)\]\((.*?)\))|([^\[\]]+)/g;
const TRPG_D100_RESULT_PATTERN = /\b(?:D100\s*=\s*)?(100|[1-9]?\d)\s*\/\s*(100|[1-9]?\d)\b/i;
const TRPG_D100_STRIP_PATTERN = /D100\s*=\s*(?:100|[1-9]?\d|\?)\s*\/\s*(?:100|[1-9]?\d)\s*/i;
const TRPG_ROLE_PREFIX_PATTERN = /^(玩家掷骰|骰子结果)\s*/;
const TRPG_ENHANCED_WRAP_PATTERN = /\[([^\]\n\r]+)\]\(([^)]*)\)/g;

interface TrpgRollInfo {
  roll: number;
  check: number;
}

type TrpgPhase = 'idle' | 'rolling' | 'impact' | 'settled';
type TrpgResultLevel = 'pending' | 'success' | 'hardSuccess' | 'extremeSuccess' | 'greatSuccess' | 'failure' | 'fumble';

interface TrpgJudgeResult {
  label: string;
  level: TrpgResultLevel;
}

const formatTrpgNumber = (value: number | null): string => {
  if (value === null || !Number.isFinite(value)) {
    return '--';
  }
  return String(value).padStart(2, '0');
};

const TRPG_PENDING_JUDGE_RESULT: TrpgJudgeResult = { label: '检定中', level: 'pending' };

const resolveTrpgJudgeResult = (roll: number, check: number): TrpgJudgeResult => {
  const normalizedCheck = Math.max(1, Math.floor(check));
  const isFailure = roll > normalizedCheck;
  if (isFailure) {
    const isFumble = normalizedCheck < 50 ? roll === 100 : roll >= 96 && roll <= 100;
    return isFumble ? { label: '大失败', level: 'fumble' } : { label: '失败', level: 'failure' };
  }

  if (roll === 1) {
    return { label: '大成功', level: 'greatSuccess' };
  }

  const hardThreshold = Math.max(1, Math.floor(normalizedCheck / 2));
  const extremeThreshold = Math.max(1, Math.floor(normalizedCheck / 5));
  if (roll <= extremeThreshold) {
    return { label: '极限成功', level: 'extremeSuccess' };
  }
  if (roll <= hardThreshold) {
    return { label: '困难成功', level: 'hardSuccess' };
  }
  return { label: '成功', level: 'success' };
};

const parseEnhancedString = (enhanced: string): Omit<DiceTextSegment, 'text'> => {
  const segment: Omit<DiceTextSegment, 'text'> = {};
  if (!enhanced) return segment;
  const pairs: Array<{ key: string; value: string }> = [];
  const regex = /(\S+)=(.*?)(?=\s+\S+=|\s*$)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(enhanced)) !== null) {
    pairs.push({ key: match[1], value: match[2].replace(/~/g, ':').trim() });
  }
  for (const pair of pairs) {
    if (pair.key === 'style') segment.style = pair.value;
    if (pair.key === 'style-alltext') segment.styleAllText = pair.value;
    if (pair.key === 'ruby') segment.ruby = pair.value;
  }
  return segment;
};

const parseLine = (line: string): DiceTextSegment[] => {
  const result: DiceTextSegment[] = [];
  ENHANCED_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ENHANCED_PATTERN.exec(line)) !== null) {
    if (match[1]) {
      const text = match[2] ?? '';
      const enhance = match[3] ?? '';
      if (enhance.match(/style=|ruby=|style-alltext=/)) {
        result.push({ text, ...parseEnhancedString(enhance) });
      } else {
        result.push({ text, ruby: enhance });
      }
    } else if (match[4]) {
      result.push({ text: match[4] });
    }
  }
  return result;
};

const getOptionPlainText = (line: string): string => {
  const segments = parseLine(line);
  if (segments.length === 0) {
    return line;
  }
  return segments.map((segment) => segment.text).join('');
};

const extractTrpgRollInfo = (content: string): TrpgRollInfo | null => {
  const normalized = String(content ?? '')
    .replace(TRPG_ENHANCED_WRAP_PATTERN, '$1')
    .replace(/／/g, '/');
  const match = TRPG_D100_RESULT_PATTERN.exec(normalized);
  if (!match) {
    return null;
  }
  const roll = Number.parseInt(match[1], 10);
  const check = Number.parseInt(match[2], 10);
  if (!Number.isFinite(roll) || roll < 1 || roll > 100) {
    return null;
  }
  if (!Number.isFinite(check) || check < 1 || check > 100) {
    return null;
  }
  return { roll, check };
};

const resolveTrpgTitle = (rawLines: string[]): string => {
  for (const line of rawLines) {
    const plain = getOptionPlainText(line)
      .replace(TRPG_D100_STRIP_PATTERN, '')
      .replace(TRPG_ROLE_PREFIX_PATTERN, '')
      .replace(/^\.+/, '')
      .trim();
    if (!plain) {
      continue;
    }
    if (/^d\d+/i.test(plain)) {
      continue;
    }
    return plain;
  }
  return '正在进行检定';
};

export const DicePerform = () => {
  const dicePerform = useSelector((state: RootState) => state.stage.dicePerform);
  const [renderKey, setRenderKey] = useState(0);
  const [trpgAnimatedRoll, setTrpgAnimatedRoll] = useState<number | null>(null);
  const [trpgPhase, setTrpgPhase] = useState<TrpgPhase>('idle');
  const diceMode = String(dicePerform.mode ?? '')
    .trim()
    .toLowerCase();
  const isTrpgMode = diceMode === 'trpg';

  useEffect(() => {
    if (dicePerform.visible) {
      setRenderKey((prev) => prev + 1);
    }
  }, [dicePerform.content, dicePerform.visible, dicePerform.revision]);

  const lines = useMemo(() => {
    if (!dicePerform.visible) return [];
    const raw = String(dicePerform.content ?? '');
    const pieces = raw.split(/(?<!\\)\|/).map((item) => useEscape(item));
    return pieces.filter((line) => line.trim() !== '');
  }, [dicePerform.content, dicePerform.visible]);

  const trpgRollInfo = useMemo(() => {
    if (!dicePerform.visible || !isTrpgMode) {
      return null;
    }
    return extractTrpgRollInfo(String(dicePerform.content ?? ''));
  }, [dicePerform.content, dicePerform.visible, isTrpgMode]);

  useEffect(() => {
    if (!dicePerform.visible || !isTrpgMode || trpgRollInfo === null) {
      setTrpgPhase('idle');
      setTrpgAnimatedRoll(trpgRollInfo?.roll ?? null);
      return;
    }

    let rollTimer = 0;
    let impactTimer = 0;
    setTrpgPhase('rolling');
    setTrpgAnimatedRoll(Math.floor(Math.random() * 100) + 1);
    const rollingTicker = window.setInterval(() => {
      setTrpgAnimatedRoll(Math.floor(Math.random() * 100) + 1);
    }, 45);

    rollTimer = window.setTimeout(() => {
      window.clearInterval(rollingTicker);
      setTrpgAnimatedRoll(trpgRollInfo.roll);
      setTrpgPhase('impact');
      impactTimer = window.setTimeout(() => {
        setTrpgPhase('settled');
      }, 220);
    }, 920);

    return () => {
      window.clearInterval(rollingTicker);
      if (rollTimer) {
        window.clearTimeout(rollTimer);
      }
      if (impactTimer) {
        window.clearTimeout(impactTimer);
      }
    };
  }, [trpgRollInfo, dicePerform.revision, dicePerform.visible, isTrpgMode]);

  const splitBlocks = useMemo(() => {
    const firstOptionIndex = lines.findIndex((line) => OPTION_PATTERN.test(getOptionPlainText(line)));
    if (firstOptionIndex < 0) {
      return { headerLines: lines, optionLines: [] as string[] };
    }
    return {
      headerLines: lines.slice(0, firstOptionIndex),
      optionLines: lines.slice(firstOptionIndex),
    };
  }, [lines]);

  const renderLines = (blockLines: string[], blockClassName: string) => (
    <div className={blockClassName}>
      {blockLines.map((line, index) => {
        const isOption = OPTION_PATTERN.test(getOptionPlainText(line));
        const segments = parseLine(line);
        return (
          <div
            key={`${renderKey}-${blockClassName}-${index}`}
            className={`${styles.DicePerform_line} ${isOption ? styles.DicePerform_option : ''}`}
          >
            {segments.map((segment, segIndex) => {
              const styleClass = segment.style ? ` ${css(segment.style)}` : '';
              const styleAllClass = segment.styleAllText ? ` ${css(segment.styleAllText)}` : '';
              const content = segment.ruby ? (
                <ruby>
                  {segment.text}
                  <rt>{segment.ruby}</rt>
                </ruby>
              ) : (
                segment.text
              );
              return (
                <span
                  // eslint-disable-next-line react/no-array-index-key
                  key={`${renderKey}-${blockClassName}-${index}-${segIndex}`}
                  className={`${styles.DicePerform_piece}${styleClass}${styleAllClass}`}
                >
                  {content}
                </span>
              );
            })}
          </div>
        );
      })}
    </div>
  );

  if (!dicePerform.visible || lines.length === 0) {
    return null;
  }

  const trpgTitle = isTrpgMode ? resolveTrpgTitle(lines) : '';
  const hasHeader = splitBlocks.headerLines.length > 0;
  const hasOptions = splitBlocks.optionLines.length > 0;
  const trpgRollDisplay = trpgAnimatedRoll ?? trpgRollInfo?.roll ?? null;
  const trpgRollText = formatTrpgNumber(trpgRollDisplay);
  const trpgCheckText = formatTrpgNumber(trpgRollInfo?.check ?? null);
  const trpgRolling = trpgPhase === 'rolling';
  const trpgImpact = trpgPhase === 'impact';
  const trpgResultReady = trpgImpact || trpgPhase === 'settled';

  if (isTrpgMode) {
    const leftDieText = trpgRollText;
    const resultLeft = trpgResultReady ? trpgRollText : '--';
    const resultClassName = trpgResultReady ? styles.DicePerform_trpgResultReady : styles.DicePerform_trpgResultPending;
    const judgeResult =
      trpgResultReady && trpgRollInfo
        ? resolveTrpgJudgeResult(trpgRollInfo.roll, trpgRollInfo.check)
        : TRPG_PENDING_JUDGE_RESULT;
    const resultStatusClassNameMap: Record<TrpgResultLevel, string> = {
      pending: styles.DicePerform_trpgResultStatusPending,
      success: styles.DicePerform_trpgResultStatusSuccess,
      hardSuccess: styles.DicePerform_trpgResultStatusHardSuccess,
      extremeSuccess: styles.DicePerform_trpgResultStatusExtremeSuccess,
      greatSuccess: styles.DicePerform_trpgResultStatusGreatSuccess,
      failure: styles.DicePerform_trpgResultStatusFailure,
      fumble: styles.DicePerform_trpgResultStatusFumble,
    };
    const resultStatusClassName =
      resultStatusClassNameMap[judgeResult.level] ?? styles.DicePerform_trpgResultStatusPending;
    const overlayClassName = [
      styles.DicePerform_trpgOverlay,
      trpgRolling ? styles.DicePerform_trpgOverlayRolling : '',
      trpgImpact ? styles.DicePerform_trpgOverlayImpact : '',
    ]
      .filter(Boolean)
      .join(' ');
    const dieClassName = `${styles.DicePerform_trpgDie} ${
      trpgRolling ? styles.DicePerform_trpgDieRolling : styles.DicePerform_trpgDieLocked
    } ${trpgImpact ? styles.DicePerform_trpgDieImpact : ''} ${styles.DicePerform_trpgDieSolo}`;
    return (
      <div className={`${styles.DicePerform_stage} ${styles.DicePerform_modeTrpg}`}>
        <div className={overlayClassName}>
          <div className={styles.DicePerform_trpgTitle}>{trpgTitle}</div>
          <div className={styles.DicePerform_trpgDiceRow}>
            <div className={dieClassName}>
              <span className={styles.DicePerform_trpgDieInner} />
              <span
                className={`${styles.DicePerform_trpgDieText} ${
                  trpgRolling ? styles.DicePerform_trpgDieTextRolling : ''
                }`}
              >
                {leftDieText}
              </span>
            </div>
          </div>
          <div className={`${styles.DicePerform_trpgResult} ${resultClassName}`}>
            <span className={styles.DicePerform_trpgResultValue}>
              D100= {resultLeft} /{trpgCheckText}
            </span>
            <span className={`${styles.DicePerform_trpgResultStatus} ${resultStatusClassName}`}>
              {judgeResult.label}
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.DicePerform_stage}>
      {hasOptions && (
        <div key={`${renderKey}-options`} className={`${styles.DicePerform_card} ${styles.DicePerform_optionsCard}`}>
          {renderLines(splitBlocks.optionLines, styles.DicePerform_blockOptions)}
        </div>
      )}
      {hasHeader && (
        <div key={`${renderKey}-header`} className={`${styles.DicePerform_card} ${styles.DicePerform_dialogCard}`}>
          {renderLines(splitBlocks.headerLines, styles.DicePerform_blockHeader)}
        </div>
      )}
    </div>
  );
};
