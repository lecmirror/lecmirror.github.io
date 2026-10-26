import type { PipelineJob } from '../types';

export const jobStatusLabels: Record<string, string> = {
  uploading: 'Uploading',
  staging: 'Preparing',
  queued: 'Queued',
  claimed: 'Starting',
  running: 'Generating feedback',
  succeeded: 'Ready',
  failed: 'Needs attention',
  cancelled: 'Cancelled',
};

export const pipelineStageLabels: Record<string, string> = {
  reading_slides: 'Reading slides',
  describing_slides: 'Describing slides',
  segmenting_lecture: 'Segmenting lecture',
  generating_feedback: 'Generating feedback',
  validating_feedback: 'Validating feedback',
  analyzing_logic_flow: 'Analyzing logic flow',
  uploading_report_assets: 'Uploading report assets',
  publishing_report: 'Publishing report',
  complete: 'Ready',

  // Keep jobs started by the previous worker version readable while they finish.
  downloading_pdf: 'Reading slides',
  running_pipeline: 'Generating feedback',
  uploading_images: 'Uploading report assets',
  publishing_feedback: 'Publishing report',
};

export function jobDisplayLabel(job?: PipelineJob): string {
  if (!job) return 'Ready';
  if ((job.status === 'claimed' || job.status === 'running') && job.stage) {
    return pipelineStageLabels[job.stage] || jobStatusLabels[job.status] || job.status;
  }
  return jobStatusLabels[job.status] || job.status;
}

export function isProcessingJob(job?: PipelineJob): boolean {
  return job?.status === 'claimed' || job?.status === 'running';
}
