import katex from 'katex';

export type MathTextToken = {
  kind: 'text' | 'math';
  value: string;
  display?: boolean;
};

function isEscaped(value: string, index: number): boolean {
  let slashCount = 0;
  for (let cursor = index - 1; cursor >= 0 && value[cursor] === '\\'; cursor -= 1) slashCount += 1;
  return slashCount % 2 === 1;
}

function closingDelimiter(value: string, start: number, delimiter: string): number {
  let cursor = start;
  while (cursor < value.length) {
    const match = value.indexOf(delimiter, cursor);
    if (match < 0) return -1;
    if (!isEscaped(value, match)) return match;
    cursor = match + delimiter.length;
  }
  return -1;
}

export function tokenizeMathText(value: string): MathTextToken[] {
  const tokens: MathTextToken[] = [];
  let textStart = 0;
  let cursor = 0;

  const pushText = (end: number) => {
    if (end > textStart) tokens.push({ kind: 'text', value: value.slice(textStart, end) });
  };

  while (cursor < value.length) {
    if (value.startsWith('\\[', cursor) && !isEscaped(value, cursor)) {
      const end = value.indexOf('\\]', cursor + 2);
      if (end >= 0) {
        pushText(cursor);
        tokens.push({ kind: 'math', value: value.slice(cursor + 2, end), display: true });
        cursor = end + 2;
        textStart = cursor;
        continue;
      }
    }

    if (value.startsWith('\\(', cursor) && !isEscaped(value, cursor)) {
      const end = value.indexOf('\\)', cursor + 2);
      if (end >= 0) {
        pushText(cursor);
        tokens.push({ kind: 'math', value: value.slice(cursor + 2, end), display: false });
        cursor = end + 2;
        textStart = cursor;
        continue;
      }
    }

    if (value.startsWith('$$', cursor) && !isEscaped(value, cursor)) {
      const end = closingDelimiter(value, cursor + 2, '$$');
      if (end >= 0) {
        pushText(cursor);
        tokens.push({ kind: 'math', value: value.slice(cursor + 2, end), display: true });
        cursor = end + 2;
        textStart = cursor;
        continue;
      }
    }

    if (value[cursor] === '$' && value[cursor + 1] !== '$' && !isEscaped(value, cursor)) {
      const end = closingDelimiter(value, cursor + 1, '$');
      if (end > cursor + 1) {
        pushText(cursor);
        tokens.push({ kind: 'math', value: value.slice(cursor + 1, end), display: false });
        cursor = end + 1;
        textStart = cursor;
        continue;
      }
    }

    cursor += 1;
  }

  pushText(value.length);
  return tokens;
}

export function MathText({ children, className = '' }: { children: string; className?: string }) {
  const tokens = tokenizeMathText(children);
  return (
    <span className={`math-text ${className}`.trim()}>
      {tokens.map((token, index) => token.kind === 'text' ? token.value : (
        <span
          className={token.display ? 'math-expression math-expression-display' : 'math-expression math-expression-inline'}
          // KaTeX escapes formula input and trust is disabled, so generated markup cannot enable raw HTML commands.
          dangerouslySetInnerHTML={{
            __html: katex.renderToString(token.value, {
              displayMode: Boolean(token.display),
              throwOnError: false,
              strict: 'ignore',
              trust: false,
              output: 'html',
            }),
          }}
          key={`${token.kind}-${index}`}
        />
      ))}
    </span>
  );
}
