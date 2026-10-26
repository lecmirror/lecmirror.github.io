import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, LogOut, MessageSquareText, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { resolveAssetUrl } from '../lib/upload';
import { MathText } from './MathText';
import {
  asRecord,
  displayFeedbackBody,
  displayFeedbackProblem,
  feedbackItems,
  hasCategory,
  hasRawFeedback,
  normalizeSegments,
  type FeedbackItemView,
  type JsonRecord,
  type NormalizedSegment,
  type ReportMode,
} from '../lib/feedback';
import type { AssetMapping, FeedbackSegment, Lecture } from '../types';

type RatingDimension = 'usefulness' | 'course_alignment' | 'actionability' | 'correctness' | 'question_clarity_readability';
type RatingValues = Partial<Record<RatingDimension, number>>;
type SignedImage = { mapping: AssetMapping; url: string };
type ModalState = { kind: 'feedback' | 'questions'; segmentIndex: number } | null;

const FEEDBACK_DIMENSIONS: Array<{ key: RatingDimension; label: string; prompt: string }> = [
  { key: 'usefulness', label: 'Usefulness', prompt: 'Would this feedback meaningfully help improve the lecture or materials?' },
  { key: 'course_alignment', label: 'Course Alignment', prompt: 'Is this feedback appropriate for the course scope and learning objectives?' },
  { key: 'actionability', label: 'Actionability', prompt: 'Does this feedback provide specific and feasible guidance?' },
  { key: 'correctness', label: 'Correctness', prompt: 'Is this feedback factually correct and supported by the lecture context?' },
];

const QUESTION_DIMENSIONS: Array<{ key: RatingDimension; label: string; prompt: string }> = [
  { key: 'question_clarity_readability', label: 'Clarity and Readability of Question Wording', prompt: 'Is the question clear, readable, and easy to understand?' },
];

const SCORE_COLORS = ['#dc5a5a', '#e27a45', '#d99b28', '#79a94a', '#159271'];

function cleanReferences(value: string): string {
  return value.replace(/\\ref_replace<alu(\d+)>/g, '[ALU $1]');
}

function RatingControls({
  item,
  values,
  onRate,
}: {
  item: FeedbackItemView;
  values: RatingValues;
  onRate: (itemKey: string, dimension: RatingDimension, score: number) => void;
}) {
  const dimensions = item.category === 'questions' ? QUESTION_DIMENSIONS : FEEDBACK_DIMENSIONS;
  return (
    <section className="dimension-annotation-controls">
      <strong>Rate this feedback (0 = lowest, 4 = highest)</strong>
      {dimensions.map((dimension) => (
        <div className="dimension-score-row" key={dimension.key}>
          <span title={dimension.prompt}>{dimension.label}</span>
          <div className="score-buttons">
            {[0, 1, 2, 3, 4].map((score) => (
              <button
                type="button"
                key={score}
                title={`${dimension.label}: ${score}/4. ${dimension.prompt}`}
                className={values[dimension.key] === score ? 'selected' : ''}
                style={{ '--score-color': SCORE_COLORS[score] } as React.CSSProperties}
                onClick={() => onRate(item.itemKey, dimension.key, score)}
              >
                {score}
              </button>
            ))}
          </div>
          <small>{Number.isInteger(values[dimension.key]) ? `${values[dimension.key]}/4` : 'Not scored'}</small>
        </div>
      ))}
    </section>
  );
}

