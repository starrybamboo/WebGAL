import { useMemo } from 'react';
import { css } from '@emotion/css';
import useEscape from '@/hooks/useEscape';
import styles from './dicePerform.module.scss';
import { useStageState } from '@/hooks/useStageState';

interface DiceTextSegment {
  text: string;
  ruby?: string;
  style?: string;
  styleAllText?: string;
}

const OPTION_PATTERN = /^\s*([0-9０-９]+)\s*(?:[.)）．。、,:：，]\s*|\s+)(\S.*)$/;
const ENHANCED_PATTERN = /(\[(.*?)\]\((.*?)\))|([^\[\]]+)/g;

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

export const DicePerform = () => {
  const { dicePerform } = useStageState();
  const renderKey = dicePerform.revision ?? 0;

  const lines = useMemo(() => {
    if (!dicePerform.visible) return [];
    const raw = String(dicePerform.content ?? '');
    const pieces = raw.split(/(?<!\\)\|/).map((item) => useEscape(item));
    return pieces.filter((line) => line.trim() !== '');
  }, [dicePerform.content, dicePerform.visible]);

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

  const hasHeader = splitBlocks.headerLines.length > 0;
  const hasOptions = splitBlocks.optionLines.length > 0;

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
