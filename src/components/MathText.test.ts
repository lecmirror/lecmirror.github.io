import { describe, expect, it } from 'vitest';
import { tokenizeMathText } from './MathText';

describe('math text tokenization', () => {
  it('recognizes the inline set notation used by lecture feedback', () => {
    expect(tokenizeMathText('Use $\\{(-1,1), (1,1)\\}$ as the example.')).toEqual([
      { kind: 'text', value: 'Use ' },
      { kind: 'math', value: '\\{(-1,1), (1,1)\\}', display: false },
      { kind: 'text', value: ' as the example.' },
    ]);
  });

  it('supports block and parenthesized LaTeX while preserving plain text', () => {
    expect(tokenizeMathText('Before \\(x^2\\) and $$y=mx+b$$ after')).toEqual([
      { kind: 'text', value: 'Before ' },
      { kind: 'math', value: 'x^2', display: false },
      { kind: 'text', value: ' and ' },
      { kind: 'math', value: 'y=mx+b', display: true },
      { kind: 'text', value: ' after' },
    ]);
  });

  it('leaves unmatched delimiters untouched', () => {
    expect(tokenizeMathText('The price is $5 with no closing delimiter.')).toEqual([
      { kind: 'text', value: 'The price is $5 with no closing delimiter.' },
    ]);
  });
});
