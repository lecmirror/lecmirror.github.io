import { describe, expect, it } from 'vitest';
import type { FeedbackSegment } from '../types';
import { feedbackItems, normalizeSegments } from './feedback';

const source: FeedbackSegment = {
  id: 'segment-a',
  run_id: 'run-a',
  segment_index: 0,
  segment_meta: { part: 1, description: 'Foundations', st_id: 0, end_id: 1 },
  feedback: {
    slides_feedback: [{ slide_id: 1, feedback: 'Clarify the definition.' }],
    recommendation_report: [{ report_info: 'Connect \\ref_replace<alu0> to the example.', alu0: 7 }],
    alu_result: { slide_mappings: [{ slide_alu_id: 7, slide_id: 0 }] },
  },
};

describe('feedback workspace adapters', () => {
  it('preserves the original segment bounds and labels', () => {
    expect(normalizeSegments([source])[0]).toMatchObject({ part: '1', description: 'Foundations', startId: 0, endId: 1 });
  });

  it('filters page feedback while retaining stable rating keys', () => {
    const segment = normalizeSegments([source])[0];
    expect(feedbackItems(segment, 'pre', true, true, false, 1).map((item) => item.itemKey)).toEqual([
      'segment-a:slides_feedback:0',
    ]);
    expect(feedbackItems(segment, 'pre', true, true, false, 0).map((item) => item.category)).toEqual([
      'recommendation_report',
    ]);
  });

  it('keeps validated feedback tied to its raw source rating key', () => {
    const withValidation: FeedbackSegment = {
      ...source,
      feedback: {
        raw_slides_feedback: [
          { id: 4, slide_id: 0, feedback: 'Removed' },
          { id: 9, slide_id: 1, feedback: 'Retained' },
        ],
        slides_feedback: [{ validation_source_id: 9, slide_id: 1, feedback: 'Retained' }],
      },
    };
    const segment = normalizeSegments([withValidation])[0];
    expect(feedbackItems(segment, 'pre', true, true, false)[0].itemKey).toBe('segment-a:slides_feedback:1');
    expect(feedbackItems(segment, 'pre', false, true, false)[1].itemKey).toBe('segment-a:slides_feedback:1');
  });
});
