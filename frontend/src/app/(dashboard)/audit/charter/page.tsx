'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { auditApi } from '@/lib/api';
import type { ComponentType, SVGProps } from 'react';
import {
  BookOpen, Plus, CheckCircle, Clock, Pencil, Loader2, Sparkles, Save, X,
  Shield, FileText, Users, Target, Award, Send, GitCompare, Library, ClipboardCheck,
  Link as LinkIcon, AlertTriangle, History, ChevronRight, Trash2, Layers,
} from 'lucide-react';

type LucideIcon = ComponentType<SVGProps<SVGSVGElement>>;

export interface Clause {
  id: number;
  charter_id: number;
  clause_code: string;
  section?: string | null;
  title?: string | null;
  body?: string | null;
  order_index?: number | null;
  engagement_links?: Array<{ engagement_id: number; engagement_title?: string }>;
  plan_links?: Array<{ plan_id: number; plan_title?: string }>;
}

export interface Charter {
  id: number;
  tenant_id: number;
  title: string;
  version: string;
  status: string;
  content?: string | null;
  mission?: string | null;
  authority?: string | null;
  independence_objectivity?: string | null;
  scope_of_work?: string | null;
  accountability?: string | null;
  standards?: string | null;
  effective_date?: string | null;
  review_date?: string | null;
  next_review_due?: string | null;
  submitted_at?: string | null;
  submitted_by_id?: number | null;
  submitted_by_name?: string | null;
  submission_approval_id?: number | null;
  approved_by_id?: number | null;
  approved_by_name?: string | null;
  approved_at?: string | null;
  change_reason?: string | null;
  rejection_reason?: string | null;
  parent_charter_id?: number | null;
  template_id?: number | null;
  created_by_id?: number | null;
  created_by_name?: string | null;
  created_at?: string;
  updated_at?: string;
  clauses?: Clause[];
}

type CharterSectionKey = 'mission' | 'authority' | 'independence_objectivity' |
  'scope_of_work' | 'accountability' | 'standards';

export interface Template {
  id: number;
  name: string;
  sector: string;
  description?: string | null;
  sections?: Record<string, string>;
  clauses?: Array<Partial<Clause>>;
  clause_count?: number;
  is_system?: boolean;
}

interface CoverageRow extends Clause {
  engagements: Array<{ id: number; title: string; status?: string | null }>;
  plans: Array<{ id: number; name: string; fiscal_year?: number | null }>;
  covered: boolean;
}

interface CoverageResponse {
  charter_id: number;
  total_clauses: number;
  covered_clauses: number;
  coverage_percent: number;
  rows: CoverageRow[];
}

type CharterFormData = Partial<Pick<Charter,
  'title' | 'version' | 'content' | 'mission' | 'authority' |
  'independence_objectivity' | 'scope_of_work' | 'accountability' |
  'standards' | 'effective_date' | 'review_date' | 'next_review_due' |
  'change_reason'
>>;

interface DueReviewAlert {
  id: number;
  title: string;
  version: string;
  next_review_due: string;
  days_remaining: number;
  overdue: boolean;
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-slate-500/20 text-slate-600 border-slate-500/30',
  submitted: 'bg-amber-500/20 text-amber-700 border-amber-500/30',
  pending_approval: 'bg-amber-500/20 text-amber-700 border-amber-500/30',
  under_review: 'bg-sky-500/20 text-sky-700 border-sky-500/30',
  approved: 'bg-emerald-500/20 text-emerald-700 border-emerald-500/30',
  rejected: 'bg-rose-500/20 text-rose-700 border-rose-500/30',
  superseded: 'bg-slate-600/20 text-slate-500 border-slate-600/30',
};

const SECTIONS: Array<{ key: CharterSectionKey; label: string; icon: LucideIcon }> = [
  { key: 'mission', label: 'Mission', icon: Target },
  { key: 'authority', label: 'Authority', icon: Shield },
  { key: 'independence_objectivity', label: 'Independence & Objectivity', icon: Award },
  { key: 'scope_of_work', label: 'Scope of Work', icon: FileText },
  { key: 'accountability', label: 'Accountability', icon: Users },
  { key: 'standards', label: 'Standards', icon: CheckCircle },
];

const STATUS_TIMELINE = ['draft', 'submitted', 'under_review', 'approved'];

const TABS = [
  { key: 'editor', label: 'Editor', icon: Pencil },
  { key: 'clauses', label: 'Clauses', icon: Layers },
  { key: 'coverage', label: 'Coverage', icon: LinkIcon },
  { key: 'diff', label: 'Diff', icon: GitCompare },
  { key: 'templates', label: 'Templates', icon: Library },
  { key: 'attestations', label: 'Attestations', icon: ClipboardCheck },
] as const;

const inputCls = 'w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-900/60 text-white text-sm focus:outline-none focus:border-blue-500';

// ---------------------------------------------------------------------------
// Diff helpers (client-side, line-level)
// ---------------------------------------------------------------------------
function errMsg(e: unknown): string {
  const r = e as { response?: { data?: { detail?: string } }; message?: string };
  return r?.response?.data?.detail || r?.message || 'Unknown error';
}

function bumpVersion(v: string): string {
  const m = String(v || '1.0').match(/^(\d+)\.(\d+)$/);
  if (!m) return `${v}.next`;
  return `${m[1]}.${parseInt(m[2], 10) + 1}`;
}

