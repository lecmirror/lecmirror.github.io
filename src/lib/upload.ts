import { supabase } from './supabase';
import type { UploadInitResponse } from '../types';

const MULTIPART_CONCURRENCY = 4;

export function lectureNameFromFile(filename: string): string {
  return filename.replace(/\.pdf$/i, '').trim();
}

function putWithProgress(
  url: string,
  body: Blob,
  contentType: string,
  onProgress: (loaded: number) => void,
): Promise<{ etag: string | null }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.upload.onprogress = (event) => onProgress(event.loaded);
    xhr.onerror = () => reject(new Error('The upload connection was interrupted.'));
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve({ etag: xhr.getResponseHeader('ETag') });
      } else {
        reject(new Error(`R2 upload failed with HTTP ${xhr.status}.`));
      }
    };
    xhr.send(body);
  });
}

async function putWithRetry(
  url: string,
  body: Blob,
  contentType: string,
  onProgress: (loaded: number) => void,
): Promise<{ etag: string | null }> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return await putWithProgress(url, body, contentType, onProgress);
    } catch (error) {
      lastError = error;
      if (attempt === 3) break;
      await new Promise((resolve) => window.setTimeout(resolve, (2 ** attempt) * 500 + Math.random() * 400));
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Upload failed after retries.');
}

async function runPool<T>(tasks: Array<() => Promise<T>>, concurrency: number): Promise<T[]> {
  const output = new Array<T>(tasks.length);
  let next = 0;
  async function worker() {
    while (next < tasks.length) {
      const index = next++;
      output[index] = await tasks[index]();
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker));
  return output;
}

export async function uploadPreLecture(
  file: File,
  displayName: string,
  onProgress: (percentage: number) => void,
): Promise<{ lectureId: string; jobId: string }> {
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    throw new Error('Please choose a PDF file.');
  }
  if (!displayName.trim()) throw new Error('Lecture name is required.');

  const { data, error } = await supabase.functions.invoke<UploadInitResponse>('r2-upload-init', {
    body: {
      displayName: displayName.trim(),
      filename: file.name,
      sizeBytes: file.size,
      mimeType: 'application/pdf',
    },
  });
  if (error || !data) throw new Error(error?.message || 'Could not initialize the upload.');

  let parts: Array<{ partNumber: number; etag: string }> | undefined;
  if (data.uploadMode === 'single' && data.uploadUrl) {
    const result = await putWithRetry(data.uploadUrl, file, 'application/pdf', (loaded) => {
      onProgress(Math.round((loaded / file.size) * 100));
    });
    parts = result.etag ? [{ partNumber: 1, etag: result.etag.replaceAll('"', '') }] : undefined;
  } else if (data.uploadMode === 'multipart' && data.partUrls && data.partSize) {
    const uploadedByPart = new Map<number, number>();
    const tasks = data.partUrls.map(({ partNumber, url }) => async () => {
      const start = (partNumber - 1) * data.partSize!;
      const chunk = file.slice(start, Math.min(start + data.partSize!, file.size));
      const result = await putWithRetry(url, chunk, 'application/pdf', (loaded) => {
        uploadedByPart.set(partNumber, loaded);
        const total = [...uploadedByPart.values()].reduce((sum, value) => sum + value, 0);
        onProgress(Math.round((total / file.size) * 100));
      });
      if (!result.etag) throw new Error(`R2 did not return an ETag for part ${partNumber}.`);
      return { partNumber, etag: result.etag.replaceAll('"', '') };
    });
    parts = await runPool(tasks, MULTIPART_CONCURRENCY);
  } else {
    throw new Error('The upload service returned an incomplete upload session.');
  }

  const completion = await supabase.functions.invoke('r2-upload-complete', {
    body: {
      jobId: data.jobId,
      mappingId: data.mappingId,
      uploadId: data.uploadId,
      parts,
    },
  });
  if (completion.error) throw new Error(completion.error.message);
  onProgress(100);
  return { lectureId: data.lectureId, jobId: data.jobId };
}

const r2PublicBaseUrl = import.meta.env.VITE_R2_PUBLIC_BASE_URL?.replace(/\/$/, '');

export async function resolveAssetUrl(mappingId: string, objectKey: string): Promise<string> {
  if (r2PublicBaseUrl) {
    const encodedKey = objectKey.split('/').map(encodeURIComponent).join('/');
    return `${r2PublicBaseUrl}/${encodedKey}`;
  }

  const { data, error } = await supabase.functions.invoke<{ url: string }>('r2-sign-download', {
    body: { mappingId },
  });
  if (error || !data?.url) throw new Error(error?.message || 'Could not sign the asset URL.');
  return data.url;
}
