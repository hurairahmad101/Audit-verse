'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { auditApi } from '@/lib/api';
import {
  Gavel, Users, Calendar, ClipboardCheck, AlertCircle, Plus, X,
  CheckCircle, Clock, ChevronRight, Loader2, Save, Edit2, Trash2,
  ShieldCheck, Briefcase, FileCheck, ArrowRight, FileText, ChevronLeft, List, Grid3x3,
} from 'lucide-react';

type TabKey = 'overview' | 'members' | 'meetings' | 'approvals' | 'settings';

const STATUS_COLORS: Record<string, string> = {
  scheduled: 'bg-blue-500/20 text-blue-700 border-blue-500/30',
  in_progress: 'bg-amber-500/20 text-amber-700 border-amber-500/30',
  completed: 'bg-green-500/20 text-green-700 border-green-500/30',
  cancelled: 'bg-zinc-500/20 text-gray-500 border-zinc-500/40',
  requested: 'bg-blue-500/20 text-blue-700 border-blue-500/30',
  in_review: 'bg-amber-500/20 text-amber-700 border-amber-500/30',
  approved: 'bg-green-500/20 text-green-700 border-green-500/30',
  rejected: 'bg-red-500/20 text-red-700 border-red-500/30',
  withdrawn: 'bg-zinc-500/20 text-gray-500 border-zinc-500/40',
};

function StatCard({ icon: Icon, label, value, sub, accent = 'text-blue-400' }: any) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wider text-gray-500">{label}</span>
        <Icon size={16} className={accent} />
      </div>
      <div className="mt-2 text-2xl font-semibold text-gray-900">{value}</div>
      {sub && <div className="mt-1 text-xs text-gray-400">{sub}</div>}
    </div>
  );
}

