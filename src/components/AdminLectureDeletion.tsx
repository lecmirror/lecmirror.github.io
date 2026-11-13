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
  deletedObjectCount: number;
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
    if (error || !data?.ok) {
      setMessage(error?.message || 'Could not delete the lecture.');
      return;
    }
    const deletedName = data.displayName;
    const deletedAssets = data.deletedObjectCount;
    setConfirming(false);
    setConfirmation('');
    setLectureId('');
    setMessage(`Deleted ${deletedName} and ${deletedAssets} stored asset${deletedAssets === 1 ? '' : 's'}.`);
    await onChanged();
  }

  return (
    <div className="admin-danger-zone">
      <h3>Delete a lecture</h3>
      <p className="muted admin-description">Permanently removes the lecture, reports, ratings, jobs, and its files from the new R2 bucket.</p>
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
