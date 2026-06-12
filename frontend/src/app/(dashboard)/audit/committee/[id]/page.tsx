'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { auditApi } from '@/lib/api';
import {
  ArrowLeft, Calendar, MapPin, Users, Plus, X, Save, Loader2, Sparkles,
  CheckCircle, ClipboardCheck, FileText, Trash2, Gavel, BookOpen, AlertTriangle, Lock,
  ArrowUp, ArrowDown,
} from 'lucide-react';

const STATUS_COLORS: Record<string, string> = {
  scheduled: 'bg-blue-500/20 text-blue-700 border-blue-500/30',
  in_progress: 'bg-amber-500/20 text-amber-700 border-amber-500/30',
  completed: 'bg-green-500/20 text-green-700 border-green-500/30',
  cancelled: 'bg-zinc-500/20 text-gray-500 border-zinc-500/40',
};

const ITEM_TYPE_COLORS: Record<string, string> = {
  approval: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700',
  discussion: 'border-blue-500/30 bg-blue-500/10 text-blue-700',
  information: 'border-sky-500/30 bg-sky-500/10 text-sky-700',
  executive_session: 'border-purple-500/30 bg-purple-500/10 text-purple-700',
};

export default function MeetingDetailPage() {
  const params = useParams();
  const router = useRouter();
  const meetingId = Number(params?.id);
  const qc = useQueryClient();

  const [showAgenda, setShowAgenda] = useState(false);
  const [showResolution, setShowResolution] = useState(false);
  const [showAction, setShowAction] = useState(false);
  const [agendaForm, setAgendaForm] = useState({
    title: '', description: '', presenter: '', time_allocation_min: 15, item_type: 'discussion',
  });
  const [resForm, setResForm] = useState({
    title: '', resolution_text: '', votes_for: 0, votes_against: 0, votes_abstain: 0, status: 'proposed',
  });
  const [actionForm, setActionForm] = useState({
    title: '', description: '', owner_name: '', due_date: '', priority: 'medium',
  });
  const [minutesDraft, setMinutesDraft] = useState<string | null>(null);
  const [execSummary, setExecSummary] = useState<string | null>(null);
  const [attendeeName, setAttendeeName] = useState('');
  const [showPreRead, setShowPreRead] = useState(false);
  const [preReadForm, setPreReadForm] = useState<{ title: string; description: string; document_url: string; file_path: string; recipient_member_ids: number[] }>({
    title: '', description: '', document_url: '', file_path: '', recipient_member_ids: [],
  });
  const [aiNotesInput, setAiNotesInput] = useState('');
  const [aiSections, setAiSections] = useState<any>(null);
  const [aiMessage, setAiMessage] = useState<string>('');

  const { data: meeting, isLoading } = useQuery({
    queryKey: ['committee', 'meeting', meetingId],
    queryFn: () => auditApi.committee.getMeeting(meetingId).then(r => r.data),
    enabled: !!meetingId,
  });

  const refreshMeeting = () => qc.invalidateQueries({ queryKey: ['committee', 'meeting', meetingId] });

  const updateMeeting = useMutation({
    mutationFn: (data: any) => auditApi.committee.updateMeeting(meetingId, data),
    onSuccess: refreshMeeting,
  });

  const addAgenda = useMutation({
    mutationFn: (data: any) => auditApi.committee.addAgenda(meetingId, data),
    onSuccess: () => { refreshMeeting(); setShowAgenda(false); setAgendaForm({ title: '', description: '', presenter: '', time_allocation_min: 15, item_type: 'discussion' }); },
  });
  const updateAgenda = useMutation({
    mutationFn: ({ aid, data }: any) => auditApi.committee.updateAgenda(aid, data),
    onSuccess: refreshMeeting,
  });
  const deleteAgenda = useMutation({
    mutationFn: (aid: number) => auditApi.committee.deleteAgenda(aid),
    onSuccess: refreshMeeting,
  });

  const addResolution = useMutation({
    mutationFn: (data: any) => auditApi.committee.addResolution(meetingId, data),
    onSuccess: () => { refreshMeeting(); setShowResolution(false); setResForm({ title: '', resolution_text: '', votes_for: 0, votes_against: 0, votes_abstain: 0, status: 'proposed' }); },
  });

  const addAction = useMutation({
    mutationFn: (data: any) => auditApi.committee.addAction(meetingId, data),
    onSuccess: () => { refreshMeeting(); setShowAction(false); setActionForm({ title: '', description: '', owner_name: '', due_date: '', priority: 'medium' }); },
  });
  const updateAction = useMutation({
    mutationFn: ({ aid, data }: any) => auditApi.committee.updateAction(aid, data),
    onSuccess: refreshMeeting,
  });

  const aiAgenda = useMutation({
    mutationFn: () => auditApi.committee.aiAgenda(meetingId, { meeting_type: meeting?.meeting_type || 'regular' }),
    onSuccess: async (res) => {
      const items = res.data?.items || [];
      for (const it of items) {
        await auditApi.committee.addAgenda(meetingId, it);
      }
      refreshMeeting();
    },
  });

  const aiMinutes = useMutation({
    mutationFn: () => auditApi.committee.aiMinutes(meetingId, { raw_notes: aiNotesInput }),
    onSuccess: (res) => {
      setMinutesDraft(res.data?.minutes || '');
      setExecSummary(res.data?.executive_summary || '');
      setAiSections(res.data?.sections || null);
      setAiMessage(res.data?.message || '');
    },
  });

  const saveMinutes = useMutation({
    mutationFn: () => auditApi.committee.updateMeeting(meetingId, {
      minutes: minutesDraft || meeting?.minutes,
      executive_summary: execSummary || meeting?.executive_summary,
    }),
    onSuccess: () => { refreshMeeting(); alert('Minutes saved.'); },
  });

  const approveMinutes = useMutation({
    mutationFn: () => auditApi.committee.approveMinutes(meetingId),
    onSuccess: refreshMeeting,
  });

  const addPreRead = useMutation({
    mutationFn: (data: any) => auditApi.committee.addPreRead(meetingId, data),
    onSuccess: () => { refreshMeeting(); setShowPreRead(false); setPreReadForm({ title: '', description: '', document_url: '', file_path: '', recipient_member_ids: [] }); },
  });
  const uploadPreRead = useMutation({
    mutationFn: ({ file, meta }: { file: File; meta: any }) => auditApi.committee.uploadPreRead(meetingId, file, meta),
    onSuccess: () => { refreshMeeting(); setShowPreRead(false); setPreReadForm({ title: '', description: '', document_url: '', file_path: '', recipient_member_ids: [] }); },
  });
  const deletePreRead = useMutation({
    mutationFn: (pid: number) => auditApi.committee.deletePreRead(pid),
    onSuccess: refreshMeeting,
  });
  const acknowledge = useMutation({
    mutationFn: (signature: string) => auditApi.committee.acknowledge(meetingId, { signature_text: signature, notes: 'Pre-read materials reviewed.' }),
    onSuccess: refreshMeeting,
  });

  const addAttendee = () => {
    if (!attendeeName.trim()) return;
    const list = Array.isArray(meeting?.attendees) ? [...meeting.attendees] : [];
    list.push({ name: attendeeName.trim(), present: true, added_at: new Date().toISOString() });
    updateMeeting.mutate({ attendees: list });
    setAttendeeName('');
  };
  const removeAttendee = (i: number) => {
    const list = Array.isArray(meeting?.attendees) ? [...meeting.attendees] : [];
    list.splice(i, 1);
    updateMeeting.mutate({ attendees: list });
  };
  const toggleAttendee = (i: number) => {
    const list = Array.isArray(meeting?.attendees) ? [...meeting.attendees] : [];
    if (list[i]) list[i] = { ...list[i], present: !list[i].present };
    updateMeeting.mutate({ attendees: list });
  };

  if (isLoading || !meeting) {
    return (
      <div className="flex h-96 items-center justify-center text-gray-500">
        <Loader2 className="animate-spin" /> <span className="ml-2">Loading meeting…</span>
      </div>
    );
  }

  return (
    <div className="space-y-5 p-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Gavel size={20} className="text-amber-500" />
            <h1 className="text-xl font-semibold text-gray-900">{meeting.title}</h1>
            <span className={`rounded-md border px-2 py-0.5 text-[11px] font-medium ${STATUS_COLORS[meeting.status] || 'border-gray-200 bg-gray-100 text-gray-600'}`}>
              {meeting.status}
            </span>
            {meeting.minutes_approved && (
              <span className="inline-flex items-center gap-1 rounded-md border border-green-500/30 bg-green-500/10 px-2 py-0.5 text-[11px] text-green-700">
                <CheckCircle size={11} /> Minutes approved
              </span>
            )}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-gray-500">
            <span className="inline-flex items-center gap-1"><Calendar size={12} />
              {meeting.scheduled_at ? new Date(meeting.scheduled_at).toLocaleString() : 'Not scheduled'}
            </span>
            {meeting.location && <span className="inline-flex items-center gap-1"><MapPin size={12} /> {meeting.location}</span>}
            <span className="inline-flex items-center gap-1"><Users size={12} /> Chair: {meeting.chair_name || '—'}</span>
            <span className="capitalize">Type: {meeting.meeting_type}</span>
            {meeting.meeting_type === 'executive_session' && (
              <span className="inline-flex items-center gap-1 rounded-md border border-purple-500/40 bg-purple-500/10 px-2 py-0.5 text-[11px] text-purple-700">
                <Lock size={11} /> Executive session
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <select
            value={meeting.status}
            onChange={e => updateMeeting.mutate({ status: e.target.value })}
            className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-900"
          >
            <option value="scheduled">Scheduled</option>
            <option value="in_progress">In progress</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <label className="inline-flex items-center gap-1 text-[11px] text-gray-500">
            <input
              type="checkbox"
              checked={meeting.meeting_type === 'executive_session'}
              onChange={e => updateMeeting.mutate({ meeting_type: e.target.checked ? 'executive_session' : 'regular' })}
            />
            Executive session
          </label>
        </div>
      </div>

      {/* Attendees */}
      <Section
        title={`Attendees (${(meeting.attendees || []).length})`}
        icon={<Users size={16} className="text-blue-500" />}
        actions={null}
      >
        <div className="space-y-2">
          {(meeting.attendees || []).length === 0 ? (
            <Empty msg="No attendees recorded yet." />
          ) : (
            <ul className="space-y-1">
              {(meeting.attendees as any[]).map((att: any, i: number) => (
                <li key={i} className="flex items-center justify-between rounded-md border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={att.present !== false}
                      onChange={() => toggleAttendee(i)}
                    />
                    <span className={att.present === false ? 'text-gray-400 line-through' : 'text-gray-900'}>
                      {att.name || att.email || 'Unnamed'}
                    </span>
                    {att.role && <span className="text-[11px] text-gray-400">· {att.role}</span>}
                  </label>
                  <button onClick={() => removeAttendee(i)} className="text-gray-400 hover:text-red-600">
                    <Trash2 size={13} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <input
              value={attendeeName}
              onChange={e => setAttendeeName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addAttendee(); }}
              placeholder="Add attendee name…"
              className="flex-1 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-900"
            />
            <button onClick={addAttendee} className="inline-flex items-center gap-1 rounded-md bg-amber-500/20 px-3 py-1.5 text-xs text-amber-700 hover:bg-amber-500/30">
              <Plus size={12} /> Add
            </button>
          </div>
          <div className="text-[11px] text-gray-400">
            Quorum: {meeting.attendees?.filter?.((a: any) => a.present !== false)?.length || 0} present
            {meeting.quorum_met ? ' · quorum met' : ''}
          </div>
        </div>
      </Section>

      {/* Pre-reads & acknowledgments */}
      <Section
        title="Pre-read distribution"
        icon={<BookOpen size={16} className="text-blue-500" />}
        actions={
          <div className="flex gap-2">
            <button
              onClick={() => {
                const sig = prompt('I confirm I have reviewed the pre-read materials. Type your full name:');
                if (sig && sig.trim()) acknowledge.mutate(sig.trim());
              }}
              className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-500/20"
            >
              <CheckCircle size={12} /> Acknowledge & sign
            </button>
            <button onClick={() => setShowPreRead(true)} className="inline-flex items-center gap-1 rounded-md bg-amber-500/20 px-2 py-1 text-xs text-amber-700 hover:bg-amber-500/30">
              <Plus size={12} /> Pre-read
            </button>
          </div>
        }
      >
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div>
            <div className="mb-2 text-xs uppercase tracking-wide text-gray-500">Documents</div>
            {(meeting.pre_reads || []).length === 0 ? (
              <Empty msg="No pre-reads distributed." />
            ) : (
              <ul className="space-y-2">
                {meeting.pre_reads.map((p: any) => {
                  const recipientIds: number[] = p.recipient_member_ids || [];
                  const ackByMember: Record<number, any> = {};
                  (meeting.acknowledgments || []).forEach((a: any) => { if (a.member_id) ackByMember[a.member_id] = a; });
                  const recipients = recipientIds.length > 0
                    ? recipientIds.map(id => {
                        const att = (meeting.attendees || []).find((x: any) => x.member_id === id || x.id === id);
                        return { id, name: att?.name || `Member #${id}`, ack: ackByMember[id] };
                      })
                    : [];
                  const acked = recipients.filter(r => r.ack).length;
                  const overdue = recipientIds.length > 0 && acked < recipientIds.length && meeting.status === 'scheduled';
                  return (
                    <li key={p.id} className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
                      <div className="flex items-start justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-gray-900">{p.title}</div>
                          {p.description && <div className="text-xs text-gray-500">{p.description}</div>}
                          <div className="mt-1 flex flex-wrap gap-2 text-[11px]">
                            {p.document_url && (
                              <a href={p.document_url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">URL ↗</a>
                            )}
                            {p.file_path && (
                              <span className="text-gray-500">File: <span className="text-gray-600">{p.file_path}</span></span>
                            )}
                            {recipientIds.length > 0 && (
                              <span className={`inline-flex items-center gap-1 rounded px-1.5 ${overdue ? 'bg-amber-500/15 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>
                                {acked}/{recipientIds.length} acknowledged{overdue ? ` · ${recipientIds.length - acked} overdue` : ''}
                              </span>
                            )}
                          </div>
                        </div>
                        <button onClick={() => deletePreRead.mutate(p.id)} className="text-gray-400 hover:text-red-600">
                          <Trash2 size={13} />
                        </button>
                      </div>
                      {recipients.length > 0 && (
                        <div className="mt-2 grid grid-cols-2 gap-1 border-t border-gray-200 pt-2 text-[11px]">
                          {recipients.map(r => (
                            <div key={r.id} className="flex items-center justify-between gap-2 rounded bg-gray-50 px-2 py-1">
                              <span className="truncate text-gray-600">{r.name}</span>
                              {r.ack ? (
                                <span className="inline-flex items-center gap-1 text-emerald-500">
                                  <CheckCircle size={11} /> {r.ack.acknowledged_at ? new Date(r.ack.acknowledged_at).toLocaleDateString() : 'signed'}
                                </span>
                              ) : (
                                <span className="text-amber-500">Pending</span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-wide text-gray-500">
              <span>Acknowledgments ({(meeting.acknowledgments || []).length})</span>
              {(() => {
                const presentCount = (meeting.attendees || []).filter((a: any) => a.present !== false).length;
                const ackCount = (meeting.acknowledgments || []).length;
                const overdue = presentCount > ackCount && meeting.status === 'scheduled';
                return overdue ? (
                  <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-700">
                    <AlertTriangle size={10} /> {presentCount - ackCount} overdue
                  </span>
                ) : null;
              })()}
            </div>
            {(meeting.acknowledgments || []).length === 0 ? (
              <Empty msg="No acknowledgments recorded yet." />
            ) : (
              <ul className="space-y-1">
                {meeting.acknowledgments.map((a: any) => (
                  <li key={a.id} className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-900">{a.member_name || `Member #${a.member_id}`}</span>
                      <span className="text-[11px] text-gray-400">
                        {a.acknowledged_at ? new Date(a.acknowledged_at).toLocaleString() : ''}
                      </span>
                    </div>
                    {a.signature_text && (
                      <div className="text-[11px] text-gray-400">Signed: <span className="text-gray-600">{a.signature_text}</span></div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Section>

      {/* Agenda */}
      <Section
        title="Agenda"
        icon={<FileText size={16} className="text-blue-500" />}
        actions={
          <div className="flex gap-2">
            <button
              onClick={() => aiAgenda.mutate()}
              disabled={aiAgenda.isPending}
              className="inline-flex items-center gap-1 rounded-md border border-purple-500/40 bg-purple-500/10 px-2 py-1 text-xs text-purple-700 hover:bg-purple-500/20"
            >
              {aiAgenda.isPending ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
              AI suggest
            </button>
            <button onClick={() => setShowAgenda(true)} className="inline-flex items-center gap-1 rounded-md bg-amber-500/20 px-2 py-1 text-xs text-amber-700 hover:bg-amber-500/30">
              <Plus size={12} /> Item
            </button>
          </div>
        }
      >
        {(meeting.agenda_items || []).length === 0 ? (
          <Empty msg="No agenda items yet — add manually or use AI suggest." />
        ) : (
          <ol className="space-y-2">
            {meeting.agenda_items.map((a: any, i: number) => (
              <li key={a.id} className="rounded-md border border-gray-200 bg-gray-50 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400">{i + 1}.</span>
                      <span className="font-medium text-gray-900">{a.title}</span>
                      <span className={`rounded-md border px-1.5 py-0.5 text-[10px] uppercase ${ITEM_TYPE_COLORS[a.item_type] || 'border-gray-200 text-gray-500'}`}>
                        {(a.item_type || '').replace('_', ' ')}
                      </span>
                      {a.time_allocation_min ? <span className="text-[10px] text-gray-400">{a.time_allocation_min}m</span> : null}
                    </div>
                    {a.description && <div className="mt-1 text-xs text-gray-500">{a.description}</div>}
                    {a.presenter && <div className="mt-1 text-[11px] text-gray-400">Presenter: {a.presenter}</div>}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      disabled={i === 0}
                      onClick={() => {
                        const prev = meeting.agenda_items[i - 1];
                        const aOrder = a.order_no ?? i;
                        const pOrder = prev.order_no ?? (i - 1);
                        updateAgenda.mutate({ aid: a.id, data: { order_no: pOrder } });
                        updateAgenda.mutate({ aid: prev.id, data: { order_no: aOrder } });
                      }}
                      className="text-gray-400 hover:text-amber-600 disabled:opacity-30"
                      title="Move up"
                    >
                      <ArrowUp size={13} />
                    </button>
                    <button
                      disabled={i === meeting.agenda_items.length - 1}
                      onClick={() => {
                        const next = meeting.agenda_items[i + 1];
                        const aOrder = a.order_no ?? i;
                        const nOrder = next.order_no ?? (i + 1);
                        updateAgenda.mutate({ aid: a.id, data: { order_no: nOrder } });
                        updateAgenda.mutate({ aid: next.id, data: { order_no: aOrder } });
                      }}
                      className="text-gray-400 hover:text-amber-600 disabled:opacity-30"
                      title="Move down"
                    >
                      <ArrowDown size={13} />
                    </button>
                    <button onClick={() => deleteAgenda.mutate(a.id)} className="text-gray-400 hover:text-red-600">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Section>

      {/* Resolutions */}
      <Section
        title="Resolutions"
        icon={<CheckCircle size={16} className="text-emerald-500" />}
        actions={
          <button onClick={() => setShowResolution(true)} className="inline-flex items-center gap-1 rounded-md bg-amber-500/20 px-2 py-1 text-xs text-amber-700 hover:bg-amber-500/30">
            <Plus size={12} /> Resolution
          </button>
        }
      >
        {(meeting.resolutions || []).length === 0 ? (
          <Empty msg="No resolutions recorded." />
        ) : (
          <div className="space-y-2">
            {meeting.resolutions.map((r: any) => (
              <div key={r.id} className="rounded-md border border-gray-200 bg-gray-50 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-medium text-gray-900">{r.title}</div>
                    {r.resolution_text && <div className="mt-1 text-sm text-gray-600">{r.resolution_text}</div>}
                  </div>
                  <span className="rounded-md border border-gray-200 bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600 capitalize">
                    {r.status}
                  </span>
                </div>
                {(() => {
                  const f = Number(r.votes_for) || 0;
                  const a = Number(r.votes_against) || 0;
                  const b = Number(r.votes_abstain) || 0;
                  const t = f + a + b;
                  const pct = (n: number) => (t > 0 ? (n / t) * 100 : 0);
                  return (
                    <div className="mt-3 space-y-2">
                      <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
                        {f > 0 && <div className="h-full bg-emerald-400/90" style={{ width: `${pct(f)}%` }} />}
                        {a > 0 && <div className="h-full bg-rose-400/90" style={{ width: `${pct(a)}%` }} />}
                        {b > 0 && <div className="h-full bg-slate-400/70" style={{ width: `${pct(b)}%` }} />}
                      </div>
                      <div className="flex gap-4 text-[11px] text-gray-500">
                        <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />For <span className="text-emerald-700 font-medium">{f}</span></span>
                        <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-rose-400" />Against <span className="text-rose-700 font-medium">{a}</span></span>
                        <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-slate-400" />Abstain <span className="text-gray-600 font-medium">{b}</span></span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Actions */}
      <Section
        title="Action Items"
        icon={<ClipboardCheck size={16} className="text-amber-500" />}
        actions={
          <button onClick={() => setShowAction(true)} className="inline-flex items-center gap-1 rounded-md bg-amber-500/20 px-2 py-1 text-xs text-amber-700 hover:bg-amber-500/30">
            <Plus size={12} /> Action
          </button>
        }
      >
        {(meeting.action_items || []).length === 0 ? (
          <Empty msg="No action items." />
        ) : (
          <div className="space-y-2">
            {meeting.action_items.map((a: any) => (
              <div key={a.id} className="flex items-center justify-between rounded-md bg-gray-50 p-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900">{a.title}</span>
                    <span className="rounded-md bg-gray-200 px-1.5 py-0.5 text-[10px] text-gray-700">{a.priority}</span>
                  </div>
                  <div className="mt-1 text-xs text-gray-500">
                    {a.owner_name || 'Unassigned'} · due {a.due_date ? new Date(a.due_date).toLocaleDateString() : 'TBD'}
                  </div>
                </div>
                <select
                  value={a.status}
                  onChange={e => updateAction.mutate({ aid: a.id, data: { status: e.target.value } })}
                  className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900"
                >
                  <option value="open">Open</option>
                  <option value="in_progress">In progress</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Minutes */}
      <Section
        title="Minutes"
        icon={<FileText size={16} className="text-purple-500" />}
        actions={
          <div className="flex gap-2">
            <button
              onClick={() => aiMinutes.mutate()}
              disabled={aiMinutes.isPending}
              className="inline-flex items-center gap-1 rounded-md border border-purple-500/40 bg-purple-500/10 px-2 py-1 text-xs text-purple-700 hover:bg-purple-500/20"
            >
              {aiMinutes.isPending ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
              AI draft
            </button>
            <button
              onClick={() => saveMinutes.mutate()}
              disabled={saveMinutes.isPending}
              className="inline-flex items-center gap-1 rounded-md bg-amber-500/20 px-2 py-1 text-xs text-amber-700 hover:bg-amber-500/30"
            >
              <Save size={12} /> Save
            </button>
            {!meeting.minutes_approved && (
              <button
                onClick={() => approveMinutes.mutate()}
                disabled={approveMinutes.isPending}
                className="inline-flex items-center gap-1 rounded-md bg-green-500/20 px-2 py-1 text-xs text-green-700 hover:bg-green-500/30"
              >
                <CheckCircle size={12} /> Approve minutes
              </button>
            )}
          </div>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">
              Secretary&apos;s raw discussion notes (input for AI drafter)
            </label>
            <textarea
              rows={4}
              value={aiNotesInput}
              onChange={e => setAiNotesInput(e.target.value)}
              placeholder="Paste rough notes from the meeting (bullets, fragments, decisions, who-said-what). The AI drafter will structure these into Discussion / Decisions / Action Items / Resolutions."
              className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-xs text-gray-900"
            />
          </div>
          {aiMessage && (
            <div className={`rounded-md border px-3 py-2 text-xs ${aiSections ? 'border-purple-500/40 bg-purple-500/10 text-purple-700' : 'border-amber-500/40 bg-amber-500/10 text-amber-700'}`}>
              {aiMessage}
            </div>
          )}
          {aiSections && (
            <div className="grid grid-cols-2 gap-2">
              {(['discussion', 'decisions', 'action_items', 'resolutions'] as const).map(key => (
                <div key={key} className="rounded-md border border-gray-200 bg-gray-50 p-2">
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">{key.replace('_', ' ')}</div>
                  <textarea
                    rows={5}
                    value={aiSections[key] || ''}
                    onChange={e => {
                      const next = { ...aiSections, [key]: e.target.value };
                      setAiSections(next);
                      const reassembled = `# Minutes — ${meeting.title}\n\n## Discussion\n${next.discussion || ''}\n\n## Decisions\n${next.decisions || ''}\n\n## Action Items\n${next.action_items || ''}\n\n## Resolutions\n${next.resolutions || ''}\n`;
                      setMinutesDraft(reassembled);
                    }}
                    className="w-full rounded border border-gray-200 bg-white px-2 py-1 font-mono text-[11px] text-gray-900"
                  />
                </div>
              ))}
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Executive summary</label>
            <textarea
              rows={3}
              value={execSummary ?? meeting.executive_summary ?? ''}
              onChange={e => setExecSummary(e.target.value)}
              className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Assembled minutes (markdown)</label>
            <textarea
              rows={12}
              value={minutesDraft ?? meeting.minutes ?? ''}
              onChange={e => setMinutesDraft(e.target.value)}
              className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 font-mono text-xs text-gray-900"
              placeholder="Paste raw notes above and click 'AI draft', or write directly..."
            />
          </div>
        </div>
      </Section>

      {/* Modals */}
      {showAgenda && (
        <Modal title="Add Agenda Item" onClose={() => setShowAgenda(false)}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Title *" full>
              <input className={inputCls} value={agendaForm.title} onChange={e => setAgendaForm({ ...agendaForm, title: e.target.value })} />
            </Field>
            <Field label="Type">
              <select className={inputCls} value={agendaForm.item_type} onChange={e => setAgendaForm({ ...agendaForm, item_type: e.target.value })}>
                <option value="discussion">Discussion</option>
                <option value="approval">Approval</option>
                <option value="information">Information</option>
                <option value="executive_session">Executive session</option>
              </select>
            </Field>
            <Field label="Time (min)">
              <input type="number" min={1} className={inputCls} value={agendaForm.time_allocation_min} onChange={e => setAgendaForm({ ...agendaForm, time_allocation_min: Number(e.target.value) })} />
            </Field>
            <Field label="Presenter" full>
              <input className={inputCls} value={agendaForm.presenter} onChange={e => setAgendaForm({ ...agendaForm, presenter: e.target.value })} />
            </Field>
            <Field label="Description" full>
              <textarea rows={3} className={inputCls} value={agendaForm.description} onChange={e => setAgendaForm({ ...agendaForm, description: e.target.value })} />
            </Field>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => setShowAgenda(false)} className={btnSecondary}>Cancel</button>
            <button disabled={!agendaForm.title || addAgenda.isPending} onClick={() => addAgenda.mutate(agendaForm)} className={btnPrimary}>Add</button>
          </div>
        </Modal>
      )}

      {showResolution && (
        <Modal title="Add Resolution" onClose={() => setShowResolution(false)}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Title *" full>
              <input className={inputCls} value={resForm.title} onChange={e => setResForm({ ...resForm, title: e.target.value })} />
            </Field>
            <Field label="Resolution text" full>
              <textarea rows={3} className={inputCls} value={resForm.resolution_text} onChange={e => setResForm({ ...resForm, resolution_text: e.target.value })} />
            </Field>
            <Field label="For"><input type="number" min={0} className={inputCls} value={resForm.votes_for} onChange={e => setResForm({ ...resForm, votes_for: Number(e.target.value) })} /></Field>
            <Field label="Against"><input type="number" min={0} className={inputCls} value={resForm.votes_against} onChange={e => setResForm({ ...resForm, votes_against: Number(e.target.value) })} /></Field>
            <Field label="Abstain"><input type="number" min={0} className={inputCls} value={resForm.votes_abstain} onChange={e => setResForm({ ...resForm, votes_abstain: Number(e.target.value) })} /></Field>
            <Field label="Status">
              <select className={inputCls} value={resForm.status} onChange={e => setResForm({ ...resForm, status: e.target.value })}>
                <option value="proposed">Proposed</option>
                <option value="passed">Passed</option>
                <option value="rejected">Rejected</option>
                <option value="deferred">Deferred</option>
              </select>
            </Field>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => setShowResolution(false)} className={btnSecondary}>Cancel</button>
            <button disabled={!resForm.title || addResolution.isPending} onClick={() => addResolution.mutate(resForm)} className={btnPrimary}>Add</button>
          </div>
        </Modal>
      )}

      {showPreRead && (
        <Modal title="Distribute Pre-read" onClose={() => setShowPreRead(false)}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Title *" full>
              <input className={inputCls} value={preReadForm.title} onChange={e => setPreReadForm({ ...preReadForm, title: e.target.value })} />
            </Field>
            <Field label="Description" full>
              <textarea rows={3} className={inputCls} value={preReadForm.description} onChange={e => setPreReadForm({ ...preReadForm, description: e.target.value })} />
            </Field>
            <Field label="Document URL">
              <input className={inputCls} placeholder="https://…" value={preReadForm.document_url} onChange={e => setPreReadForm({ ...preReadForm, document_url: e.target.value })} />
            </Field>
            <Field label="Upload document file">
              <input
                type="file"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md"
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  uploadPreRead.mutate({
                    file: f,
                    meta: {
                      title: preReadForm.title || f.name,
                      description: preReadForm.description,
                      recipient_member_ids: preReadForm.recipient_member_ids,
                    },
                  });
                }}
                disabled={uploadPreRead.isPending}
                className="w-full text-xs text-gray-600 file:mr-2 file:rounded file:border file:border-gray-200 file:bg-white file:px-2 file:py-1 file:text-xs file:text-gray-600"
              />
              {uploadPreRead.isPending && <div className="mt-1 text-[11px] text-amber-700">Uploading…</div>}
            </Field>
            <Field label={`Distribute to recipients (${preReadForm.recipient_member_ids.length} selected)`} full>
              <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-gray-200 bg-white p-2">
                {(meeting.attendees || []).length === 0 && (
                  <div className="text-xs text-gray-400">Add attendees first to target recipients.</div>
                )}
                {(meeting.attendees || []).map((att: any, i: number) => {
                  const id = att.member_id ?? att.id ?? i;
                  const checked = preReadForm.recipient_member_ids.includes(id);
                  return (
                    <label key={`${id}-${i}`} className="flex items-center gap-2 text-xs text-gray-600">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={e => {
                          const next = e.target.checked
                            ? [...preReadForm.recipient_member_ids, id]
                            : preReadForm.recipient_member_ids.filter(x => x !== id);
                          setPreReadForm({ ...preReadForm, recipient_member_ids: next });
                        }}
                      />
                      {att.name || `Member #${id}`}
                    </label>
                  );
                })}
              </div>
            </Field>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => setShowPreRead(false)} className={btnSecondary}>Cancel</button>
            <button disabled={!preReadForm.title || addPreRead.isPending} onClick={() => addPreRead.mutate(preReadForm)} className={btnPrimary}>Distribute</button>
          </div>
        </Modal>
      )}

      {showAction && (
        <Modal title="Add Action Item" onClose={() => setShowAction(false)}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Title *" full>
              <input className={inputCls} value={actionForm.title} onChange={e => setActionForm({ ...actionForm, title: e.target.value })} />
            </Field>
            <Field label="Owner">
              <input className={inputCls} value={actionForm.owner_name} onChange={e => setActionForm({ ...actionForm, owner_name: e.target.value })} />
            </Field>
            <Field label="Due date">
              <input type="date" className={inputCls} value={actionForm.due_date} onChange={e => setActionForm({ ...actionForm, due_date: e.target.value })} />
            </Field>
            <Field label="Priority">
              <select className={inputCls} value={actionForm.priority} onChange={e => setActionForm({ ...actionForm, priority: e.target.value })}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </Field>
            <Field label="Description" full>
              <textarea rows={3} className={inputCls} value={actionForm.description} onChange={e => setActionForm({ ...actionForm, description: e.target.value })} />
            </Field>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => setShowAction(false)} className={btnSecondary}>Cancel</button>
            <button
              disabled={!actionForm.title || addAction.isPending}
              onClick={() => {
                const payload: any = { ...actionForm };
                if (!payload.due_date) delete payload.due_date; else payload.due_date = new Date(payload.due_date).toISOString();
                addAction.mutate(payload);
              }}
              className={btnPrimary}
            >Add</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

const inputCls = 'w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-amber-400 focus:outline-none';
const btnPrimary = 'rounded-md bg-amber-500/20 px-4 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-500/30 disabled:opacity-40';
const btnSecondary = 'rounded-md border border-gray-200 bg-white px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-50';

function Section({ title, icon, actions, children }: any) {
  return (
    <div className="rounded-lg bg-white">
      <div className="flex items-center justify-between p-3">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-900">{icon} {title}</div>
        <div>{actions}</div>
      </div>
      <div className="p-4 pt-0">{children}</div>
    </div>
  );
}

function Empty({ msg }: any) {
  return <div className="rounded-md border border-dashed border-gray-200 p-4 text-center text-xs text-gray-400">{msg}</div>;
}

function Field({ label, children, full = false }: any) {
  return (
    <div className={full ? 'col-span-2' : ''}>
      <label className="mb-1 block text-xs font-medium text-gray-500">{label}</label>
      {children}
    </div>
  );
}

function Modal({ title, children, onClose }: any) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-2xl rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between px-5 py-3">
          <h3 className="text-sm font-medium text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-900"><X size={16} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
