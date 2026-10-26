import { describe, expect, it } from 'vitest';
import type { PipelineJob } from '../types';
import { jobDisplayLabel, pipelineStageLabels } from './stages';

function job(overrides: Partial<PipelineJob> = {}): PipelineJob {
  return {
    id: 'job-1',
    lecture_id: 'lecture-1',
    job_type: 'pre',
    status: 'running',
    stage: 'reading_slides',
    progress: 8,
    error_message: null,
    created_at: '2026-10-26T00:00:00Z',
    updated_at: '2026-10-26T00:00:00Z',
    ...overrides,
  };
}

describe('pipeline stage labels', () => {
  it('uses the requested eight-stage sequence', () => {
    expect(Object.entries(pipelineStageLabels).slice(0, 8)).toEqual([
      ['reading_slides', 'Reading slides'],
      ['describing_slides', 'Describing slides'],
      ['segmenting_lecture', 'Segmenting lecture'],
      ['generating_feedback', 'Generating feedback'],
      ['validating_feedback', 'Validating feedback'],
      ['analyzing_logic_flow', 'Analyzing logic flow'],
      ['uploading_report_assets', 'Uploading report assets'],
      ['publishing_report', 'Publishing report'],
    ]);
  });

  it('shows a running job stage instead of the generic status', () => {
    expect(jobDisplayLabel(job({ stage: 'analyzing_logic_flow', progress: 75 }))).toBe('Analyzing logic flow');
  });

  it('keeps terminal status labels authoritative', () => {
    expect(jobDisplayLabel(job({ status: 'failed', stage: 'describing_slides' }))).toBe('Needs attention');
  });
});
