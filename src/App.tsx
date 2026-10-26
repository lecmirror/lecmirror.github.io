import { useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  ArrowLeft,
  BookOpen,
  Check,
  ChevronRight,
  Clock3,
  CloudUpload,
  FileText,
  LogOut,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Upload,
  UserPlus,
  X,
} from 'lucide-react';
import { supabase } from './lib/supabase';
import { lectureNameFromFile, resolveAssetUrl, uploadPreLecture } from './lib/upload';
import type { AssetMapping, FeedbackSegment, Lecture, PipelineJob } from './types';

type View = { kind: 'dashboard' } | { kind: 'lecture'; lecture: Lecture };

const jobLabel: Record<string, string> = {
  uploading: 'Uploading',
  staging: 'Preparing',
  queued: 'Queued',
  claimed: 'Starting',
  running: 'Generating feedback',
  succeeded: 'Ready',
  failed: 'Needs attention',
  cancelled: 'Cancelled',
};

function Logo() {
  return (
    <div className="brand">
      <span className="brand-mark"><BookOpen size={22} /></span>
      <span>LecMirror</span>
    </div>
  );
}

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const result = await supabase.auth.signInWithPassword({ email, password });
    if (result.error) setError(result.error.message);
    setBusy(false);
  }

  return (
    <main className="login-shell">
      <section className="login-story">
        <Logo />
        <div className="story-copy">
          <span className="eyebrow light">A clearer view of every lecture</span>
          <h1>Turn lecture materials into feedback you can act on.</h1>
          <p>Upload slides, follow the analysis, and review every recommendation in one focused workspace.</p>
          <div className="story-stat"><Sparkles size={18} /> AI-assisted pre- and post-lecture review</div>
        </div>
      </section>
      <section className="login-panel">
        <form className="login-card" onSubmit={submit}>
          <span className="eyebrow">Welcome back</span>
          <h2>Sign in to your workspace</h2>
          <p className="muted">Use your LecMirror annotator account.</p>
          <label>Email address<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
          <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
          {error && <div className="error-box">{error}</div>}
          <button className="primary-button full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        </form>
      </section>
    </main>
  );
}

function StatusPill({ job }: { job?: PipelineJob }) {
  const status = job?.status || 'succeeded';
  return <span className={`status-pill status-${status}`}>{status === 'succeeded' && <Check size={13} />}{jobLabel[status] || status}</span>;
}

function UploadDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setFile(null); setTitle(''); setProgress(0); setError(''); setBusy(false);
    }
  }, [open]);

  function choose(next: File | null) {
    if (!next) return;
    if (next.type !== 'application/pdf' && !next.name.toLowerCase().endsWith('.pdf')) {
      setError('Please select a PDF file.'); return;
    }
    setError(''); setFile(next); setTitle(lectureNameFromFile(next.name));
  }

  async function submit() {
    if (!file) return setError('Choose a PDF to continue.');
    setBusy(true); setError('');
    try {
      await uploadPreLecture(file, title, setProgress);
      onCreated(); onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Upload failed.');
    } finally { setBusy(false); }
  }

  if (!open) return null;
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card">
        <button className="icon-button modal-close" onClick={onClose} aria-label="Close"><X size={20} /></button>
        <span className="eyebrow">Pre-lecture review</span>
        <h2>Upload your slide deck</h2>
        <p className="muted">We will keep the original PDF private in Cloudflare R2 and notify you when the report is ready.</p>
        <button
          type="button"
          className={`dropzone ${file ? 'has-file' : ''}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); choose(e.dataTransfer.files[0] || null); }}
        >
          <input ref={inputRef} hidden type="file" accept="application/pdf,.pdf" onChange={(e) => choose(e.target.files?.[0] || null)} />
          <span className="drop-icon">{file ? <FileText size={27} /> : <CloudUpload size={27} />}</span>
          <strong>{file ? file.name : 'Drop a PDF here, or browse'}</strong>
          <span>{file ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : 'Private PDF upload · large files resume by part'}</span>
        </button>
        <label className="field-label">Lecture name<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Introduction to Databases" /></label>
        {busy && <div className="progress-block"><div className="progress-meta"><span>Uploading securely</span><strong>{progress}%</strong></div><div className="progress-track"><span style={{ width: `${progress}%` }} /></div></div>}
        {error && <div className="error-box">{error}</div>}
        <div className="modal-actions"><button className="secondary-button" onClick={onClose} disabled={busy}>Cancel</button><button className="primary-button" onClick={submit} disabled={busy || !file}><Upload size={17} />{busy ? 'Uploading…' : 'Upload and generate'}</button></div>
      </div>
    </div>
  );
}

function LectureCard({ lecture, onOpen }: { lecture: Lecture; onOpen: () => void }) {
  const latestJob = lecture.pipeline_jobs?.slice().sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  const hasPre = Boolean(lecture.active_pre_run_id);
  const hasPost = Boolean(lecture.active_post_run_id);
  return (
    <button className="lecture-card" onClick={onOpen}>
      <div className="lecture-cover"><div className="cover-grid" /><span><FileText size={25} /></span></div>
      <div className="lecture-card-body">
        <div className="card-heading"><div><span className="card-kicker">Lecture</span><h3>{lecture.display_name}</h3></div><ChevronRight size={20} /></div>
        <div className="badges">{hasPre && <span className="report-badge pre">PRE</span>}{hasPost && <span className="report-badge post">POST</span>}<StatusPill job={latestJob} /></div>
        {latestJob && latestJob.status === 'running' && <div className="mini-progress"><span style={{ width: `${latestJob.progress}%` }} /></div>}
        <div className="card-footer"><Clock3 size={14} /> {new Date(lecture.created_at).toLocaleDateString()}</div>
      </div>
    </button>
  );
}

function Dashboard({ session, onOpen }: { session: Session; onOpen: (lecture: Lecture) => void }) {
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminLecture, setAdminLecture] = useState('');
  const [labelerId, setLabelerId] = useState('');
  const [adminMessage, setAdminMessage] = useState('');

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.from('lectures').select('*,pipeline_jobs(*)').order('created_at', { ascending: false });
    if (!error) setLectures((data || []) as Lecture[]);
    setLoading(false);
  }

  useEffect(() => {
    void load();
    void supabase.from('user_roles').select('role').eq('user_id', session.user.id).maybeSingle().then(({ data }) => setIsAdmin(data?.role === 'admin'));
    const channel = supabase.channel('lecmirror-dashboard').on('postgres_changes', { event: '*', schema: 'public', table: 'pipeline_jobs' }, () => void load()).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, []);

  const visible = useMemo(() => lectures.filter((lecture) => lecture.display_name.toLowerCase().includes(query.toLowerCase())), [lectures, query]);
  const failedJobs = lectures.flatMap((lecture) => (lecture.pipeline_jobs || []).filter((job) => job.status === 'failed').map((job) => ({ lecture, job })));

  async function retryJob(jobId: string) {
    const { error } = await supabase.rpc('retry_pipeline_job', { p_job_id: jobId });
    setAdminMessage(error ? error.message : 'Job returned to the queue.');
    if (!error) await load();
  }

  async function grantLabeler() {
    if (!adminLecture || !labelerId.trim()) return setAdminMessage('Choose a lecture and enter a user UUID.');
    const { error } = await supabase.rpc('grant_lecture_labeler', { p_lecture_id: adminLecture, p_user_id: labelerId.trim() });
    setAdminMessage(error ? error.message : 'Labeler access granted.');
    if (!error) setLabelerId('');
  }

  return (
    <>
      <header className="app-header"><Logo /><div className="header-user"><span>{session.user.email}</span><button className="icon-button" onClick={() => supabase.auth.signOut()} title="Sign out"><LogOut size={18} /></button></div></header>
      <main className="dashboard-shell">
        <section className="dashboard-hero"><div><span className="eyebrow">Lecture workspace</span><h1>Review, refine, and label.</h1><p>Upload pre-lecture slides or continue reviewing your assigned reports.</p></div><button className="primary-button hero-action" onClick={() => setUploadOpen(true)}><Upload size={18} />Upload pre-lecture PDF</button></section>
        <section className="insight-strip"><div><span className="insight-icon"><ShieldCheck size={20} /></span><div><strong>Private by default</strong><span>Files are stored in a protected R2 bucket.</span></div></div><div><span className="insight-icon blue"><RefreshCw size={20} /></span><div><strong>Automatic pipeline</strong><span>New uploads are picked up within one minute.</span></div></div></section>
        {isAdmin && <section className="admin-panel"><div className="admin-heading"><div><span className="eyebrow">Admin controls</span><h2>Queue and access</h2></div><span>{failedJobs.length} failed jobs</span></div><div className="admin-grid"><div><h3>Retry failed jobs</h3>{failedJobs.length ? failedJobs.map(({ lecture, job }) => <div className="admin-row" key={job.id}><span><strong>{lecture.display_name}</strong><small>{job.error_message || 'Pipeline failed'}</small></span><button className="secondary-button" onClick={() => void retryJob(job.id)}><RefreshCw size={15} />Retry</button></div>) : <p className="muted">No failed jobs.</p>}</div><div><h3>Assign a labeler</h3><label className="field-label">Lecture<select value={adminLecture} onChange={(event) => setAdminLecture(event.target.value)}><option value="">Choose lecture…</option>{lectures.map((lecture) => <option key={lecture.id} value={lecture.id}>{lecture.display_name}</option>)}</select></label><label className="field-label">User UUID<input value={labelerId} onChange={(event) => setLabelerId(event.target.value)} placeholder="Supabase auth user ID" /></label><button className="primary-button" onClick={() => void grantLabeler()}><UserPlus size={16} />Grant labeler access</button></div></div>{adminMessage && <div className="admin-message">{adminMessage}</div>}</section>}
        <section className="content-section">
          <div className="section-heading"><div><span className="eyebrow">Your library</span><h2>Lectures</h2></div><label className="search-box"><Search size={17} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search lectures" /></label></div>
          {loading ? <div className="empty-state">Loading your workspace…</div> : visible.length ? <div className="lecture-grid">{visible.map((lecture) => <LectureCard key={lecture.id} lecture={lecture} onOpen={() => onOpen(lecture)} />)}</div> : <div className="empty-state"><FileText size={30} /><h3>No lectures yet</h3><p>Upload your first slide deck to begin.</p></div>}
        </section>
      </main>
      <UploadDialog open={uploadOpen} onClose={() => setUploadOpen(false)} onCreated={load} />
    </>
  );
}

type FeedbackItem = { key: string; category: string; body: string; segmentIndex: number };

function flattenFeedback(segments: FeedbackSegment[]): FeedbackItem[] {
  const items: FeedbackItem[] = [];
  for (const segment of segments) {
    for (const [category, value] of Object.entries(segment.feedback || {})) {
      if (!Array.isArray(value)) continue;
      value.forEach((entry, index) => {
        const body = typeof entry === 'string' ? entry : String((entry as Record<string, unknown>)?.feedback || (entry as Record<string, unknown>)?.report_info || (entry as Record<string, unknown>)?.summary || JSON.stringify(entry));
        items.push({ key: `${segment.id}:${category}:${index}`, category, body, segmentIndex: segment.segment_index });
      });
    }
  }
  return items;
}

function Rating({ runId, itemKey, dimension, label }: { runId: string; itemKey: string; dimension: string; label: string }) {
  const [value, setValue] = useState<number | null>(null);
  useEffect(() => {
    async function loadRating() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from('feedback_ratings').select(dimension).eq('user_id', user.id).eq('run_id', runId).eq('item_key', itemKey).maybeSingle();
      const existing = data?.[dimension as keyof typeof data];
      setValue(typeof existing === 'number' ? existing : null);
    }
    void loadRating();
  }, [runId, itemKey, dimension]);

  async function rate(next: number) {
    setValue(next);
    await supabase.rpc('set_feedback_rating', { p_run_id: runId, p_item_key: itemKey, p_dimension: dimension, p_value: next });
  }
  return <div className="rating-row"><span>{label}</span><div>{[0, 1, 2, 3, 4].map((score) => <button key={score} className={value === score ? 'selected' : ''} onClick={() => rate(score)}>{score}</button>)}</div></div>;
}

function FeedbackWorkspace({ lecture, onBack }: { lecture: Lecture; onBack: () => void }) {
  const [mode, setMode] = useState<'pre' | 'post'>(lecture.active_post_run_id ? 'post' : 'pre');
  const [segments, setSegments] = useState<FeedbackSegment[]>([]);
  const [images, setImages] = useState<Array<{ mapping: AssetMapping; url: string }>>([]);
  const [active, setActive] = useState(0);
  const runId = mode === 'pre' ? lecture.active_pre_run_id : lecture.active_post_run_id;

  useEffect(() => {
    async function load() {
      if (!runId) { setSegments([]); setImages([]); return; }
      const [feedbackResponse, assetResponse] = await Promise.all([
        supabase.from('feedback_segments').select('*').eq('run_id', runId).order('segment_index'),
        supabase.from('asset_mappings').select('*').eq('run_id', runId).eq('asset_type', 'slide_image').eq('status', 'ready').order('page_number'),
      ]);
      setSegments((feedbackResponse.data || []) as FeedbackSegment[]);
      const mapped = await Promise.all(((assetResponse.data || []) as AssetMapping[]).map(async (mapping) => ({
        mapping,
        url: await resolveAssetUrl(mapping.id, mapping.object_key),
      })));
      setImages(mapped); setActive(0);
    }
    void load();
    const refresh = window.setInterval(() => void load(), 8 * 60 * 1000);
    return () => window.clearInterval(refresh);
  }, [runId]);

  const items = flattenFeedback(segments);
  const current = items[active];
  const image = images[Math.min(current?.segmentIndex || 0, Math.max(images.length - 1, 0))];

  return (
    <div className="workspace-shell">
      <header className="app-header"><div className="workspace-brand"><button className="icon-button" onClick={onBack}><ArrowLeft size={19} /></button><Logo /><span className="header-divider" /><strong>{lecture.display_name}</strong></div><button className="icon-button" onClick={() => supabase.auth.signOut()}><LogOut size={18} /></button></header>
      <div className="workspace-toolbar"><div className="mode-switch"><button className={mode === 'pre' ? 'active' : ''} disabled={!lecture.active_pre_run_id} onClick={() => setMode('pre')}>Pre-lecture</button><button className={mode === 'post' ? 'active' : ''} disabled={!lecture.active_post_run_id} onClick={() => setMode('post')}>Post-lecture</button></div><span>{items.length} feedback items</span></div>
      <main className="workspace-grid">
        <aside className="feedback-list"><span className="eyebrow">Feedback queue</span>{items.map((item, index) => <button key={item.key} className={active === index ? 'active' : ''} onClick={() => setActive(index)}><span>{index + 1}</span><div><strong>{item.category.replaceAll('_', ' ')}</strong><p>{item.body}</p></div></button>)}</aside>
        <section className="slide-stage">{image ? <img src={image.url} alt={`Lecture slide ${image.mapping.page_number || ''}`} /> : <div className="empty-slide"><FileText size={36} /><span>No slide image is available yet.</span></div>}</section>
        <aside className="review-panel">{current && runId ? <><span className="category-chip">{current.category.replaceAll('_', ' ')}</span><h2>Feedback review</h2><p className="feedback-copy">{current.body}</p><div className="rating-card"><h3>Rate this feedback</h3><p>0 means not at all; 4 means excellent.</p><Rating runId={runId} itemKey={current.key} dimension="usefulness" label="Usefulness" /><Rating runId={runId} itemKey={current.key} dimension="correctness" label="Correctness" /><Rating runId={runId} itemKey={current.key} dimension="actionability" label="Actionability" /><Rating runId={runId} itemKey={current.key} dimension="course_alignment" label="Course alignment" /><Rating runId={runId} itemKey={current.key} dimension="question_clarity_readability" label="Clarity & readability" /></div></> : <div className="empty-state compact">Feedback will appear here when processing completes.</div>}</aside>
      </main>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>({ kind: 'dashboard' });

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false); });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => { setSession(next); if (!next) setView({ kind: 'dashboard' }); });
    return () => data.subscription.unsubscribe();
  }, []);

  if (loading) return <div className="app-loading"><Logo /><span>Opening your workspace…</span></div>;
  if (!session) return <Login />;
  if (view.kind === 'lecture') return <FeedbackWorkspace lecture={view.lecture} onBack={() => setView({ kind: 'dashboard' })} />;
  return <Dashboard session={session} onOpen={(lecture) => setView({ kind: 'lecture', lecture })} />;
}
