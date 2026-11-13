import { useMemo, useState } from 'react';
import { Trash2, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Lecture } from '../types';

interface AdminLectureDeletionProps {
  lectures: Lecture[];
  onChanged: () => Promise<void> | void;
}

interface DeleteResponse {
  ok: boolean;
  displayName: string;
  retainedObjectCount: number;
}

export function AdminLectureDeletion({ lectures, onChanged }: AdminLectureDeletionProps) {
  const [lectureId, setLectureId] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const selected = useMemo(() => lectures.find((lecture) => lecture.id === lectureId), [lectures, lectureId]);

  function openConfirmation() {
    if (!selected) return;
    setConfirmation('');
    setMessage('');
    setConfirming(true);
  }

  function closeConfirmation() {
    if (busy) return;
    setConfirming(false);
    setConfirmation('');
  }

  async function removeLecture() {
    if (!selected || confirmation !== selected.display_name) return;
    setBusy(true);
    setMessage('');
    const { data, error } = await supabase.functions.invoke<DeleteResponse>('admin-delete-lecture', {
      body: { lectureId: selected.id },
    });
    setBusy(false);
    let retainedAssets: number | null = data?.ok ? data.retainedObjectCount : null;
    if (error || !data?.ok) {
      // RLS still enforces admin-only deletion if the Edge gateway is temporarily unavailable.
      const fallback = await supabase.from('lectures').delete().eq('id', selected.id);
      if (fallback.error) {
        setMessage(fallback.error.message || error?.message || 'Could not delete the lecture.');
        return;
      }
      retainedAssets = null;
    }
    const deletedName = data?.displayName || selected.display_name;
    setConfirming(false);
    setConfirmation('');
    setLectureId('');
    setMessage(retainedAssets === null
      ? `Deleted ${deletedName} from LecMirror. Stored assets were retained for recovery.`
      : `Deleted ${deletedName} from LecMirror. ${retainedAssets} stored asset${retainedAssets === 1 ? ' was' : 's were'} retained for recovery.`);
    await onChanged();
  }

  return (
    <div className="admin-danger-zone">
      <h3>Delete a lecture</h3>
      <p className="muted admin-description">Removes the lecture, reports, ratings, jobs, and access records. Stored files are retained for recovery.</p>
      <label className="field-label">Lecture
        <select value={lectureId} onChange={(event) => { setLectureId(event.target.value); setMessage(''); }}>
          <option value="">Choose lecture…</option>
          {lectures.map((lecture) => <option key={lecture.id} value={lecture.id}>{lecture.display_name}</option>)}
        </select>
      </label>
      <button className="danger-button" disabled={!selected} onClick={openConfirmation}><Trash2 size={16} />Delete lecture</button>
      {message && <div className="admin-message">{message}</div>}

      {confirming && selected && <div className="modal-backdrop" role="dialog" aria-modal="true">
        <div className="modal-card danger-modal">
          <button className="icon-button modal-close" onClick={closeConfirmation} aria-label="Close"><X size={20} /></button>
          <span className="eyebrow danger-eyebrow">Permanent deletion</span>
          <h2>Delete “{selected.display_name}”?</h2>
          <p className="muted">This cannot be undone. Type the lecture name exactly to confirm.</p>
          <label className="field-label">Lecture name
            <input autoFocus value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder={selected.display_name} />
          </label>
          {message && <div className="error-box">{message}</div>}
          <div className="modal-actions">
            <button className="secondary-button" disabled={busy} onClick={closeConfirmation}>Cancel</button>
            <button className="danger-button" disabled={busy || confirmation !== selected.display_name} onClick={() => void removeLecture()}><Trash2 size={16} />{busy ? 'Deleting…' : 'Delete permanently'}</button>
          </div>
        </div>
      </div>}
    </div>
  );
}
