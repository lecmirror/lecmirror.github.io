import type { FeedbackSegment } from '../types';

export type JsonRecord = Record<string, unknown>;
export type ReportMode = 'pre' | 'post';

export interface NormalizedSegment {
  id: string;
  source: FeedbackSegment;
  part: string;
  description: string;
  startId: number;
  endId: number;
  slideDescriptions: string[];
  transcripts: string[];
}

export interface FeedbackItemView {
  category: string;
  label: string;
  tone: 'error' | 'warning' | 'success';
  item: unknown;
  itemIndex: number;
  itemKey: string;
  slideIds: number[];
}

const CATEGORY_META: Record<string, { label: string; tone: FeedbackItemView['tone'] }> = {
  slides_feedback: { label: 'Slides Feedback', tone: 'error' },
  content_errors: { label: 'Content Errors', tone: 'error' },
  pacing_and_confusion_points: { label: 'Pacing / Confusion', tone: 'warning' },
  logical_flow: { label: 'Logical Flow', tone: 'warning' },
  language_and_slide_clarity: { label: 'Clarity', tone: 'success' },
  questions: { label: 'Student Questions', tone: 'warning' },
  recommendation_report: { label: 'Recommendation Report', tone: 'success' },
  transcript_coverage: { label: 'Transcript Coverage (Unmapped)', tone: 'error' },
};

const CATEGORY_ORDER: Record<ReportMode, string[]> = {
  pre: ['slides_feedback', 'recommendation_report'],
  post: [
    'content_errors',
    'pacing_and_confusion_points',
    'logical_flow',
    'language_and_slide_clarity',
    'questions',
    'recommendation_report',
    'transcript_coverage',
  ],
};

export function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function firstNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const match = String(value ?? '').match(/-?\d+/);
  return match ? Number(match[0]) : null;
}

function numbers(value: unknown): number[] {
  if (Array.isArray(value)) return value.flatMap(numbers);
  if (typeof value === 'number' && Number.isFinite(value)) return [value];
  return (String(value ?? '').match(/-?\d+/g) || []).map(Number);
}

function displayString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(displayString).filter(Boolean).join('\n');
  if (value && typeof value === 'object') {
    const record = value as JsonRecord;
    return displayString(record.text ?? record.transcript ?? record.content ?? record.summary ?? '');
  }
  return value == null ? '' : String(value);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(displayString) : [];
}

function feedbackSlideCandidates(feedback: JsonRecord): number[] {
  const result: number[] = [];
  for (const category of Object.keys(CATEGORY_META)) {
    const items = Array.isArray(feedback[category]) ? feedback[category] as unknown[] : [];
    for (const item of items) {
      const record = asRecord(item);
      result.push(...numbers(record.slide_id ?? record.location ?? record.mapped_to_slide ?? record.mapped_id));
    }
  }
  return result;
}

export function normalizeSegments(segments: FeedbackSegment[]): NormalizedSegment[] {
  return segments.map((source, index) => {
    const meta = asRecord(source.segment_meta);
    const feedback = asRecord(source.feedback);
    const slideIds = Array.isArray(meta.slide_ids) ? (meta.slide_ids as unknown[]).flatMap(numbers) : [];
    const inferred = feedbackSlideCandidates(feedback);
    let startId = firstNumber(meta.st_id ?? feedback.st_id);
    let endId = firstNumber(meta.end_id ?? feedback.end_id);
    if (startId === null && slideIds.length) startId = Math.min(...slideIds);
    if (endId === null && slideIds.length) endId = Math.max(...slideIds);
    if (startId === null && inferred.length) startId = Math.min(...inferred);
    if (endId === null && inferred.length) endId = Math.max(...inferred);
    if (startId === null) startId = source.segment_index;
    if (endId === null || endId < startId) endId = startId;
    return {
      id: source.id,
      source,
      part: String(meta.part ?? feedback.part ?? index + 1),
      description: displayString(meta.description ?? feedback.description) || `Lecture segment ${index + 1}`,
      startId,
      endId,
      slideDescriptions: stringArray(meta.slide_description),
      transcripts: stringArray(meta.matched_sentences ?? meta.texts),
    };
  });
}

export function feedbackForValidation(feedback: JsonRecord, validated: boolean): JsonRecord {
  if (validated) return feedback;
  const raw = { ...feedback };
  for (const [key, value] of Object.entries(feedback)) {
    if (key.startsWith('raw_') && Array.isArray(value)) raw[key.slice(4)] = value;
  }
  return raw;
}

