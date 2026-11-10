export type JobStatus =
  | 'uploading'
  | 'staging'
  | 'queued'
  | 'claimed'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

export interface PipelineJob {
  id: string;
  lecture_id: string;
  job_type: 'pre' | 'post';
  status: JobStatus;
  stage: string | null;
  progress: number;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface Lecture {
  id: string;
  display_name: string;
  created_by: string | null;
  created_source: 'web' | 'staff';
  group_id: string | null;
  active_pre_run_id: string | null;
  active_post_run_id: string | null;
  created_at: string;
  pipeline_jobs?: PipelineJob[];
  lecture_group?: Pick<LectureGroup, 'id' | 'name'> | null;
}

export interface LectureGroup {
  id: string;
  name: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface LectureGroupMember {
  group_id: string;
  user_id: string;
  created_at: string;
}

export interface WorkspaceUser {
  user_id: string;
  email: string;
  role: 'admin' | 'annotator';
}

export interface AssetMapping {
  id: string;
  lecture_id: string;
  run_id: string | null;
  job_id: string | null;
  asset_type: 'pre_pdf' | 'post_pdf' | 'slide_image' | 'dag_image';
  object_key: string;
  page_number: number | null;
  status: 'pending' | 'ready' | 'failed';
}

export interface FeedbackSegment {
  id: string;
  run_id: string;
  segment_index: number;
  segment_meta: Record<string, unknown>;
  feedback: Record<string, unknown>;
}

export interface UploadInitResponse {
  lectureId: string;
  jobId: string;
  mappingId: string;
  objectKey: string;
  groupId?: string | null;
  uploadMode: 'single' | 'multipart';
  uploadUrl?: string;
  uploadId?: string;
  partSize?: number;
  partUrls?: Array<{ partNumber: number; url: string }>;
}
