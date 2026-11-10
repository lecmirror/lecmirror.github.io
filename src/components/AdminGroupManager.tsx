import { useEffect, useMemo, useState } from 'react';
import { FolderPlus, Layers3, UserMinus, UserPlus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Lecture, LectureGroup, LectureGroupMember, WorkspaceUser } from '../types';

interface AdminGroupManagerProps {
  groups: LectureGroup[];
  lectures: Lecture[];
  onChanged: () => Promise<void> | void;
}

export function AdminGroupManager({ groups, lectures, onChanged }: AdminGroupManagerProps) {
  const [users, setUsers] = useState<WorkspaceUser[]>([]);
  const [members, setMembers] = useState<LectureGroupMember[]>([]);
  const [newGroupName, setNewGroupName] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedLectureId, setSelectedLectureId] = useState('');
  const [lectureGroupId, setLectureGroupId] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function loadAccessData() {
    const [userResult, memberResult] = await Promise.all([
      supabase.rpc('admin_list_users'),
      supabase.from('lecture_group_members').select('group_id,user_id,created_at'),
    ]);
    if (userResult.error) setMessage(userResult.error.message);
    else setUsers((userResult.data || []) as WorkspaceUser[]);
    if (memberResult.error) setMessage(memberResult.error.message);
    else setMembers((memberResult.data || []) as LectureGroupMember[]);
  }

  useEffect(() => { void loadAccessData(); }, []);

  useEffect(() => {
    if (!groups.length) {
      setSelectedGroupId('');
      return;
    }
    if (!groups.some((group) => group.id === selectedGroupId)) setSelectedGroupId(groups[0].id);
  }, [groups, selectedGroupId]);

  const selectedLecture = lectures.find((lecture) => lecture.id === selectedLectureId);
  useEffect(() => {
    setLectureGroupId(selectedLecture?.group_id || '');
  }, [selectedLecture?.id, selectedLecture?.group_id]);

  const groupMembers = useMemo(
    () => members.filter((member) => member.group_id === selectedGroupId),
    [members, selectedGroupId],
  );
  const groupMemberIds = useMemo(() => new Set(groupMembers.map((member) => member.user_id)), [groupMembers]);
  const availableUsers = users.filter((user) => !groupMemberIds.has(user.user_id));

  async function run(action: () => PromiseLike<{ error: { message: string } | null }>, success: string) {
    setBusy(true);
    setMessage('');
    try {
      const { error } = await action();
      if (error) setMessage(error.message);
      else setMessage(success);
      return !error;
    } finally {
      setBusy(false);
    }
  }

  async function createGroup() {
    const name = newGroupName.trim();
    if (!name) return setMessage('Enter a group name.');
    const ok = await run(
      () => supabase.rpc('admin_create_lecture_group', { p_name: name }),
      `Created “${name}”.`,
    );
    if (ok) {
      setNewGroupName('');
      await onChanged();
    }
  }

  async function addMember() {
    const userId = selectedUserId.trim();
    if (!selectedGroupId || !userId) return setMessage('Choose a group and enter a user UUID.');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
      return setMessage('Enter a valid Supabase user UUID.');
    }
    const user = users.find((item) => item.user_id === userId);
    const ok = await run(
      () => supabase.rpc('admin_add_lecture_group_member', {
        p_group_id: selectedGroupId,
        p_user_id: userId,
      }),
      `${user?.email || userId} can now access this group.`,
    );
    if (ok) {
      setSelectedUserId('');
      await loadAccessData();
    }
  }

  async function removeMember(userId: string) {
    const user = users.find((item) => item.user_id === userId);
    const ok = await run(
      () => supabase.rpc('admin_remove_lecture_group_member', {
        p_group_id: selectedGroupId,
        p_user_id: userId,
      }),
      `${user?.email || 'User'} was removed from this group.`,
    );
    if (ok) await loadAccessData();
  }

  async function assignLecture() {
    if (!selectedLectureId) return setMessage('Choose a lecture.');
    const group = groups.find((item) => item.id === lectureGroupId);
    const ok = await run(
      () => supabase.rpc('admin_set_lecture_group', {
        p_lecture_id: selectedLectureId,
        p_group_id: lectureGroupId || null,
      }),
      lectureGroupId ? `Lecture assigned to “${group?.name}”.` : 'Lecture is now ungrouped.',
    );
    if (ok) await onChanged();
  }

  return (
    <section className="admin-panel group-admin-panel">
      <div className="admin-heading">
        <div><span className="eyebrow">Group access</span><h2>Lecture groups</h2></div>
        <span className="group-count">{groups.length} {groups.length === 1 ? 'group' : 'groups'}</span>
      </div>

      <div className="group-admin-grid">
        <section className="group-admin-column">
          <div className="group-admin-title"><FolderPlus size={18} /><div><h3>Create a group</h3><p>Use a course, cohort, or annotation team name.</p></div></div>
          <div className="inline-form">
            <input value={newGroupName} onChange={(event) => setNewGroupName(event.target.value)} placeholder="e.g. CS101 annotators" maxLength={100} />
            <button className="primary-button" disabled={busy} onClick={() => void createGroup()}>Create</button>
          </div>

          <div className="group-admin-title section-gap"><Layers3 size={18} /><div><h3>Place a lecture</h3><p>Everyone in the selected group receives access.</p></div></div>
          <label className="field-label compact-field">Lecture
            <select value={selectedLectureId} onChange={(event) => setSelectedLectureId(event.target.value)}>
              <option value="">Choose lecture…</option>
              {lectures.map((lecture) => <option key={lecture.id} value={lecture.id}>{lecture.display_name}</option>)}
            </select>
          </label>
          <label className="field-label compact-field">Group
            <select value={lectureGroupId} onChange={(event) => setLectureGroupId(event.target.value)} disabled={!selectedLectureId}>
              <option value="">Ungrouped</option>
              {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
            </select>
          </label>
          <button className="secondary-button group-action" disabled={busy || !selectedLectureId} onClick={() => void assignLecture()}>Save lecture group</button>
        </section>

        <section className="group-admin-column">
          <div className="group-admin-title"><UserPlus size={18} /><div><h3>Manage members</h3><p>Members can see and label every lecture in the group.</p></div></div>
          {groups.length ? <>
            <label className="field-label compact-field">Group
              <select value={selectedGroupId} onChange={(event) => { setSelectedGroupId(event.target.value); setSelectedUserId(''); }}>
                {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
              </select>
            </label>
            <div className="inline-form member-picker">
              <input list="lecmirror-available-users" value={selectedUserId} onChange={(event) => setSelectedUserId(event.target.value)} placeholder="Paste Supabase user UUID" />
              <datalist id="lecmirror-available-users">
                {availableUsers.map((user) => <option key={user.user_id} value={user.user_id}>{user.email} · {user.role}</option>)}
              </datalist>
              <button className="primary-button" disabled={busy || !selectedUserId} onClick={() => void addMember()}>Add</button>
            </div>
            <small className="field-help member-help">Use the same User UUID accepted by “Assign one labeler”; known users are suggested by email.</small>
            <div className="member-list">
              {groupMembers.length ? groupMembers.map((member) => {
                const user = users.find((item) => item.user_id === member.user_id);
                return <div className="member-row" key={`${member.group_id}-${member.user_id}`}><span><strong>{user?.email || member.user_id}</strong><small>{user?.role || 'annotator'}</small></span><button className="icon-button" title="Remove from group" disabled={busy} onClick={() => void removeMember(member.user_id)}><UserMinus size={16} /></button></div>;
              }) : <div className="member-empty">No members yet.</div>}
            </div>
          </> : <div className="member-empty large">Create a group before adding members.</div>}
        </section>
      </div>
      {message && <div className="admin-message">{message}</div>}
    </section>
  );
}