function validationFingerprint(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(validationFingerprint).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as JsonRecord;
    return `{${Object.keys(record)
      .filter((key) => !['id', 'reason', 'validation_source_id'].includes(key))
      .sort()
      .map((key) => `${JSON.stringify(key)}:${validationFingerprint(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function stableRawIndexes(feedback: JsonRecord, category: string, values: unknown[], validated: boolean): number[] {
  const rawValues = Array.isArray(feedback[`raw_${category}`]) ? feedback[`raw_${category}`] as unknown[] : null;
  if (!validated || !rawValues) return values.map((_, index) => index);
  const used = new Set<number>();
  return values.map((value, index) => {
    const record = asRecord(value);
    const explicitId = record.validation_source_id ?? record.id;
    let rawIndex = explicitId === undefined ? -1 : rawValues.findIndex((raw, candidateIndex) => {
      const rawRecord = asRecord(raw);
      return !used.has(candidateIndex) && (rawRecord.id === explicitId || candidateIndex === explicitId);
    });
    if (rawIndex < 0) {
      const fingerprint = validationFingerprint(value);
      rawIndex = rawValues.findIndex((raw, candidateIndex) => !used.has(candidateIndex) && validationFingerprint(raw) === fingerprint);
    }
    if (rawIndex < 0) return index;
    used.add(rawIndex);
    return rawIndex;
  });
}

function recommendationSlides(feedback: JsonRecord, item: unknown): number[] {
  const record = asRecord(item);
  const source = typeof item === 'string' ? item : displayString(record.report_info ?? item);
  const aluIds = [...source.matchAll(/\\ref_replace<alu(\d+)>/g)].map((match) => {
    const alias = record[`alu${match[1]}`];
    return alias ?? Number(match[1]);
  });
  const aluResult = asRecord(feedback.alu_result);
  const mappings = Array.isArray(aluResult.slide_mappings) ? aluResult.slide_mappings as unknown[] : [];
  return [...new Set(aluIds.flatMap((aluId) => {
    const mapping = mappings.map(asRecord).find((candidate) => String(candidate.slide_alu_id) === String(aluId));
    return numbers(mapping?.slide_id ?? aluId);
  }))];
}

export function feedbackItemSlideIds(feedback: JsonRecord, category: string, item: unknown): number[] {
  const record = asRecord(item);
  if (category === 'recommendation_report') return recommendationSlides(feedback, item);
  if (category === 'transcript_coverage') {
    const direct = numbers(record.mapped_to_slide ?? record.mapped_id ?? record.slide_id);
    if (direct.length) return [...new Set(direct)];
    const aluResult = asRecord(feedback.alu_result);
    const transcriptMappings = Array.isArray(aluResult.transcript_mappings) ? aluResult.transcript_mappings as unknown[] : [];
    const label = record.label ?? record.topic;
    const transcript = transcriptMappings.map(asRecord).find((candidate) => candidate.transcript_label === label);
    const recommendedAluId = transcript?.recommended_insert_slide_alu_id;
    const slideMappings = Array.isArray(aluResult.slide_mappings) ? aluResult.slide_mappings as unknown[] : [];
    const mapping = slideMappings.map(asRecord).find((candidate) => String(candidate.slide_alu_id) === String(recommendedAluId));
    return numbers(mapping?.slide_id);
  }
  return [...new Set(numbers(record.slide_id ?? record.location ?? record.mapped_to_slide ?? record.mapped_id))];
}

export function feedbackItems(
  segment: NormalizedSegment,
  mode: ReportMode,
  validated: boolean,
  showRecommendation: boolean,
  showTranscriptCoverage: boolean,
  targetSlideId: number | null = null,
  includeQuestions = true,
): FeedbackItemView[] {
  const feedback = feedbackForValidation(asRecord(segment.source.feedback), validated);
  const storedFeedback = asRecord(segment.source.feedback);
  const result: FeedbackItemView[] = [];
  for (const category of CATEGORY_ORDER[mode]) {
    if (category === 'recommendation_report' && !showRecommendation) continue;
    if (category === 'transcript_coverage' && !showTranscriptCoverage) continue;
    if (category === 'questions' && (!includeQuestions || targetSlideId !== null)) continue;
    const values = Array.isArray(feedback[category]) ? feedback[category] as unknown[] : [];
    const sourceIndexes = stableRawIndexes(storedFeedback, category, values, validated);
    values.forEach((item, itemIndex) => {
      const record = asRecord(item);
      const hasUsefulContent = displayFeedbackBody(item) || displayFeedbackProblem(item);
      if (!hasUsefulContent) return;
      const slideIds = feedbackItemSlideIds(feedback, category, item);
      if (targetSlideId !== null && !slideIds.some((slideId) => slideId === targetSlideId)) return;
      const meta = CATEGORY_META[category];
      result.push({
        category,
        label: meta.label,
        tone: meta.tone,
        item,
        itemIndex,
        itemKey: `${segment.id}:${category}:${sourceIndexes[itemIndex]}`,
        slideIds,
      });
    });
  }
  return result;
}

export function displayFeedbackProblem(item: unknown): string {
  const record = asRecord(item);
  return displayString(record.problem_description ?? record.label ?? record.topic ?? '');
}

export function displayFeedbackBody(item: unknown): string {
  if (typeof item === 'string') return item;
  const record = asRecord(item);
  return displayString(
    record.feedback
      ?? record.suggestion
      ?? record.report_info
      ?? record.question
      ?? record.summary
      ?? record.description
      ?? '',
  );
}

export function hasRawFeedback(segments: NormalizedSegment[]): boolean {
  return segments.some((segment) => Object.entries(asRecord(segment.source.feedback)).some(([key, value]) => key.startsWith('raw_') && Array.isArray(value)));
}

export function hasCategory(segments: NormalizedSegment[], category: string): boolean {
  return segments.some((segment) => {
    const feedback = asRecord(segment.source.feedback);
    return [feedback[category], feedback[`raw_${category}`]].some((value) => Array.isArray(value) && value.length > 0);
  });
}
