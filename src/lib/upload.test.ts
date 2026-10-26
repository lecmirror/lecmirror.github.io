import { describe, expect, it } from 'vitest';
import { lectureNameFromFile } from './upload';

describe('lectureNameFromFile', () => {
  it('uses the PDF stem as the default title', () => {
    expect(lectureNameFromFile('Lecture 08.pdf')).toBe('Lecture 08');
  });

  it('preserves non-PDF suffixes', () => {
    expect(lectureNameFromFile('week.one.PDF')).toBe('week.one');
  });
});