function Pill({ children, className = '' }: any) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium ${className}`}>
      {children}
    </span>
  );
}

export default function CommitteePage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<TabKey>('overview');
  const [showMember, setShowMember] = useState(false);
  const [showMeeting, setShowMeeting] = useState(false);
  const [meetingsView, setMeetingsView] = useState<'list' | 'calendar'>('list');
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [showSettings, setShowSettings] = useState(false);
  const [reviewApproval, setReviewApproval] = useState<any>(null);
  const [reviewCtx, setReviewCtx] = useState<any>(null);
  const [reviewLoading, setReviewLoading] = useState(false);

  React.useEffect(() => {
    if (!reviewApproval) { setReviewCtx(null); return; }
    setReviewLoading(true);
    auditApi.committee.approvalReviewContext(reviewApproval.id)
      .then(r => setReviewCtx(r.data))
      .catch(() => setReviewCtx({ error: 'Failed to load artifact snapshot.' }))
      .finally(() => setReviewLoading(false));
  }, [reviewApproval]);
  const [editMember, setEditMember] = useState<any>(null);
  const [memberForm, setMemberForm] = useState({
    name: '', email: '', role: 'member', independence_status: 'independent',
    is_financial_expert: false, term_start: '', term_end: '', bio: '',
  });
  const [meetingForm, setMeetingForm] = useState({
    title: '', meeting_type: 'regular', scheduled_at: '', location: '',
  });
  const [settingsForm, setSettingsForm] = useState<any>(null);

  const { data: committee, isLoading: loadingCommittee } = useQuery({
    queryKey: ['committee', 'primary'],
    queryFn: () => auditApi.committee.getPrimary().then(r => r.data),
  });

  const committeeId = committee?.id;

  const { data: stats } = useQuery({
    queryKey: ['committee', committeeId, 'stats'],
    queryFn: () => auditApi.committee.stats(committeeId!).then(r => r.data),
    enabled: !!committeeId,
  });

  const { data: meetingsData } = useQuery({
    queryKey: ['committee', committeeId, 'meetings'],
    queryFn: () => auditApi.committee.listMeetings(committeeId!).then(r => r.data?.meetings || []),
    enabled: !!committeeId,
  });

  const { data: approvalsData } = useQuery({
    queryKey: ['committee', 'approvals'],
    queryFn: () => auditApi.committee.listApprovals().then(r => r.data?.approvals || []),
    enabled: !!committeeId,
  });

  const { data: openActions } = useQuery({
    queryKey: ['committee', 'open-actions'],
    queryFn: () => auditApi.committee.listOpenActions().then(r => r.data?.actions || []),
    enabled: !!committeeId,
  });

  const meetings = meetingsData || [];
  const approvals = approvalsData || [];
  const members = committee?.members || [];

  const addMember = useMutation({
    mutationFn: (data: any) => auditApi.committee.addMember(committeeId!, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['committee'] });
      setShowMember(false);
      setEditMember(null);
      setMemberForm({ name: '', email: '', role: 'member', independence_status: 'independent', is_financial_expert: false, term_start: '', term_end: '', bio: '' });
    },
  });

  const updateMember = useMutation({
    mutationFn: ({ mid, data }: any) => auditApi.committee.updateMember(committeeId!, mid, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['committee'] });
      setShowMember(false);
      setEditMember(null);
    },
  });

  const deleteMember = useMutation({
    mutationFn: (mid: number) => auditApi.committee.deleteMember(committeeId!, mid),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['committee'] }),
  });

  const createMeeting = useMutation({
    mutationFn: (data: any) => auditApi.committee.createMeeting(committeeId!, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['committee', committeeId, 'meetings'] });
      qc.invalidateQueries({ queryKey: ['committee', committeeId, 'stats'] });
      setShowMeeting(false);
      setMeetingForm({ title: '', meeting_type: 'regular', scheduled_at: '', location: '' });
    },
  });

  const decideApproval = useMutation({
    mutationFn: ({ aid, status, notes, signature }: any) => auditApi.committee.decideApproval(aid, { status, decision_notes: notes, digital_signature: signature }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['committee', 'approvals'] });
      qc.invalidateQueries({ queryKey: ['committee', committeeId, 'stats'] });
    },
  });

  const updateCommittee = useMutation({
    mutationFn: (data: any) => auditApi.committee.update(committeeId!, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['committee', 'primary'] });
      setShowSettings(false);
    },
  });

  const upcomingMeetings = useMemo(() => meetings.filter((m: any) => m.status === 'scheduled'), [meetings]);
  const recentMeetings = useMemo(() => meetings.filter((m: any) => m.status === 'completed').slice(0, 5), [meetings]);

  if (loadingCommittee) {
    return (
      <div className="flex h-96 items-center justify-center text-slate-400">
        <Loader2 className="animate-spin" /> <span className="ml-2">Loading committee…</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Gavel className="text-amber-400" size={24} />
            <h1 className="text-2xl font-semibold text-white">{committee?.name || 'Audit Committee'}</h1>
          </div>
          <p className="mt-1 text-sm text-slate-400">
            Governance oversight body — IIA-aligned charter, independence, and approvals.
          </p>
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-400">
            <Pill className="border-slate-700 bg-slate-800/40 text-slate-300">CAE reports to: {committee?.cae_reports_to}</Pill>
            <Pill className="border-slate-700 bg-slate-800/40 text-slate-300">Cadence: {committee?.meeting_cadence}</Pill>
            <Pill className="border-slate-700 bg-slate-800/40 text-slate-300">Quorum: {committee?.quorum_count}</Pill>
            {committee?.chair_name && <Pill className="border-slate-700 bg-slate-800/40 text-slate-300">Chair: {committee.chair_name}</Pill>}
          </div>
        </div>
        <button
          onClick={() => { setSettingsForm({ ...committee }); setShowSettings(true); }}
          className="rounded-md border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
        >
          <Edit2 size={14} className="-mt-0.5 mr-1 inline" />
          Settings
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Users}
          label="Members"
          value={stats?.members_total ?? 0}
          sub={`${stats?.independence_pct ?? 0}% independent`}
          accent="text-blue-400"
        />
        <StatCard
          icon={Calendar}
          label="Upcoming Meetings"
          value={stats?.meetings_upcoming ?? 0}
          sub={`${stats?.meetings_completed ?? 0} held to date`}
          accent="text-purple-400"
        />
        <StatCard
          icon={ClipboardCheck}
          label="Open Action Items"
          value={stats?.open_actions ?? 0}
          sub={`${stats?.overdue_actions ?? 0} overdue`}
          accent={stats?.overdue_actions ? 'text-red-400' : 'text-amber-400'}
        />
        <StatCard
          icon={FileCheck}
          label="Pending Approvals"
          value={stats?.pending_approvals ?? 0}
          sub="Charter / plan / report"
          accent="text-emerald-400"
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {(['overview', 'members', 'meetings', 'approvals'] as TabKey[]).map(k => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`border-b-2 px-4 py-2 text-sm capitalize transition ${
              tab === k
                ? 'border-amber-400 text-amber-800'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            {k}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Next meeting */}
          <div className="rounded-lg border border-slate-700/60 bg-slate-900/40 p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-zinc-200">
              <Calendar size={16} className="text-purple-400" /> Next Meeting
            </h3>
            {stats?.next_meeting ? (
              <Link
                href={`/audit/committee/${stats.next_meeting.id}`}
                className="block rounded-md border border-gray-200 bg-gray-50 p-3 hover:border-purple-500/40"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-sm font-medium text-white">{stats.next_meeting.title}</div>
                    <div className="mt-1 text-xs text-slate-400">
                      {stats.next_meeting.scheduled_at
                        ? new Date(stats.next_meeting.scheduled_at).toLocaleString()
                        : 'No date set'}
                      {stats.next_meeting.location ? ` · ${stats.next_meeting.location}` : ''}
                    </div>
                  </div>
                  <ChevronRight size={16} className="text-slate-500" />
                </div>
              </Link>
            ) : (
              <div className="text-sm text-gray-400">No meetings scheduled.</div>
            )}
            <button
              onClick={() => setShowMeeting(true)}
              className="mt-3 inline-flex items-center gap-1 text-xs text-amber-700 hover:text-amber-600"
            >
              <Plus size={12} /> Schedule meeting
            </button>
          </div>

          {/* Pending approvals snapshot */}
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-gray-900">
              <ShieldCheck size={16} className="text-emerald-500" /> Pending Approvals
            </h3>
            {approvals.filter((a: any) => a.status === 'requested' || a.status === 'in_review').length === 0 ? (
              <div className="text-sm text-gray-400">No pending approvals.</div>
            ) : (
              <div className="space-y-2">
                {approvals
                  .filter((a: any) => a.status === 'requested' || a.status === 'in_review')
                  .slice(0, 4)
                  .map((a: any) => (
                    <div key={a.id} className="flex items-center justify-between rounded-md border border-gray-200 bg-gray-50 p-2 text-sm">
                      <div className="flex-1">
                        <div className="text-gray-900">{a.target_label || `${a.target_type} #${a.target_id}`}</div>
                        <div className="text-xs text-gray-500">{a.target_type} · requested by {a.requested_by_name || 'system'}</div>
                      </div>
                      <button
                        onClick={() => setTab('approvals')}
                        className="text-xs text-amber-700 hover:text-amber-600"
                      >
                        Review <ArrowRight size={12} className="-mt-0.5 inline" />
                      </button>
                    </div>
                  ))}
              </div>
            )}
          </div>

          {/* Open actions */}
          <div className="rounded-lg border border-slate-700/60 bg-slate-900/40 p-4 lg:col-span-2">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-zinc-200">
              <ClipboardCheck size={16} className="text-amber-400" /> Open Action Items
            </h3>
            {(openActions || []).length === 0 ? (
              <div className="text-sm text-slate-500">No open committee actions.</div>
            ) : (
              <div className="space-y-2">
                {(openActions || []).slice(0, 6).map((a: any) => (
                  <div key={a.id} className="flex items-center justify-between rounded-md border border-gray-200 bg-gray-50 p-2 text-sm">
                    <div className="flex-1">
                      <div className="text-zinc-900">{a.title}</div>
                      <div className="text-xs text-slate-500">
                        {a.owner_name || 'Unassigned'} · due {a.due_date ? new Date(a.due_date).toLocaleDateString() : 'TBD'}
                      </div>
                    </div>
                    <Pill className={`border-slate-700 bg-slate-800/40 text-slate-300`}>
                      {a.priority}
                    </Pill>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent meetings */}
          <div className="rounded-lg border border-slate-700/60 bg-slate-900/40 p-4 lg:col-span-2">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-zinc-200">
              <Briefcase size={16} className="text-blue-400" /> Recent Meetings
            </h3>
            {recentMeetings.length === 0 ? (
              <div className="text-sm text-slate-500">No completed meetings yet.</div>
            ) : (
              <div className="space-y-2">
                {recentMeetings.map((m: any) => (
                  <Link
                    key={m.id}
                    href={`/audit/committee/${m.id}`}
                    className="flex items-center justify-between rounded-md border border-gray-200 bg-gray-50 p-2 text-sm hover:border-blue-500/40"
                  >
                    <div>
                      <div className="text-zinc-900">{m.title}</div>
                      <div className="text-xs text-slate-500">
                        {m.scheduled_at ? new Date(m.scheduled_at).toLocaleDateString() : 'No date'}
                        {m.minutes_approved ? ' · minutes approved' : ''}
                      </div>
                    </div>
                    <ChevronRight size={14} className="text-slate-500" />
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'members' && (
        <div className="rounded-lg border border-slate-700/60 bg-slate-900/40">
          <div className="flex items-center justify-between border-b border-slate-700/60 p-4">
            <h3 className="text-sm font-medium text-zinc-200">Committee Members ({members.length})</h3>
            <button
              onClick={() => { setEditMember(null); setMemberForm({ name: '', email: '', role: 'member', independence_status: 'independent', is_financial_expert: false, term_start: '', term_end: '', bio: '' }); setShowMember(true); }}
              className="inline-flex items-center gap-1 rounded-md bg-amber-500/20 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-500/30"
            >
              <Plus size={12} /> Add Member
            </button>
          </div>
          <div className="divide-y divide-zinc-800">
            {members.length === 0 ? (
              <div className="p-6 text-center text-sm text-slate-500">No members yet. Add a chair, secretary and members.</div>
            ) : members.map((m: any) => (
              <div key={m.id} className="flex items-center justify-between p-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-white">{m.name}</span>
                    <Pill className="border-blue-500/30 bg-blue-500/10 text-blue-300">{m.role}</Pill>
                    <Pill className={m.independence_status === 'independent' ? 'border-green-500/30 bg-green-500/10 text-green-300' : 'border-amber-500/30 bg-amber-500/10 text-amber-300'}>
                      {m.independence_status}
                    </Pill>
                    {m.is_financial_expert && <Pill className="border-purple-500/30 bg-purple-500/10 text-purple-300">Financial expert</Pill>}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {m.email || '—'}
                    {m.term_start && ` · term ${new Date(m.term_start).toLocaleDateString()}`}
                    {m.term_end && ` → ${new Date(m.term_end).toLocaleDateString()}`}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setEditMember(m);
                      setMemberForm({
                        name: m.name, email: m.email || '', role: m.role || 'member',
                        independence_status: m.independence_status || 'independent',
                        is_financial_expert: !!m.is_financial_expert,
                        term_start: m.term_start ? m.term_start.slice(0, 10) : '',
                        term_end: m.term_end ? m.term_end.slice(0, 10) : '',
                        bio: m.bio || '',
                      });
                      setShowMember(true);
                    }}
                    className="text-slate-400 hover:text-zinc-200"
                  >
                    <Edit2 size={14} />
                  </button>
                  <button
                    onClick={() => { if (confirm(`Remove ${m.name}?`)) deleteMember.mutate(m.id); }}
                    className="text-slate-400 hover:text-red-400"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'meetings' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-medium text-zinc-200">Meetings ({meetings.length})</h3>
            <div className="flex items-center gap-2">
              <div className="inline-flex overflow-hidden rounded-md border border-slate-700">
                <button
                  onClick={() => setMeetingsView('list')}
                  className={`inline-flex items-center gap-1 px-2 py-1 text-xs ${meetingsView === 'list' ? 'bg-amber-500/20 text-amber-800' : 'bg-slate-900/60 text-slate-600 hover:text-slate-900'}`}
                >
                  <List size={12} /> List
                </button>
                <button
                  onClick={() => setMeetingsView('calendar')}
                  className={`inline-flex items-center gap-1 px-2 py-1 text-xs ${meetingsView === 'calendar' ? 'bg-amber-500/20 text-amber-800' : 'bg-slate-900/60 text-slate-600 hover:text-slate-900'}`}
                >
                  <Grid3x3 size={12} /> Calendar
                </button>
              </div>
              <button
                onClick={() => setShowMeeting(true)}
                className="inline-flex items-center gap-1 rounded-md bg-amber-500/20 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-500/30"
              >
                <Plus size={12} /> Schedule Meeting
              </button>
            </div>
          </div>
          {meetingsView === 'calendar' ? (
            <MonthCalendar
              month={calendarMonth}
              meetings={meetings}
              onPrev={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}
              onNext={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}
              onToday={() => { const d = new Date(); setCalendarMonth(new Date(d.getFullYear(), d.getMonth(), 1)); }}
            />
          ) : meetings.length === 0 ? (
            <div className="rounded-lg border border-slate-700/60 bg-slate-900/40 p-8 text-center text-sm text-slate-500">
              No meetings yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {meetings.map((m: any) => (
                <Link
                  key={m.id}
                  href={`/audit/committee/${m.id}`}
                  className="block rounded-lg border border-slate-700/60 bg-slate-900/40 p-4 transition hover:border-amber-500/30"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="font-medium text-white">{m.title}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        {m.scheduled_at ? new Date(m.scheduled_at).toLocaleString() : 'No date'}
                        {m.location ? ` · ${m.location}` : ''}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        Chair: {m.chair_name || '—'} · Secretary: {m.secretary_name || '—'}
                      </div>
                    </div>
                    <Pill className={STATUS_COLORS[m.status] || 'border-slate-700 bg-slate-800 text-slate-300'}>
                      {m.status}
                    </Pill>
                  </div>
                  <div className="mt-3 flex items-center gap-3 text-xs text-slate-400">
                    <span className="capitalize">{m.meeting_type}</span>
                    {m.minutes_approved && (
                      <span className="inline-flex items-center gap-1 text-green-400">
                        <CheckCircle size={12} /> Minutes approved
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'approvals' && (
        <div className="rounded-lg border border-slate-700/60 bg-slate-900/40">
          <div className="border-b border-slate-700/60 p-4">
            <h3 className="text-sm font-medium text-zinc-200">
              Approval Inbox · {approvals.length}
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Charter, plan, and report items awaiting Audit Committee decision.
            </p>
          </div>
          {approvals.length === 0 ? (
            <div className="p-6 text-center text-sm text-slate-500">No approvals yet.</div>
          ) : (
            <div className="divide-y divide-zinc-800">
              {approvals.map((a: any) => (
                <div key={a.id} className="flex items-start justify-between gap-4 p-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-white">
                        {a.target_label || `${a.target_type} #${a.target_id}`}
                      </span>
                      <Pill className={STATUS_COLORS[a.status] || 'border-gray-200 bg-gray-100 text-gray-600'}>
                        {a.status}
                      </Pill>
                      <Pill className="border-gray-200 bg-gray-100 text-gray-600 capitalize">{a.target_type}</Pill>
                    </div>
                    <div className="mt-1 text-xs text-gray-500">
                      Requested by {a.requested_by_name || 'system'} · {a.requested_at ? new Date(a.requested_at).toLocaleString() : ''}
                    </div>
                    {a.request_notes && <div className="mt-2 text-sm text-gray-600">{a.request_notes}</div>}
                    {a.decision_notes && (
                      <div className="mt-2 text-sm text-gray-500">
                        <span className="text-gray-400">Decision:</span> {a.decision_notes}
                        {a.decided_by_name ? ` — ${a.decided_by_name}` : ''}
                      </div>
                    )}
                  </div>
                  {(a.status === 'requested' || a.status === 'in_review') && (
                    <div className="flex flex-col gap-2">
                      <button
                        onClick={() => setReviewApproval(a)}
                        className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs text-amber-700 hover:bg-amber-500/20"
                      >
                        <FileText size={12} /> Review side-by-side
                      </button>
                      {a.target_type && a.target_id && (
                        <Link
                          href={a.target_type === 'charter' || a.target_type === 'audit_charter' ? '/audit/charter' : '/audit/plans'}
                          className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-3 py-1 text-xs text-gray-600 hover:bg-gray-50"
                          target="_blank"
                        >
                          <FileText size={12} /> Open artifact page
                        </Link>
                      )}
                      <button
                        onClick={() => {
                          const signature = prompt(
                            `Digital sign-off attestation\n\nBy entering your full name you certify that you have reviewed "${a.target_label || a.target_type}" and approve it on behalf of the Audit Committee.\n\nType your full name:`
                          );
                          if (!signature || !signature.trim()) return;
                          const notes = prompt('Approval notes (optional):') || '';
                          decideApproval.mutate({ aid: a.id, status: 'approved', notes, signature: signature.trim() });
                        }}
                        className="inline-flex items-center gap-1 rounded-md bg-green-500/20 px-3 py-1 text-xs text-green-700 hover:bg-green-500/30"
                      >
                        <CheckCircle size={12} /> Approve & sign
                      </button>
                      <button
                        onClick={() => {
                          const notes = prompt('Reason for rejection:') || '';
                          if (!notes) return;
                          decideApproval.mutate({ aid: a.id, status: 'rejected', notes });
                        }}
                        className="inline-flex items-center gap-1 rounded-md bg-red-500/20 px-3 py-1 text-xs text-red-700 hover:bg-red-500/30"
                      >
                        <X size={12} /> Reject
                      </button>
                    </div>
                  )}
                    {a.digital_signature && (
                      <div className="mt-1 text-[11px] text-gray-400">
                        Signed by: <span className="text-gray-600">{a.digital_signature}</span>
                      </div>
                    )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Add/Edit member modal */}
      {showMember && (
        <Modal title={editMember ? 'Edit Member' : 'Add Member'} onClose={() => { setShowMember(false); setEditMember(null); }}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name *">
              <input className={inputCls} value={memberForm.name} onChange={e => setMemberForm({ ...memberForm, name: e.target.value })} />
            </Field>
            <Field label="Email">
              <input className={inputCls} value={memberForm.email} onChange={e => setMemberForm({ ...memberForm, email: e.target.value })} />
            </Field>
            <Field label="Role">
              <select className={inputCls} value={memberForm.role} onChange={e => setMemberForm({ ...memberForm, role: e.target.value })}>
                <option value="chair">Chair</option>
                <option value="vice_chair">Vice Chair</option>
                <option value="member">Member</option>
                <option value="secretary">Secretary</option>
                <option value="observer">Observer</option>
              </select>
            </Field>
            <Field label="Independence">
              <select className={inputCls} value={memberForm.independence_status} onChange={e => setMemberForm({ ...memberForm, independence_status: e.target.value })}>
                <option value="independent">Independent</option>
                <option value="non_independent">Non-independent</option>
                <option value="executive">Executive</option>
              </select>
            </Field>
            <Field label="Term start">
              <input type="date" className={inputCls} value={memberForm.term_start} onChange={e => setMemberForm({ ...memberForm, term_start: e.target.value })} />
            </Field>
            <Field label="Term end">
              <input type="date" className={inputCls} value={memberForm.term_end} onChange={e => setMemberForm({ ...memberForm, term_end: e.target.value })} />
            </Field>
            <label className="col-span-2 flex items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={memberForm.is_financial_expert}
                onChange={e => setMemberForm({ ...memberForm, is_financial_expert: e.target.checked })}
              />
              Financial expert (per regulator definition)
            </label>
            <Field label="Bio" full>
              <textarea rows={3} className={inputCls} value={memberForm.bio} onChange={e => setMemberForm({ ...memberForm, bio: e.target.value })} />
            </Field>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => { setShowMember(false); setEditMember(null); }} className={btnSecondary}>Cancel</button>
            <button
              disabled={!memberForm.name || addMember.isPending || updateMember.isPending}
              onClick={() => {
                const payload: any = { ...memberForm };
                if (!payload.term_start) delete payload.term_start; else payload.term_start = new Date(payload.term_start).toISOString();
                if (!payload.term_end) delete payload.term_end; else payload.term_end = new Date(payload.term_end).toISOString();
                if (editMember) updateMember.mutate({ mid: editMember.id, data: payload });
                else addMember.mutate(payload);
              }}
              className={btnPrimary}
            >
              <Save size={14} className="mr-1 inline" />
              {editMember ? 'Save Changes' : 'Add Member'}
            </button>
          </div>
        </Modal>
      )}

      {/* Schedule meeting modal */}
      {showMeeting && (
        <Modal title="Schedule Meeting" onClose={() => setShowMeeting(false)}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Title *" full>
              <input className={inputCls} value={meetingForm.title} onChange={e => setMeetingForm({ ...meetingForm, title: e.target.value })} placeholder="Q2 2026 Audit Committee Meeting" />
            </Field>
            <Field label="Type">
              <select className={inputCls} value={meetingForm.meeting_type} onChange={e => setMeetingForm({ ...meetingForm, meeting_type: e.target.value })}>
                <option value="regular">Regular</option>
                <option value="special">Special</option>
                <option value="executive_session">Executive Session</option>
              </select>
            </Field>
            <Field label="Scheduled at">
              <input type="datetime-local" className={inputCls} value={meetingForm.scheduled_at} onChange={e => setMeetingForm({ ...meetingForm, scheduled_at: e.target.value })} />
            </Field>
            <Field label="Location" full>
              <input className={inputCls} value={meetingForm.location} onChange={e => setMeetingForm({ ...meetingForm, location: e.target.value })} placeholder="Boardroom / Zoom link" />
            </Field>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => setShowMeeting(false)} className={btnSecondary}>Cancel</button>
            <button
              disabled={!meetingForm.title || createMeeting.isPending}
              onClick={() => {
                const payload: any = { ...meetingForm };
                if (!payload.scheduled_at) delete payload.scheduled_at; else payload.scheduled_at = new Date(payload.scheduled_at).toISOString();
                createMeeting.mutate(payload);
              }}
              className={btnPrimary}
            >
              <Save size={14} className="mr-1 inline" /> Create
            </button>
          </div>
        </Modal>
      )}

      {/* Settings modal */}
      {showSettings && settingsForm && (
        <Modal title="Committee Settings" onClose={() => setShowSettings(false)}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name" full>
              <input className={inputCls} value={settingsForm.name || ''} onChange={e => setSettingsForm({ ...settingsForm, name: e.target.value })} />
            </Field>
            <Field label="CAE reports to">
              <input className={inputCls} value={settingsForm.cae_reports_to || ''} onChange={e => setSettingsForm({ ...settingsForm, cae_reports_to: e.target.value })} />
            </Field>
            <Field label="Cadence">
              <select className={inputCls} value={settingsForm.meeting_cadence || 'quarterly'} onChange={e => setSettingsForm({ ...settingsForm, meeting_cadence: e.target.value })}>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="semiannual">Semi-annual</option>
                <option value="annual">Annual</option>
              </select>
            </Field>
            <Field label="Quorum">
              <input type="number" min={1} className={inputCls} value={settingsForm.quorum_count || 3} onChange={e => setSettingsForm({ ...settingsForm, quorum_count: Number(e.target.value) })} />
            </Field>
            <Field label="Description" full>
              <textarea rows={3} className={inputCls} value={settingsForm.description || ''} onChange={e => setSettingsForm({ ...settingsForm, description: e.target.value })} />
            </Field>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => setShowSettings(false)} className={btnSecondary}>Cancel</button>
            <button
              disabled={updateCommittee.isPending}
              onClick={() => updateCommittee.mutate({
                name: settingsForm.name,
                cae_reports_to: settingsForm.cae_reports_to,
                meeting_cadence: settingsForm.meeting_cadence,
                quorum_count: settingsForm.quorum_count,
                description: settingsForm.description,
              })}
              className={btnPrimary}
            >
              <Save size={14} className="mr-1 inline" /> Save
            </button>
          </div>
        </Modal>
      )}

      {reviewApproval && (
        <Modal title={`Side-by-side review · ${reviewApproval.target_label || reviewApproval.target_type}`} onClose={() => setReviewApproval(null)}>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Approval request</div>
              <div className="space-y-2 rounded-md border border-slate-700/60 bg-zinc-950/40 p-3 text-xs text-slate-300">
                <div><span className="text-slate-500">Target:</span> {reviewApproval.target_type} #{reviewApproval.target_id}</div>
                <div><span className="text-slate-500">Status:</span> {reviewApproval.status}</div>
                <div><span className="text-slate-500">Requested by:</span> {reviewApproval.requested_by_name || 'system'}</div>
                <div><span className="text-slate-500">Requested at:</span> {reviewApproval.requested_at ? new Date(reviewApproval.requested_at).toLocaleString() : '—'}</div>
                {reviewApproval.request_notes && (
                  <div className="pt-2"><span className="text-slate-500">Notes:</span><div className="mt-1 whitespace-pre-wrap text-zinc-200">{reviewApproval.request_notes}</div></div>
                )}
                {reviewCtx?.artifact?.history?.length > 0 && (
                  <div className="pt-2">
                    <div className="mb-1 text-slate-500">Version history</div>
                    <ul className="space-y-1">
                      {reviewCtx.artifact.history.filter((h: any) => h.at).map((h: any, i: number) => (
                        <li key={i} className="flex justify-between border-l-2 border-amber-500/40 pl-2">
                          <span className="text-slate-300">{h.event}</span>
                          <span className="text-slate-500">{new Date(h.at).toLocaleString()}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Submitted artifact (current snapshot)</div>
              <div className="rounded-md border border-slate-700/60 bg-zinc-950/40 p-3 text-xs text-slate-300">
                {reviewLoading && <div className="text-slate-500">Loading…</div>}
                {!reviewLoading && reviewCtx?.artifact?.snapshot && (
                  <dl className="space-y-2">
                    {Object.entries(reviewCtx.artifact.snapshot).map(([k, v]: any) => (
                      <div key={k}>
                        <dt className="text-slate-500">{k}</dt>
                        <dd className="whitespace-pre-wrap text-zinc-200">{v == null ? '—' : String(v)}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                {!reviewLoading && !reviewCtx?.artifact?.snapshot && (
                  <div className="text-gray-400">{reviewCtx?.artifact?.error || 'No snapshot available for this artifact type.'}</div>
                )}
              </div>
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2 border-t border-gray-200 pt-3">
            <button onClick={() => setReviewApproval(null)} className={btnSecondary}>Close</button>
            {(reviewApproval.status === 'requested' || reviewApproval.status === 'in_review') && (
              <>
                <button
                  onClick={() => {
                    const notes = prompt('Reason for rejection:') || '';
                    if (!notes) return;
                    decideApproval.mutate({ aid: reviewApproval.id, status: 'rejected', notes });
                    setReviewApproval(null);
                  }}
                  className="rounded-md bg-red-500/20 px-4 py-1.5 text-sm text-red-700 hover:bg-red-500/30"
                >Reject</button>
                <button
                  onClick={() => {
                    const signature = prompt(`Digital sign-off attestation\n\nBy entering your full name you certify that you have reviewed "${reviewApproval.target_label || reviewApproval.target_type}" and approve it on behalf of the Audit Committee.\n\nType your full name:`);
                    if (!signature || !signature.trim()) return;
                    const notes = prompt('Approval notes (optional):') || '';
                    decideApproval.mutate({ aid: reviewApproval.id, status: 'approved', notes, signature: signature.trim() });
                    setReviewApproval(null);
                  }}
                  className="rounded-md bg-green-500/20 px-4 py-1.5 text-sm text-green-700 hover:bg-green-500/30"
                >Approve & sign</button>
              </>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

const inputCls = 'w-full rounded-md border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-white focus:border-amber-400 focus:outline-none';
const btnPrimary = 'rounded-md bg-amber-500/20 px-4 py-1.5 text-sm font-medium text-amber-800 hover:bg-amber-500/30 disabled:opacity-40';
const btnSecondary = 'rounded-md border border-gray-200 bg-white px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-50';

function Field({ label, children, full = false }: any) {
  return (
    <div className={full ? 'col-span-2' : ''}>
      <label className="mb-1 block text-xs font-medium text-slate-400">{label}</label>
      {children}
    </div>
  );
}

function MonthCalendar({ month, meetings, onPrev, onNext, onToday }: any) {
  const year = month.getFullYear();
  const m = month.getMonth();
  const firstDow = new Date(year, m, 1).getDay();
  const daysInMonth = new Date(year, m + 1, 0).getDate();
  const today = new Date();
  const todayKey = today.toDateString();

  const byDay: Record<string, any[]> = {};
  (meetings || []).forEach((mt: any) => {
    if (!mt.scheduled_at) return;
    const d = new Date(mt.scheduled_at);
    if (d.getFullYear() === year && d.getMonth() === m) {
      const k = d.getDate();
      (byDay[k] = byDay[k] || []).push(mt);
    }
  });

  const cells: Array<{ day: number | null; date: Date | null }> = [];
  for (let i = 0; i < firstDow; i++) cells.push({ day: null, date: null });
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, date: new Date(year, m, d) });
  while (cells.length % 7 !== 0) cells.push({ day: null, date: null });

  const monthName = month.toLocaleString('default', { month: 'long', year: 'numeric' });
  const dows = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="rounded-lg border border-slate-700/60 bg-slate-900/40">
      <div className="flex items-center justify-between border-b border-slate-700/60 p-3">
        <div className="text-sm font-medium text-white">{monthName}</div>
        <div className="flex items-center gap-1">
          <button onClick={onPrev} className="rounded-md border border-slate-700 bg-slate-900/60 p-1 text-slate-300 hover:bg-slate-800"><ChevronLeft size={14} /></button>
          <button onClick={onToday} className="rounded-md border border-slate-700 bg-slate-900/60 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800">Today</button>
          <button onClick={onNext} className="rounded-md border border-slate-700 bg-slate-900/60 p-1 text-slate-300 hover:bg-slate-800"><ChevronRight size={14} /></button>
        </div>
      </div>
      <div className="grid grid-cols-7 border-b border-slate-700/60 bg-zinc-950/40 text-[10px] uppercase text-slate-500">
        {dows.map(d => <div key={d} className="px-2 py-1 text-center">{d}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((c, i) => {
          const isToday = c.date && c.date.toDateString() === todayKey;
          const items = c.day ? (byDay[c.day] || []) : [];
          return (
            <div
              key={i}
              className={`min-h-[80px] border-b border-r border-slate-700/60 p-1 text-xs last:border-r-0 ${c.day == null ? 'bg-zinc-950/40' : ''}`}
            >
              {c.day && (
                <div className={`mb-1 inline-block rounded px-1 text-[10px] ${isToday ? 'bg-amber-500/30 text-amber-200' : 'text-slate-500'}`}>
                  {c.day}
                </div>
              )}
              <div className="space-y-0.5">
                {items.slice(0, 3).map((mt: any) => (
                  <Link
                    key={mt.id}
                    href={`/audit/committee/${mt.id}`}
                    className="block truncate rounded bg-blue-500/15 px-1 py-0.5 text-[10px] text-blue-200 hover:bg-blue-500/25"
                    title={`${mt.title} · ${new Date(mt.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                  >
                    {new Date(mt.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} {mt.title}
                  </Link>
                ))}
                {items.length > 3 && (
                  <div className="text-[10px] text-slate-500">+{items.length - 3} more</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Modal({ title, children, onClose }: any) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-2xl rounded-lg border border-gray-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <h3 className="text-sm font-medium text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-900"><X size={16} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