function FeedbackCards({
  items,
  ratings,
  onRate,
  onSlide,
}: {
  items: FeedbackItemView[];
  ratings: Record<string, RatingValues>;
  onRate: (itemKey: string, dimension: RatingDimension, score: number) => void;
  onSlide: (slideId: number) => void;
}) {
  const groups = items.reduce<Array<{ category: string; label: string; tone: FeedbackItemView['tone']; items: FeedbackItemView[] }>>((result, item) => {
    const existing = result.find((group) => group.category === item.category);
    if (existing) existing.items.push(item);
    else result.push({ category: item.category, label: item.label, tone: item.tone, items: [item] });
    return result;
  }, []);

  if (!groups.length) return <div className="feedback-empty">No feedback available for this selection.</div>;
  return (
    <div className="feedback-section">
      {groups.map((group) => (
        <section className={`original-feedback-item ${group.tone}`} key={group.category}>
          <div className="feedback-header"><span className={`original-feedback-badge ${group.tone}`}>{group.label}</span></div>
          <div className="original-feedback-list">
            {group.items.map((item) => {
              const problem = displayFeedbackProblem(item.item);
              const body = cleanReferences(displayFeedbackBody(item.item));
              return (
                <article className="feedback-entry" key={item.itemKey} data-item-key={item.itemKey}>
                  {item.slideIds.length > 0 && (
                    <div className="feedback-location">
                      Location:{' '}
                      {item.slideIds.map((slideId) => <button type="button" key={slideId} onClick={() => onSlide(slideId)}>Slide {slideId}</button>)}
                    </div>
                  )}
                  {problem && problem !== body && <><strong>Problem:</strong><p className="feedback-problem"><MathText>{cleanReferences(problem)}</MathText></p></>}
                  <strong>{item.category === 'questions' ? 'Question:' : item.category === 'slides_feedback' ? 'Problem/Feedback:' : 'Suggestion:'}</strong>
                  <p className="feedback-bullet"><MathText>{body || 'No specific suggestion provided.'}</MathText></p>
                  <RatingControls item={item} values={ratings[item.itemKey] || {}} onRate={onRate} />
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function LogicFlow({ feedback }: { feedback: JsonRecord }) {
  const current = Array.isArray(feedback.edge) ? feedback.edge as unknown[] : [];
  const recommended = Array.isArray(feedback.recommend_edge) ? feedback.recommend_edge as unknown[] : [];
  if (!current.length && !recommended.length) return null;
  const renderEdges = (edges: unknown[], empty: string) => edges.length ? edges.map((edge, index) => {
    const value = asRecord(edge);
    const start = String(value.start ?? value.source ?? '?');
    const end = String(value.end ?? value.target ?? '?');
    const relation = String(value.relationship ?? value.relation ?? 'connects to');
    return <div className="logic-edge" key={`${start}-${end}-${index}`}><span><MathText>{start}</MathText></span><em><MathText>{relation}</MathText></em><span><MathText>{end}</MathText></span></div>;
  }) : <div className="feedback-empty compact">{empty}</div>;
  return (
    <details className="logic-flow" open>
      <summary><span>Interactive Logic Flow (Original vs Recommended)</span><small>Click to view/hide diagram</small></summary>
      <div className="logic-grid">
        <section><h4>Original flow</h4>{renderEdges(current, 'No original-flow edges.')}</section>
        <section><h4>Recommended flow</h4>{renderEdges(recommended, 'No recommended-flow edges.')}</section>
      </div>
    </details>
  );
}

function WorkspaceToggle({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) {
  return (
    <label className="coverage-toggle">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span className="coverage-toggle-track"><span className="coverage-toggle-thumb" /></span>
      <span>{label}</span>
    </label>
  );
}

export function FeedbackWorkspace({ lecture, onBack }: { lecture: Lecture; onBack: () => void }) {
  const [mode, setMode] = useState<ReportMode>(lecture.active_post_run_id ? 'post' : 'pre');
  const [rawSegments, setRawSegments] = useState<FeedbackSegment[]>([]);
  const [images, setImages] = useState<SignedImage[]>([]);
  const [ratings, setRatings] = useState<Record<string, RatingValues>>({});
  const [activeSegmentIndex, setActiveSegmentIndex] = useState(0);
  const [activeSlideId, setActiveSlideId] = useState(0);
  const [validated, setValidated] = useState(true);
  const [showRecommendation, setShowRecommendation] = useState(true);
  const [showTranscriptCoverage, setShowTranscriptCoverage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState<ModalState>(null);
  const runId = mode === 'pre' ? lecture.active_pre_run_id : lecture.active_post_run_id;

  useEffect(() => {
    let cancelled = false;
    async function load(resetPosition = true) {
      if (!runId) { setRawSegments([]); setImages([]); setRatings({}); setLoading(false); return; }
      if (resetPosition) { setLoading(true); setError(''); setModal(null); }
      try {
        const [{ data: userData }, feedbackResponse, assetResponse, ratingsResponse] = await Promise.all([
          supabase.auth.getUser(),
          supabase.from('feedback_segments').select('*').eq('run_id', runId).order('segment_index'),
          supabase.from('asset_mappings').select('*').eq('run_id', runId).eq('asset_type', 'slide_image').eq('status', 'ready').order('page_number'),
          supabase.from('feedback_ratings').select('*').eq('run_id', runId),
        ]);
        if (cancelled) return;
        if (feedbackResponse.error || assetResponse.error || ratingsResponse.error || !userData.user) {
          throw new Error(feedbackResponse.error?.message || assetResponse.error?.message || ratingsResponse.error?.message || 'Could not load the lecture workspace.');
        }
        const segments = (feedbackResponse.data || []) as FeedbackSegment[];
        const mappedImages = await Promise.all(((assetResponse.data || []) as AssetMapping[]).map(async (mapping) => ({
          mapping,
          url: await resolveAssetUrl(mapping.id, mapping.object_key),
        })));
        if (cancelled) return;
        const loadedRatings: Record<string, RatingValues> = {};
        for (const row of ratingsResponse.data || []) {
          loadedRatings[row.item_key] = {
            usefulness: row.usefulness,
            course_alignment: row.course_alignment,
            actionability: row.actionability,
            correctness: row.correctness,
            question_clarity_readability: row.question_clarity_readability,
          };
        }
        setRawSegments(segments);
        setImages(mappedImages);
        setRatings(loadedRatings);
        if (resetPosition) {
          const first = normalizeSegments(segments)[0];
          setActiveSegmentIndex(0);
          setActiveSlideId(first?.startId || 0);
        }
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'Could not load the lecture workspace.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    const refresh = window.setInterval(() => void load(false), 8 * 60 * 1000);
    return () => { cancelled = true; window.clearInterval(refresh); };
  }, [runId]);

  const segments = useMemo(() => normalizeSegments(rawSegments), [rawSegments]);
  const activeSegment = segments[activeSegmentIndex];
  const activeFeedback = activeSegment ? asRecord(activeSegment.source.feedback) : {};
  const slideItems = activeSegment ? feedbackItems(activeSegment, mode, validated, showRecommendation, showTranscriptCoverage, activeSlideId, false) : [];
  const hasValidation = hasRawFeedback(segments);
  const hasRecommendations = hasCategory(segments, 'recommendation_report');
  const hasTranscriptCoverage = mode === 'post' && hasCategory(segments, 'transcript_coverage');

  function imageForSlide(slideId: number): SignedImage | undefined {
    return images.find((image) => image.mapping.page_number === slideId + 1)
      || images.find((image) => image.mapping.page_number === slideId)
      || images[slideId];
  }

  function selectSlide(segmentIndex: number, slideId: number) {
    const segment = segments[segmentIndex];
    if (!segment) return;
    setActiveSegmentIndex(segmentIndex);
    setActiveSlideId(Math.min(segment.endId, Math.max(segment.startId, slideId)));
    setModal(null);
    window.requestAnimationFrame(() => document.querySelector('.annotation-main')?.scrollTo({ top: 0, behavior: 'smooth' }));
  }

  function goToSlide(slideId: number) {
    const segmentIndex = segments.findIndex((segment) => slideId >= segment.startId && slideId <= segment.endId);
    selectSlide(segmentIndex >= 0 ? segmentIndex : activeSegmentIndex, slideId);
  }

  async function rate(itemKey: string, dimension: RatingDimension, score: number) {
    if (!runId) return;
    const previous = ratings[itemKey]?.[dimension];
    setRatings((current) => ({ ...current, [itemKey]: { ...(current[itemKey] || {}), [dimension]: score } }));
    const { error: ratingError } = await supabase.rpc('set_feedback_rating', {
      p_run_id: runId,
      p_item_key: itemKey,
      p_dimension: dimension,
      p_value: score,
    });
    if (ratingError) {
      setRatings((current) => ({ ...current, [itemKey]: { ...(current[itemKey] || {}), [dimension]: previous } }));
      setError(`Could not save rating: ${ratingError.message}`);
    }
  }

  const feedbackLocations = useMemo(() => {
    const seen = new Set<string>();
    return segments.flatMap((segment, segmentIndex) => feedbackItems(segment, mode, validated, showRecommendation, showTranscriptCoverage, null, false).flatMap((item) => item.slideIds.map((slideId) => ({ segmentIndex, slideId })))).sort((a, b) => a.segmentIndex - b.segmentIndex || a.slideId - b.slideId).filter((location) => {
      const key = `${location.segmentIndex}:${location.slideId}`;
      if (seen.has(key)) return false;
      seen.add(key); return true;
    });
  }, [segments, mode, validated, showRecommendation, showTranscriptCoverage]);

  const feedbackCursor = feedbackLocations.findIndex((location) => location.segmentIndex === activeSegmentIndex && location.slideId === activeSlideId);
  const previousFeedback = feedbackCursor > 0 ? feedbackLocations[feedbackCursor - 1] : feedbackLocations.filter((location) => location.segmentIndex < activeSegmentIndex || (location.segmentIndex === activeSegmentIndex && location.slideId < activeSlideId)).at(-1);
  const nextFeedback = feedbackCursor >= 0
    ? feedbackLocations[feedbackCursor + 1]
    : feedbackLocations.find((location) => location.segmentIndex > activeSegmentIndex || (location.segmentIndex === activeSegmentIndex && location.slideId > activeSlideId));

  const activeImage = imageForSlide(activeSlideId);
  const slideOffset = activeSegment ? activeSlideId - activeSegment.startId : 0;
  const topicDescription = activeSegment?.slideDescriptions[slideOffset] || '';
  const transcript = activeSegment?.transcripts[slideOffset] || '';

  const modalSegment = modal ? segments[modal.segmentIndex] : undefined;
  const modalItems = modalSegment ? feedbackItems(modalSegment, mode, validated, showRecommendation, showTranscriptCoverage, null, modal?.kind === 'questions')
    .filter((item) => modal?.kind === 'questions' ? item.category === 'questions' : item.category !== 'questions') : [];

  return (
    <div className="annotation-view">
      <header className="annotation-top-nav">
        <button className="original-btn secondary" onClick={onBack}><ArrowLeft size={16} />Back to Dashboard</button>
        <div className="annotation-user"><span>{lecture.display_name}</span><button className="original-btn secondary compact" onClick={() => supabase.auth.signOut()}><LogOut size={15} />Logout</button></div>
      </header>

      <div className="annotation-layout">
        <aside className="annotation-sidebar">
          <div className="annotation-sidebar-header"><div className="sidebar-kicker">Deck Outline</div><h2>Segments and Slides</h2><p>Browse the deck like a slide editor, grouped by segment with feedback markers and quick links.</p></div>
          <div className="annotation-segment-list">
            {segments.map((segment, segmentIndex) => {
              const pageFeedback = feedbackItems(segment, mode, validated, showRecommendation, showTranscriptCoverage, null, false);
              const commentCount = pageFeedback.reduce((count, item) => count + item.slideIds.length, 0);
              const questions = feedbackItems(segment, mode, validated, showRecommendation, showTranscriptCoverage, null, true).filter((item) => item.category === 'questions');
              return (
                <section className={`annotation-segment-group ${segmentIndex === activeSegmentIndex ? 'active' : ''}`} key={segment.id}>
                  <button className="segment-summary" onClick={() => selectSlide(segmentIndex, segment.startId)}>
                    <span className="part-badge">Part {segment.part}</span><strong><MathText>{segment.description}</MathText></strong>
                    <span className="segment-meta"><span>Slides {segment.startId} - {segment.endId}</span>{commentCount > 0 && <em>{commentCount} comments</em>}</span>
                  </button>
                  <div className="segment-actions"><button onClick={() => setModal({ kind: 'feedback', segmentIndex })}>Segment Feedback</button>{questions.length > 0 && <button onClick={() => setModal({ kind: 'questions', segmentIndex })}>Student Question</button>}</div>
                  <div className="segment-thumbnails">
                    {Array.from({ length: segment.endId - segment.startId + 1 }, (_, offset) => segment.startId + offset).map((slideId) => {
                      const image = imageForSlide(slideId);
                      const count = feedbackItems(segment, mode, validated, showRecommendation, showTranscriptCoverage, slideId, false).length;
                      return (
                        <button className={`slide-thumb ${segmentIndex === activeSegmentIndex && slideId === activeSlideId ? 'active' : ''}`} key={slideId} onClick={() => selectSlide(segmentIndex, slideId)}>
                          <span className="slide-thumb-number">{slideId}</span><span className="slide-thumb-preview">{image ? <img src={image.url} alt={`Slide ${slideId}`} /> : <span>No image</span>}{count > 0 && <em>{count}</em>}</span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        </aside>

        <main className="annotation-main">
          <section className="annotation-workspace-topbar">
            <div><div className="workspace-kicker">{lecture.display_name}</div><h1>{activeSegment ? `Part ${activeSegment.part}: Slide ${activeSlideId}` : 'Select a segment'}</h1><p>{activeSegment ? <><MathText>{activeSegment.description}</MathText><span> | Slides {activeSegment.startId}-{activeSegment.endId}</span></> : 'Review the current slide, transcript, and segment feedback in one workspace.'}</p></div>
            <div className="annotation-toolbar">
              {hasValidation && <WorkspaceToggle checked={validated} onChange={setValidated} label="Validation" />}
              {hasTranscriptCoverage && <WorkspaceToggle checked={showTranscriptCoverage} onChange={setShowTranscriptCoverage} label="Transcript Coverage" />}
              {hasRecommendations && <WorkspaceToggle checked={showRecommendation} onChange={setShowRecommendation} label="Recommendation Report" />}
              <div className="report-toggle"><button className={mode === 'pre' ? 'active' : ''} disabled={!lecture.active_pre_run_id} onClick={() => setMode('pre')}>Pre-Lecture</button><button className={mode === 'post' ? 'active' : ''} disabled={!lecture.active_post_run_id} onClick={() => setMode('post')}>Post-Lecture</button></div>
            </div>
          </section>

          <section className="annotation-controls">
            <button className="original-btn secondary" disabled={!activeSegment || activeSlideId === activeSegment.startId} onClick={() => activeSegment && selectSlide(activeSegmentIndex, activeSegment.startId)}>↖ First Slide in Segment</button>
            <div><button className="original-btn secondary" disabled={!previousFeedback} onClick={() => previousFeedback && selectSlide(previousFeedback.segmentIndex, previousFeedback.slideId)}>← Previous Feedback</button><button className="original-btn secondary" disabled={!nextFeedback} onClick={() => nextFeedback && selectSlide(nextFeedback.segmentIndex, nextFeedback.slideId)}>Next Feedback →</button></div>
            <div><button className="original-btn" disabled={!activeSegment || activeSlideId <= activeSegment.startId} onClick={() => selectSlide(activeSegmentIndex, activeSlideId - 1)}><ChevronLeft size={15} />Previous</button><strong>Slide {activeSegment ? `${slideOffset + 1} / ${activeSegment.endId - activeSegment.startId + 1}` : '—'}</strong><button className="original-btn" disabled={!activeSegment || activeSlideId >= activeSegment.endId} onClick={() => selectSlide(activeSegmentIndex, activeSlideId + 1)}>Next<ChevronRight size={15} /></button></div>
          </section>

          {error && <div className="error-box">{error}</div>}
          {loading ? <div className="annotation-loading">Loading lecture data…</div> : !activeSegment ? <div className="annotation-loading">No report data is available.</div> : (
            <div className="annotation-board">
              <div className="annotation-columns">
                <div className="annotation-primary-column">
                  <section className="slide-stage-card">
                    <div className="slide-stage-meta"><div><h2>Slide {activeSlideId}</h2><p>Segment {activeSegment.part} of {segments.length} | Deck page {activeSlideId + 1}</p></div>{slideItems.length > 0 && <span><MessageSquareText size={15} />{slideItems.length} comments</span>}</div>
                    <div className="slide-stage-frame">{activeImage ? <img src={activeImage.url} alt={`Slide ${activeSlideId}`} /> : <div className="missing-slide">No slide image is available.</div>}</div>
                  </section>
                  <section className="annotation-panel-card"><div className="panel-header"><div><h3>Transcript</h3><p>Current slide description and extracted talk track.</p></div></div><div className="transcript-content"><strong>Topic Description</strong><p><MathText>{topicDescription || 'No description provided.'}</MathText></p><strong>Transcript</strong><p><MathText>{transcript || 'No specific transcript data extracted for this slide block.'}</MathText></p></div></section>
                </div>
                <aside className="annotation-panel-card feedback-panel"><div className="panel-header"><div><h3>Slide Feedback</h3><p>Feedback specific to this page.</p></div></div><FeedbackCards items={slideItems} ratings={ratings} onRate={rate} onSlide={goToSlide} /></aside>
              </div>
            </div>
          )}
        </main>
      </div>

      {modal && modalSegment && (
        <div className="annotation-modal-backdrop" role="dialog" aria-modal="true" onClick={() => setModal(null)}>
          <div className="annotation-modal" onClick={(event) => event.stopPropagation()}>
            <button className="annotation-modal-close" aria-label="Close" onClick={() => setModal(null)}><X size={22} /></button>
            <h2>Segment {modalSegment.part} {modal.kind === 'questions' ? 'Student Questions' : 'Feedback'}</h2><p><MathText>{modalSegment.description}</MathText></p>
            <FeedbackCards items={modalItems} ratings={ratings} onRate={rate} onSlide={goToSlide} />
            {modal.kind === 'feedback' && <LogicFlow feedback={asRecord(modalSegment.source.feedback)} />}
          </div>
        </div>
      )}
    </div>
  );
}