function lineDiff(a: string, b: string) {
  const A = (a || '').split('\n');
  const B = (b || '').split('\n');
  const m = A.length, n = B.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) for (let j = n - 1; j >= 0; j--) {
    dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  }
  const left: Array<{ line: string; cls: string }> = [];
  const right: Array<{ line: string; cls: string }> = [];
  let i = 0, j = 0;
  while (i < m && j < n) {
    if (A[i] === B[j]) { left.push({ line: A[i], cls: '' }); right.push({ line: B[j], cls: '' }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { left.push({ line: A[i], cls: ' text-black' }); right.push({ line: '', cls: '' }); i++; }
    else { left.push({ line: '', cls: '' }); right.push({ line: B[j], cls: ' text-black' }); j++; }
  }
  while (i < m) { left.push({ line: A[i++], cls: 'bg-rose-500/20 text-black' }); right.push({ line: '', cls: '' }); }
  while (j < n) { left.push({ line: '', cls: '' }); right.push({ line: B[j++], cls: ' text-black' }); }
  return { left, right };
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function CharterPage() {
  const qc = useQueryClient();
  const [activeId, setActiveId] = useState<number | null>(null);
  const [tab, setTab] = useState<typeof TABS[number]['key']>('editor');
  const [showNewVersion, setShowNewVersion] = useState(false);
  const [showSubmit, setShowSubmit] = useState(false);
  const [showAttest, setShowAttest] = useState(false);
  const [showAddClause, setShowAddClause] = useState(false);
  const [diffPick, setDiffPick] = useState<{ a: number | null; b: number | null }>({ a: null, b: null });

  const { data: chartersData } = useQuery({
    queryKey: ['charters'],
    queryFn: () => auditApi.charter.getAll().then(r => r.data?.charters || []),
  });
  const charters: Charter[] = useMemo(() => chartersData || [], [chartersData]);

  // Default-select active or most recent.
  useEffect(() => {
    if (activeId === null && charters.length) {
      const approved = charters.find(c => c.status === 'approved');
      setActiveId((approved || charters[0]).id);
    }
  }, [charters, activeId]);

  const { data: active } = useQuery<Charter>({
    queryKey: ['charter', activeId],
    queryFn: () => auditApi.charter.getById(activeId!).then(r => r.data),
    enabled: !!activeId,
  });

  const { data: templatesData } = useQuery({
    queryKey: ['charter-templates'],
    queryFn: () => auditApi.charter.listTemplates().then(r => r.data?.templates || []),
  });
  const templates: Template[] = templatesData || [];

  const { data: attestationsData } = useQuery({
    queryKey: ['charter-attestations'],
    queryFn: () => auditApi.charter.listAttestations().then(r => r.data),
  });

  const { data: dueReviewData } = useQuery({
    queryKey: ['charter-due-review'],
    queryFn: () => auditApi.charter.dueReview(30).then(r => r.data),
  });

  const { data: coverageData } = useQuery({
    queryKey: ['charter-coverage', activeId],
    queryFn: () => auditApi.charter.coverage(activeId!).then(r => r.data),
    enabled: !!activeId && tab === 'coverage',
  });

  const { data: diffData } = useQuery({
    queryKey: ['charter-diff', diffPick.a, diffPick.b],
    queryFn: () => auditApi.charter.diff(diffPick.a!, diffPick.b!).then(r => r.data),
    enabled: tab === 'diff' && !!diffPick.a && !!diffPick.b,
  });

  // Editor "Save" creates a NEW child version (parent_charter_id=current.id)
  // so every save produces a fresh, immutable AuditCharter row with author
  // and timestamp — no in-place mutation from the UI.
  const saveAsNewVersionMut = useMutation({
    mutationFn: ({ parent, data }: { parent: Charter; data: CharterFormData }) => {
      const bumped = bumpVersion(parent.version || '1.0');
      return auditApi.charter.create({
        ...data,
        version: data.version && data.version !== parent.version ? data.version : bumped,
        parent_charter_id: parent.id,
        change_reason: data.change_reason || `Edit of v${parent.version}`,
      });
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['charters'] });
      qc.invalidateQueries({ queryKey: ['charter-due-review'] });
      setActiveId(res.data.id);
    },
  });
  const submitMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { request_notes?: string; committee_id?: number } }) => auditApi.charter.submit(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['charters'] }); qc.invalidateQueries({ queryKey: ['charter', activeId] }); setShowSubmit(false); },
  });

  const addClauseMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Clause> }) => auditApi.charter.addClause(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['charter', activeId] }); setShowAddClause(false); },
  });
  const deleteClauseMut = useMutation({
    mutationFn: (cid: number) => auditApi.charter.deleteClause(cid),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['charter', activeId] }); qc.invalidateQueries({ queryKey: ['charter-coverage', activeId] }); },
  });

  const FROZEN_STATUSES = new Set(['approved', 'superseded', 'submitted', 'under_review']);
  const editable = !!active && !FROZEN_STATUSES.has(active.status);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Audit Charter</h1>
          <p className="text-slate-400 mt-1 text-sm">Versioned charter, approval workflow, clause traceability and independence attestations.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowAttest(true)} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-700 text-slate-300 hover:text-white text-sm">
            <ClipboardCheck className="h-4 w-4" /> File attestation
          </button>
          <button onClick={() => setShowNewVersion(true)} className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm">
            <Plus className="h-4 w-4" /> New version
          </button>
        </div>
      </div>

      {attestationsData?.overdue && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4" />
          Independence attestation for {attestationsData.current_year} has not been filed.
        </div>
      )}

      {dueReviewData?.alerts?.length > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-200">
          <div className="flex items-center gap-2 font-medium"><AlertTriangle className="h-4 w-4" /> Annual review due</div>
          <ul className="mt-1 ml-6 list-disc space-y-0.5 text-xs">
            {(dueReviewData.alerts as DueReviewAlert[]).map((a) => (
              <li key={a.id}>
                <button onClick={() => { setActiveId(a.id); setTab('editor'); }} className="underline hover:text-white">
                  {a.title} v{a.version}
                </button>{' '}
                — {a.overdue ? <span className="text-rose-300">overdue by {Math.abs(a.days_remaining)} day(s)</span> : <>due in {a.days_remaining} day(s)</>} ({new Date(a.next_review_due).toLocaleDateString()})
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-12 gap-6">
        {/* Versions rail */}
        <div className="col-span-12 lg:col-span-3">
          <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-3">
            <div className="px-2 pb-2 text-xs uppercase tracking-wide text-slate-500 flex items-center gap-1.5">
              <History className="h-3.5 w-3.5" /> Versions
            </div>
            {charters.length === 0 && (
              <div className="px-2 py-6 text-center text-xs text-slate-500">No versions yet. Create one to begin.</div>
            )}
            <div className="space-y-1">
              {charters.map(c => (
                <button
                  key={c.id}
                  onClick={() => setActiveId(c.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg border transition-all ${activeId === c.id ? 'border-blue-500/60 bg-blue-500/10' : 'border-transparent hover:border-slate-700 hover:bg-slate-800/60'}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-mono text-white">v{c.version}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] border ${STATUS_COLORS[c.status] || STATUS_COLORS.draft}`}>{(c.status || 'draft').replace('_', ' ')}</span>
                  </div>
                  <div className="text-xs text-slate-400 mt-1 truncate">{c.title}</div>
                  {c.created_at && <div className="text-[10px] text-slate-500 mt-0.5">{new Date(c.created_at).toLocaleDateString()}</div>}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Main panel */}
        <div className="col-span-12 lg:col-span-9 space-y-4">
          {!active ? (
            <div className="flex h-64 items-center justify-center rounded-xl border border-slate-700 bg-slate-900/40 text-slate-500">
              {charters.length === 0 ? 'Create a new version to start.' : 'Select a version on the left.'}
            </div>
          ) : (
            <>
              {/* Status / actions header */}
              <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-semibold text-white">{active.title}</h2>
                      <span className="text-slate-500 text-sm">v{active.version}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[11px] border ${STATUS_COLORS[active.status] || STATUS_COLORS.draft}`}>{(active.status || 'draft').replace('_', ' ')}</span>
                    </div>
                    <div className="text-xs text-slate-400 mt-1">
                      {active.created_by_name && <>Created by {active.created_by_name} · </>}
                      {active.created_at && new Date(active.created_at).toLocaleDateString()}
                      {active.next_review_due && <> · Next review due {new Date(active.next_review_due).toLocaleDateString()}</>}
                    </div>
                    {active.change_reason && <div className="text-xs text-slate-500 mt-1 italic">&quot;{active.change_reason}&quot;</div>}
                    {active.rejection_reason && <div className="text-xs text-rose-300 mt-1">Rejected: {active.rejection_reason}</div>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(active.status === 'draft' || active.status === 'rejected') && (
                      <button onClick={() => setShowSubmit(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600/20 border border-amber-500/30 text-amber-700 hover:bg-amber-600/30 text-xs">
                        <Send className="h-3.5 w-3.5" /> Submit to Committee
                      </button>
                    )}
                    {(active.status === 'submitted' || active.status === 'under_review') && (
                      <a href="/audit/committee" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600/20 border border-sky-500/30 text-sky-700 hover:bg-sky-600/30 text-xs">
                        <Send className="h-3.5 w-3.5" /> Awaiting Audit Committee decision
                      </a>
                    )}
                  </div>
                </div>
                {/* Status timeline */}
                <div className="mt-4 flex items-center gap-1 text-[11px]">
                  {STATUS_TIMELINE.map((s, idx) => {
                    const reached = active.status === s
                      || STATUS_TIMELINE.indexOf(active.status) > idx
                      || (active.status === 'rejected' && idx <= 1);
                    const current = active.status === s;
                    const isReject = active.status === 'rejected' && s === 'approved';
                    return (
                      <div key={s} className="flex items-center gap-1">
                        <div className={`px-2 py-1 rounded border ${current ? 'border-blue-400 bg-blue-500/10 text-blue-700' : reached ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700' : 'border-gray-300 bg-gray-100 text-slate-400'}`}>
                          {s.replace('_', ' ')}
                        </div>
                        {idx < STATUS_TIMELINE.length - 1 && <ChevronRight className="h-3 w-3 text-slate-400" />}
                      </div>
                    );
                  })}
                  {active.status === 'rejected' && (
                    <span className="ml-2 px-2 py-1 rounded border border-rose-500/40 bg-rose-500/10 text-rose-700">rejected</span>
                  )}
                </div>
              </div>

              {/* Tabs */}
              <div className="flex flex-wrap gap-1 border-b border-gray-200">
                {TABS.map(t => (
                  <button
                    key={t.key}
                    onClick={() => setTab(t.key)}
                    className={`flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 transition-all ${tab === t.key ? 'border-blue-500 text-blue-700' : 'border-transparent text-slate-600 hover:text-gray-900'}`}
                  >
                    <t.icon className="h-3.5 w-3.5" /> {t.label}
                  </button>
                ))}
              </div>

              {tab === 'editor' && (
                <EditorPanel
                  charter={active}
                  editable={!!editable}
                  onSave={(data) => saveAsNewVersionMut.mutate({ parent: active, data })}
                  saving={saveAsNewVersionMut.isPending}
                />
              )}

              {tab === 'clauses' && (
                <ClausesPanel
                  charter={active}
                  editable={!!editable}
                  onAdd={() => setShowAddClause(true)}
                  onDelete={(cid) => deleteClauseMut.mutate(cid)}
                />
              )}

              {tab === 'coverage' && (
                <CoveragePanel data={coverageData} charterId={active.id} editable={active.status !== 'superseded'} onLinkChange={() => qc.invalidateQueries({ queryKey: ['charter-coverage', active.id] })} />
              )}

              {tab === 'diff' && (
                <DiffPanel charters={charters} pick={diffPick} setPick={setDiffPick} data={diffData} />
              )}

              {tab === 'templates' && (
                <TemplatesPanel templates={templates} onCloned={() => qc.invalidateQueries({ queryKey: ['charters'] })} />
              )}

              {tab === 'attestations' && (
                <AttestationsPanel data={attestationsData} onFile={() => setShowAttest(true)} />
              )}
            </>
          )}
        </div>
      </div>

      {/* Modals */}
      {showNewVersion && (
        <NewVersionModal
          charters={charters}
          templates={templates}
          onClose={() => setShowNewVersion(false)}
          onCreated={(id) => { setActiveId(id); setShowNewVersion(false); qc.invalidateQueries({ queryKey: ['charters'] }); }}
        />
      )}
      {showSubmit && active && (
        <SimpleModal title={`Submit v${active.version} to Audit Committee`} onClose={() => setShowSubmit(false)}>
          <SubmitForm onSubmit={(notes) => submitMut.mutate({ id: active.id, data: { request_notes: notes } })} pending={submitMut.isPending} />
        </SimpleModal>
      )}
      {showAttest && (
        <AttestationModal
          onClose={() => setShowAttest(false)}
          onSubmitted={() => { qc.invalidateQueries({ queryKey: ['charter-attestations'] }); setShowAttest(false); }}
          charterId={active?.id}
        />
      )}
      {showAddClause && active && (
        <SimpleModal title="Add clause" onClose={() => setShowAddClause(false)}>
          <ClauseForm onSubmit={(d) => addClauseMut.mutate({ id: active.id, data: d })} pending={addClauseMut.isPending} />
        </SimpleModal>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

function EditorPanel({ charter, editable, onSave, saving }: { charter: Charter; editable: boolean; onSave: (d: CharterFormData) => void; saving: boolean }) {
  const [form, setForm] = useState<CharterFormData>({});
  useEffect(() => {
    setForm({
      title: charter.title || '',
      version: charter.version || '',
      mission: charter.mission || '',
      authority: charter.authority || '',
      independence_objectivity: charter.independence_objectivity || '',
      scope_of_work: charter.scope_of_work || '',
      accountability: charter.accountability || '',
      standards: charter.standards || '',
      next_review_due: charter.next_review_due?.split('T')[0] || '',
      change_reason: charter.change_reason || '',
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [charter.id]);

  return (
    <div className="space-y-4 rounded-xl border border-slate-700 bg-slate-900/40 p-5">
      <div className="rounded-md border border-slate-700 bg-slate-900/40 px-3 py-2 text-xs text-slate-400">
        {!editable
          ? <>This version is <b>{charter.status}</b>. Create a new version to make changes.</>
          : <>Saving will create a <b>new charter version</b> as a child of v{charter.version}, preserving the full revision history.</>}
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Title</label>
          <input className={inputCls} value={form.title || ''} disabled={!editable} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
        </div>
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Version</label>
          <input className={inputCls} value={form.version || ''} disabled={!editable} onChange={e => setForm(f => ({ ...f, version: e.target.value }))} />
        </div>
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Next review due</label>
          <input type="date" className={inputCls} value={form.next_review_due || ''} disabled={!editable} onChange={e => setForm(f => ({ ...f, next_review_due: e.target.value }))} />
        </div>
      </div>
      <div>
        <label className="text-xs text-slate-400 mb-1 block">Change reason</label>
        <input className={inputCls} value={form.change_reason || ''} disabled={!editable} onChange={e => setForm(f => ({ ...f, change_reason: e.target.value }))} placeholder="Why this version was created" />
      </div>
      {SECTIONS.map(s => (
        <div key={s.key}>
          <label className="text-xs text-slate-400 mb-1 flex items-center gap-1.5"><s.icon className="h-3.5 w-3.5" />{s.label}</label>
          <textarea
            className={inputCls + ' resize-none'}
            rows={3}
            value={form[s.key] || ''}
            disabled={!editable}
            onChange={e => setForm(f => ({ ...f, [s.key]: e.target.value }))}
          />
        </div>
      ))}
      {editable && (
        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={() => onSave(form)}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-sm"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save as new version
          </button>
        </div>
      )}
    </div>
  );
}

function ClausesPanel({ charter, editable, onAdd, onDelete }: { charter: Charter; editable: boolean; onAdd: () => void; onDelete: (id: number) => void }) {
  const clauses: Clause[] = charter.clauses || [];
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm text-gray-500">{clauses.length} clause(s)</div>
        {editable && (
          <button onClick={onAdd} className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs">
            <Plus className="h-3.5 w-3.5" /> Add clause
          </button>
        )}
      </div>
      {clauses.length === 0 ? (
        <div className="py-10 text-center text-sm text-gray-400">No clauses yet. Add tagged clauses to enable traceability with engagements and plans.</div>
      ) : (
        <div className="space-y-2">
          {clauses.map((cl) => (
            <div key={cl.id} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-700 border border-blue-500/30 font-mono">{cl.clause_code}</span>
                    {cl.section && <span className="text-gray-500">{cl.section.replace('_', ' ')}</span>}
                  </div>
                  {cl.title && <div className="mt-1 text-sm text-gray-900">{cl.title}</div>}
                  {cl.body && <div className="mt-1 text-xs text-gray-500 leading-relaxed">{cl.body}</div>}
                </div>
                {editable && (
                  <button onClick={() => onDelete(cl.id)} className="p-1 text-gray-400 hover:text-rose-600" title="Delete">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CoveragePanel({ data, charterId, editable, onLinkChange }: { data?: CoverageResponse; charterId: number; editable: boolean; onLinkChange: () => void }) {
  const [linkFor, setLinkFor] = useState<number | null>(null);
  if (!data) return <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading coverage…</div>;
  const rows: CoverageRow[] = data.rows || [];
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex items-center gap-4">
          <div>
            <div className="text-xs text-gray-500">Coverage</div>
            <div className="text-2xl font-bold text-gray-900">{data.covered_clauses}/{data.total_clauses} <span className="text-sm text-gray-500">({data.coverage_percent}%)</span></div>
          </div>
          <div className="flex-1 h-2 rounded-full bg-gray-200 overflow-hidden">
            <div className="h-full bg-emerald-500" style={{ width: `${data.coverage_percent}%` }} />
          </div>
        </div>
      </div>
      <div className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-100">
        {rows.length === 0 && <div className="p-6 text-sm text-gray-400 text-center">No clauses to trace. Add clauses on the Clauses tab.</div>}
        {rows.map((r) => (
          <div key={r.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 text-xs">
                  <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-700 border border-blue-500/30 font-mono">{r.clause_code}</span>
                  {r.title && <span className="text-gray-900 text-sm">{r.title}</span>}
                  {!r.covered && <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-700 border border-amber-500/30 text-[10px]">No coverage</span>}
                </div>
                {r.body && <div className="text-xs text-gray-500 mt-1">{r.body}</div>}
                <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                  {(r.engagements || []).map((e) => (
                    <span key={`e${e.id}`} className="px-2 py-0.5 rounded border border-emerald-500/30 bg-emerald-500/10 text-emerald-700">Eng #{e.id} · {e.title}</span>
                  ))}
                  {(r.plans || []).map((p) => (
                    <span key={`p${p.id}`} className="px-2 py-0.5 rounded border border-sky-500/30 bg-sky-500/10 text-sky-700">Plan #{p.id}: {p.name}</span>
                  ))}
                </div>
              </div>
              {editable && (
                <button onClick={() => setLinkFor(r.id)} className="flex items-center gap-1 px-2 py-1 rounded border border-gray-200 text-gray-600 hover:text-gray-900 text-xs">
                  <LinkIcon className="h-3 w-3" /> Link
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      {linkFor !== null && (
        <SimpleModal title="Link clause to engagement / plan" onClose={() => setLinkFor(null)}>
          <LinkForm clauseId={linkFor} onLinked={() => { setLinkFor(null); onLinkChange(); }} />
        </SimpleModal>
      )}
    </div>
  );
}

interface DiffPick { a: number | null; b: number | null }
interface DiffPayload { a: Charter; b: Charter }
function DiffPanel({ charters, pick, setPick, data }: { charters: Charter[]; pick: DiffPick; setPick: (updater: (p: DiffPick) => DiffPick) => void; data?: DiffPayload }) {
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-4 grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-slate-400">Compare from (A)</label>
          <select className={inputCls} value={pick.a || ''} onChange={e => setPick(p => ({ ...p, a: Number(e.target.value) || null }))}>
            <option value="">Select version…</option>
            {charters.map(c => <option key={c.id} value={c.id}>v{c.version} — {c.status}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-400">Compare to (B)</label>
          <select className={inputCls} value={pick.b || ''} onChange={e => setPick(p => ({ ...p, b: Number(e.target.value) || null }))}>
            <option value="">Select version…</option>
            {charters.map(c => <option key={c.id} value={c.id}>v{c.version} — {c.status}</option>)}
          </select>
        </div>
      </div>
      {!data ? (
        <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-6 text-sm text-slate-400 text-center">Pick two versions to compare.</div>
      ) : (
        <div className="space-y-3">
          {SECTIONS.map(s => {
            const a = String(data.a?.[s.key] || '');
            const b = String(data.b?.[s.key] || '');
            if (!a && !b) return null;
            const { left, right } = lineDiff(a, b);
            return (
              <div key={s.key} className="rounded-xl border border-slate-700 bg-slate-900/40">
                <div className="px-4 py-2 border-b border-slate-800 text-xs uppercase tracking-wide text-slate-400 flex items-center gap-1.5">
                  <s.icon className="h-3.5 w-3.5" /> {s.label}
                </div>
                <div className="grid grid-cols-2 divide-x divide-slate-800 font-mono text-[11px]">
                  <div className="p-3 space-y-0.5">
                    {left.map((l, i) => <div key={i} className={`whitespace-pre-wrap px-1 ${l.cls}`}>{l.line || '\u00A0'}</div>)}
                  </div>
                  <div className="p-3 space-y-0.5">
                    {right.map((l, i) => <div key={i} className={`whitespace-pre-wrap px-1 ${l.cls}`}>{l.line || '\u00A0'}</div>)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TemplatesPanel({ templates, onCloned }: { templates: Template[]; onCloned: () => void }) {
  const [cloning, setCloning] = useState<Template | null>(null);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {templates.map(t => (
          <div key={t.id} className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs px-2 py-0.5 rounded bg-blue-500/20 text-blue-700 border border-blue-500/30 uppercase">{t.sector}</span>
                  {t.is_system && <span className="text-[10px] text-gray-400">System</span>}
                </div>
                <div className="text-sm font-medium text-gray-900 mt-1">{t.name}</div>
                <div className="text-xs text-gray-500 mt-1">{t.description}</div>
                <div className="text-[11px] text-gray-400 mt-2">{t.clause_count} clause(s)</div>
              </div>
              <button onClick={() => setCloning(t)} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs">Clone</button>
            </div>
          </div>
        ))}
      </div>
      {cloning && (
        <SimpleModal title={`Clone "${cloning.name}"`} onClose={() => setCloning(null)}>
          <CloneForm template={cloning} onCloned={(id) => { setCloning(null); onCloned(); }} />
        </SimpleModal>
      )}
    </div>
  );
}

interface Attestation {
  id: number;
  tenant_id: number;
  charter_id?: number | null;
  period_year: number;
  attested_by_id: number;
  attested_by_name?: string | null;
  role_title?: string | null;
  declarations: Record<string, boolean>;
  impairments_disclosed?: string | null;
  digital_signature: string;
  signed_at?: string | null;
  status: string;
  notes?: string | null;
}
interface AttestationsResponse {
  attestations: Attestation[];
  total: number;
  current_year: number;
  current_year_filed: boolean;
  overdue: boolean;
}
function AttestationsPanel({ data, onFile }: { data?: AttestationsResponse; onFile: () => void }) {
  const rows: Attestation[] = data?.attestations || [];
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-xl border border-slate-700 bg-slate-900/40 p-4">
        <div>
          <div className="text-xs text-slate-400">Current period</div>
          <div className="text-lg text-white">{data?.current_year || new Date().getFullYear()}</div>
          <div className="text-xs mt-1">{data?.current_year_filed ? <span className="text-emerald-300">Filed</span> : <span className="text-amber-300">Not yet filed</span>}</div>
        </div>
        <button onClick={onFile} className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm flex items-center gap-1.5">
          <ClipboardCheck className="h-4 w-4" /> File attestation
        </button>
      </div>
      <div className="rounded-xl border border-slate-700 bg-slate-900/40 divide-y divide-slate-800">
        {rows.length === 0 && <div className="p-6 text-center text-sm text-slate-500">No attestations on file.</div>}
        {rows.map(r => (
          <div key={r.id} className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-sm text-white">{r.period_year} — {r.attested_by_name} <span className="text-slate-500">({r.role_title})</span></div>
                <div className="text-xs text-slate-400 mt-0.5">Signed {r.signed_at && new Date(r.signed_at).toLocaleString()}</div>
                {r.impairments_disclosed && <div className="text-xs text-amber-300 mt-1">Impairments disclosed: {r.impairments_disclosed}</div>}
                <div className="mt-2 inline-flex items-center gap-2 rounded-md border border-emerald-500/20 bg-emerald-500/5 px-2 py-1">
                  <span className="text-[10px] uppercase tracking-wider text-black">Signature</span>
                  <span className="font-mono text-[11px] text-black break-all">{r.digital_signature}</span>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] border border-emerald-500/30 bg-emerald-500/10 text-emerald-300">{r.status}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- Modal helpers ----

function SimpleModal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-xl rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <h3 className="text-base font-semibold text-white">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="h-5 w-5" /></button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

function NewVersionModal({ charters, templates, onClose, onCreated }: { charters: Charter[]; templates: Template[]; onClose: () => void; onCreated: (id: number) => void }) {
  const [mode, setMode] = useState<'blank' | 'parent' | 'template' | 'ai'>('parent');
  const [parentId, setParentId] = useState<number | ''>(charters.find(c => c.status === 'approved')?.id || charters[0]?.id || '');
  const [templateId, setTemplateId] = useState<number | ''>('');
  const [version, setVersion] = useState('');
  const [changeReason, setChangeReason] = useState('');
  const [ai, setAi] = useState({ organization_name: '', industry: '', regulatory_scope: '' });
  const [loading, setLoading] = useState(false);
  const [aiPreview, setAiPreview] = useState<(Partial<Charter> & { clauses?: Array<Partial<Clause>>; message?: string }) | null>(null);
  const [aiMessage, setAiMessage] = useState<string | null>(null);

  async function submit() {
    setLoading(true);
    try {
      let res;
      if (mode === 'template' && templateId) {
        res = await auditApi.charter.cloneTemplate(Number(templateId), { version: version || '1.0', change_reason: changeReason });
      } else if (mode === 'ai') {
        const payload: Record<string, unknown> = { ...ai, template_id: templateId || undefined };
        const draft = aiPreview || (await auditApi.charter.aiGenerate(payload)).data;
        res = await auditApi.charter.create({
          version: version || '1.0', change_reason: changeReason || 'AI-drafted version',
          mission: draft.mission, authority: draft.authority,
          independence_objectivity: draft.independence_objectivity,
          scope_of_work: draft.scope_of_work, accountability: draft.accountability,
          standards: draft.standards,
          template_id: templateId || undefined,
          clauses: Array.isArray(draft.clauses) ? draft.clauses : undefined,
        });
      } else if (mode === 'parent' && parentId) {
        res = await auditApi.charter.create({ version: version || '1.0', change_reason: changeReason, parent_charter_id: Number(parentId) });
      } else {
        res = await auditApi.charter.create({ version: version || '1.0', change_reason: changeReason });
      }
      onCreated(res.data.id);
    } catch (e) {
      alert(`Failed: ${errMsg(e)}`);
    } finally {
      setLoading(false);
    }
  }

  async function previewAi() {
    setLoading(true); setAiMessage(null);
    try {
      const draft = (await auditApi.charter.aiGenerate({ ...ai, template_id: templateId || undefined })).data;
      setAiPreview(draft);
      if (draft.message) setAiMessage(draft.message);
    } catch (e) {
      setAiMessage(`AI preview failed: ${errMsg(e)}`);
    } finally { setLoading(false); }
  }

  return (
    <SimpleModal title="New charter version" onClose={onClose}>
      <div className="space-y-3">
        <div className="grid grid-cols-4 gap-1 text-xs">
          {(['parent', 'blank', 'template', 'ai'] as const).map(m => (
            <button key={m} onClick={() => setMode(m)} className={`px-2 py-2 rounded-lg border ${mode === m ? 'border-blue-500 bg-blue-500/10 text-blue-700' : 'border-slate-700 text-slate-600 hover:text-slate-900'}`}>
              {m === 'parent' ? 'From version' : m === 'template' ? 'From template' : m === 'ai' ? 'AI draft' : 'Blank'}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-slate-400">Version label</label>
            <input className={inputCls} value={version} onChange={e => setVersion(e.target.value)} placeholder="e.g. 2.0" />
          </div>
          <div>
            <label className="text-xs text-slate-400">Change reason</label>
            <input className={inputCls} value={changeReason} onChange={e => setChangeReason(e.target.value)} placeholder="What changed?" />
          </div>
        </div>
        {mode === 'parent' && (
          <div>
            <label className="text-xs text-slate-400">Copy from</label>
            <select className={inputCls} value={parentId} onChange={e => setParentId(Number(e.target.value) || '')}>
              <option value="">Select version…</option>
              {charters.map(c => <option key={c.id} value={c.id}>v{c.version} ({c.status})</option>)}
            </select>
          </div>
        )}
        {(mode === 'template' || mode === 'ai') && (
          <div>
            <label className="text-xs text-slate-400">Template{mode === 'ai' && ' (optional seed)'}</label>
            <select className={inputCls} value={templateId} onChange={e => setTemplateId(Number(e.target.value) || '')}>
              <option value="">— None —</option>
              {templates.map(t => <option key={t.id} value={t.id}>{t.sector.toUpperCase()} · {t.name}</option>)}
            </select>
          </div>
        )}
        {mode === 'ai' && (
          <>
            <div className="grid grid-cols-3 gap-2">
              <input className={inputCls} placeholder="Organization name" value={ai.organization_name} onChange={e => setAi({ ...ai, organization_name: e.target.value })} />
              <input className={inputCls} placeholder="Industry" value={ai.industry} onChange={e => setAi({ ...ai, industry: e.target.value })} />
              <input className={inputCls} placeholder="Regulatory scope" value={ai.regulatory_scope} onChange={e => setAi({ ...ai, regulatory_scope: e.target.value })} />
            </div>
            <button onClick={previewAi} disabled={loading} className="flex items-center gap-1 text-xs text-purple-300 hover:text-purple-200">
              <Sparkles className="h-3.5 w-3.5" /> Preview AI draft
            </button>
            {aiMessage && <div className="text-[11px] text-amber-300">{aiMessage}</div>}
            {aiPreview && (
              <div className="max-h-48 overflow-y-auto rounded border border-slate-700 bg-slate-900/40 p-2 text-[11px] text-slate-300 space-y-1.5">
                {SECTIONS.map(s => {
                  const v = aiPreview[s.key];
                  return v ? <div key={s.key}><b className="text-slate-400">{s.label}:</b> {String(v)}</div> : null;
                })}
              </div>
            )}
          </>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-slate-400 hover:text-white">Cancel</button>
          <button onClick={submit} disabled={loading} className="flex items-center gap-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-sm">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Create version
          </button>
        </div>
      </div>
    </SimpleModal>
  );
}

function SubmitForm({ onSubmit, pending }: { onSubmit: (notes: string) => void; pending: boolean }) {
  const [notes, setNotes] = useState('');
  return (
    <div className="space-y-3">
      <div className="text-sm text-slate-300">A committee approval request will be created. The chair / vice-chair / secretary will sign off in the Audit Committee module.</div>
      <textarea className={inputCls + ' resize-none'} rows={3} placeholder="Notes for the committee (optional)" value={notes} onChange={e => setNotes(e.target.value)} />
      <div className="flex justify-end">
        <button disabled={pending} onClick={() => onSubmit(notes)} className="flex items-center gap-1 px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white rounded-lg text-sm">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Submit
        </button>
      </div>
    </div>
  );
}

function ClauseForm({ onSubmit, pending }: { onSubmit: (d: Partial<Clause>) => void; pending: boolean }) {
  const [f, setF] = useState<{ clause_code: string; section: CharterSectionKey; title: string; body: string; order_index: number }>({ clause_code: '', section: SECTIONS[0].key, title: '', body: '', order_index: 0 });
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <input className={inputCls} placeholder="Clause code (e.g. 1.1)" value={f.clause_code} onChange={e => setF({ ...f, clause_code: e.target.value })} />
        <select className={inputCls} value={f.section} onChange={e => setF({ ...f, section: e.target.value as CharterSectionKey })}>
          {SECTIONS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
      </div>
      <input className={inputCls} placeholder="Title" value={f.title} onChange={e => setF({ ...f, title: e.target.value })} />
      <textarea className={inputCls + ' resize-none'} rows={3} placeholder="Body" value={f.body} onChange={e => setF({ ...f, body: e.target.value })} />
      <div className="flex justify-end">
        <button disabled={pending || !f.clause_code} onClick={() => onSubmit(f)} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-sm">
          {pending ? 'Adding…' : 'Add clause'}
        </button>
      </div>
    </div>
  );
}

function LinkForm({ clauseId, onLinked }: { clauseId: number; onLinked: () => void }) {
  const [type, setType] = useState<'engagement' | 'plan'>('engagement');
  const [id, setId] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: engagementsData } = useQuery({
    queryKey: ['engagements-for-link'],
    queryFn: () => auditApi.engagements.getAll().then(r => r.data?.engagements || r.data || []),
  });
  const { data: plansData } = useQuery({
    queryKey: ['plans-for-link'],
    queryFn: () => auditApi.plans.getAll().then(r => r.data?.plans || r.data || []),
  });

  async function go() {
    setPending(true); setError(null);
    try {
      const payload: { engagement_id?: number; plan_id?: number } = type === 'engagement' ? { engagement_id: Number(id) } : { plan_id: Number(id) };
      await auditApi.charter.linkClause(clauseId, payload);
      onLinked();
    } catch (e) { setError(errMsg(e)); }
    finally { setPending(false); }
  }

  const opts: Array<{ id: number; title?: string; name?: string }> = type === 'engagement' ? (engagementsData || []) : (plansData || []);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <select className={inputCls} value={type} onChange={e => { setType(e.target.value as 'engagement' | 'plan'); setId(''); }}>
          <option value="engagement">Engagement</option>
          <option value="plan">Audit Plan</option>
        </select>
        <select className={inputCls} value={id} onChange={e => setId(e.target.value)}>
          <option value="">Select…</option>
          {opts.map((o) => <option key={o.id} value={o.id}>#{o.id} · {o.title || o.name}</option>)}
        </select>
      </div>
      {error && <div className="text-xs text-rose-300">{error}</div>}
      <div className="flex justify-end">
        <button disabled={pending || !id} onClick={go} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-sm">
          {pending ? 'Linking…' : 'Link'}
        </button>
      </div>
    </div>
  );
}

function CloneForm({ template, onCloned }: { template: Template; onCloned: (id: number) => void }) {
  const [version, setVersion] = useState('1.0');
  const [reason, setReason] = useState(`Cloned from "${template.name}"`);
  const [pending, setPending] = useState(false);
  async function go() {
    setPending(true);
    try {
      const r = await auditApi.charter.cloneTemplate(template.id, { version, change_reason: reason });
      onCloned(r.data.id);
    } catch (e) { alert(errMsg(e)); }
    finally { setPending(false); }
  }
  return (
    <div className="space-y-3">
      <div className="text-xs text-slate-400">A new draft version will be created using this template&apos;s sections and clauses.</div>
      <input className={inputCls} placeholder="Version label" value={version} onChange={e => setVersion(e.target.value)} />
      <input className={inputCls} placeholder="Change reason" value={reason} onChange={e => setReason(e.target.value)} />
      <div className="flex justify-end">
        <button disabled={pending} onClick={go} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-sm">
          {pending ? 'Cloning…' : 'Clone to new version'}
        </button>
      </div>
    </div>
  );
}

function AttestationModal({ onClose, onSubmitted, charterId }: { onClose: () => void; onSubmitted: () => void; charterId?: number }) {
  const [year, setYear] = useState(new Date().getFullYear());
  const [role, setRole] = useState('Chief Audit Executive');
  const [decl, setDecl] = useState({
    organizational_independence: false,
    no_operational_responsibility: false,
    free_from_interference: false,
    objective_in_judgments: false,
    no_personal_conflicts: false,
  });
  const [impair, setImpair] = useState('');
  const [signature, setSignature] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allChecked = Object.values(decl).every(Boolean);

  async function go() {
    setPending(true); setError(null);
    try {
      await auditApi.charter.createAttestation({
        period_year: Number(year), role_title: role, declarations: decl,
        impairments_disclosed: impair, digital_signature: signature, charter_id: charterId,
      });
      onSubmitted();
    } catch (e) { setError(errMsg(e)); }
    finally { setPending(false); }
  }
  return (
    <SimpleModal title="File Independence Attestation" onClose={onClose}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-slate-400">Period year</label>
            <input type="number" className={inputCls} value={year} onChange={e => setYear(Number(e.target.value))} />
          </div>
          <div>
            <label className="text-xs text-slate-400">Role title</label>
            <input className={inputCls} value={role} onChange={e => setRole(e.target.value)} />
          </div>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-3 space-y-2">
          <div className="text-xs text-slate-400 mb-1">I attest that:</div>
          {([
            ['organizational_independence', 'Internal Audit is organisationally independent.'],
            ['no_operational_responsibility', 'I have no operational responsibility for activities audited.'],
            ['free_from_interference', 'Internal Audit is free from undue interference.'],
            ['objective_in_judgments', 'I remained objective in audit judgments during the period.'],
            ['no_personal_conflicts', 'I have no undisclosed personal conflicts of interest.'],
          ] as const).map(([k, label]) => (
            <label key={k} className="flex items-start gap-2 text-xs text-slate-300">
              <input type="checkbox" className="mt-0.5" checked={decl[k as keyof typeof decl]} onChange={e => setDecl(d => ({ ...d, [k]: e.target.checked }))} />
              <span>{label}</span>
            </label>
          ))}
        </div>
        <div>
          <label className="text-xs text-slate-400">Impairments disclosed (if any)</label>
          <textarea className={inputCls + ' resize-none'} rows={2} value={impair} onChange={e => setImpair(e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-slate-400">Digital signature (type your full name to sign)</label>
          <input className={inputCls + ' font-mono'} value={signature} onChange={e => setSignature(e.target.value)} placeholder="e.g. Jane Doe" />
        </div>
        {error && <div className="text-xs text-rose-300">{error}</div>}
        <div className="flex justify-end">
          <button disabled={pending || !allChecked || !signature.trim()} onClick={go} className="flex items-center gap-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-sm">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />} Submit attestation
          </button>
        </div>
      </div>
    </SimpleModal>
  );
}
