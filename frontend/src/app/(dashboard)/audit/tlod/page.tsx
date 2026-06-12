'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { auditApi } from '@/lib/api';
import {
  Shield, ShieldAlert, ShieldCheck, Plus, Loader2, Save, X, AlertTriangle,
  ClipboardCheck, FileText, Calendar, User as UserIcon, Filter,
} from 'lucide-react';

type GapStatus = 'current' | 'stale' | 'missing';

interface FirstLineRow {
  id: number;
  auditable_entity_id: number;
  entity_name?: string;
  period_label?: string;
  control_description: string;
  design_effectiveness: string;
  operating_effectiveness: string;
  evidence_link?: string;
  notes?: string;
  attestation_date?: string;
  submitted_by_name?: string;
}

interface SecondLineRow {
  id: number;
  auditable_entity_id: number;
  entity_name?: string;
  function_type: string;
  risk_rating?: string;
  compliance_status?: string;
  open_issues_count?: number;
  summary?: string;
  last_review_date?: string;
  submitted_by_name?: string;
}

interface ThirdLine {
  engagement_id?: number;
  engagement_title?: string;
  status?: string;
  opinion?: string;
  last_audit_date?: string;
}

interface SummaryRow {
  entity_id: number;
  entity_name: string;
  entity_type: string;
  risk_rating: string;
  first_line: FirstLineRow | null;
  second_line: SecondLineRow | null;
  third_line: ThirdLine | null;
  first_line_status: GapStatus;
  second_line_status: GapStatus;
  third_line_status: GapStatus;
  has_assurance_gap: boolean;
}

interface AuditableEntity {
  id: number;
  name: string;
  entity_type: string;
}

const STATUS_STYLES: Record<GapStatus, { label: string; cls: string; dot: string }> = {
  current: { label: 'Current', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40', dot: 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.7)]' },
  stale: { label: 'Stale', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/40', dot: 'bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.7)]' },
  missing: { label: 'Missing', cls: 'bg-rose-500/15 text-rose-300 border-rose-500/40', dot: 'bg-rose-400 shadow-[0_0_6px_rgba(251,113,133,0.7)]' },
};

function StatusBadge({ status }: { status: GapStatus }) {
  const s = STATUS_STYLES[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${s.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

function fmtDate(v?: string | null) {
  if (!v) return '—';
  try { return new Date(v).toLocaleDateString(); } catch { return v; }
}

export default function TlodPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'overview' | 'first' | 'second' | 'coverage' | 'links'>('overview');
  const [onlyGaps, setOnlyGaps] = useState(false);
  const [showFirstForm, setShowFirstForm] = useState(false);
  const [showSecondForm, setShowSecondForm] = useState(false);
  const [selectedEntityId, setSelectedEntityId] = useState<number | 'all'>('all');

  const summaryQ = useQuery({
    queryKey: ['tlod-summary', onlyGaps],
    queryFn: async () => (await auditApi.tlod.getSummary({ only_gaps: onlyGaps })).data,
  });

  const universeQ = useQuery({
    queryKey: ['audit-universe-min'],
    queryFn: async () => (await auditApi.universe.getAll()).data,
  });

  const firstLineQ = useQuery({
    queryKey: ['tlod-first-line', selectedEntityId],
    queryFn: async () => (await auditApi.tlod.listFirstLine(
      selectedEntityId === 'all' ? {} : { auditable_entity_id: selectedEntityId }
    )).data,
  });

  const secondLineQ = useQuery({
    queryKey: ['tlod-second-line', selectedEntityId],
    queryFn: async () => (await auditApi.tlod.listSecondLine(
      selectedEntityId === 'all' ? {} : { auditable_entity_id: selectedEntityId }
    )).data,
  });

  const summary: SummaryRow[] = summaryQ.data?.items || [];
  const entities: AuditableEntity[] = universeQ.data?.entities || universeQ.data || [];
  const firstLineRows: FirstLineRow[] = firstLineQ.data?.items || [];
  const secondLineRows: SecondLineRow[] = secondLineQ.data?.items || [];

  const coverageStats = useMemo(() => {
    const total = summary.length;
    const gaps = summary.filter(r => r.has_assurance_gap).length;
    const flCurrent = summary.filter(r => r.first_line_status === 'current').length;
    const slCurrent = summary.filter(r => r.second_line_status === 'current').length;
    return { total, gaps, flCurrent, slCurrent };
  }, [summary]);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white flex items-center gap-2">
            <Shield className="h-6 w-6 text-indigo-400" />
            Three Lines of Defense Inputs
          </h1>
          <p className="mt-1 text-sm text-slate-400 max-w-3xl">
            Capture 1st-line management self-assessments and 2nd-line risk &amp; compliance assertions
            against your audit universe entities. The 3rd line (Internal Audit) uses these inputs to
            scope engagements and identify assurance gaps before fieldwork begins.
          </p>
        </div>
      </div>

      {/* Headline tiles */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Tile icon={ClipboardCheck} label="Auditable entities" value={coverageStats.total} tone="slate" />
        <Tile icon={ShieldCheck} label="1st line current" value={coverageStats.flCurrent} tone="green" />
        <Tile icon={ShieldCheck} label="2nd line current" value={coverageStats.slCurrent} tone="green" />
        <Tile icon={ShieldAlert} label="Assurance gaps" value={coverageStats.gaps} tone="red" />
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-700/60 flex gap-1">
        {(['overview', 'first', 'second', 'coverage', 'links'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm border-b-2 transition-colors ${
              tab === t
                ? 'border-indigo-600 text-indigo-400 font-medium'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            {t === 'overview' && '3LoD Overview'}
            {t === 'first' && '1st Line Self-Assessments'}
            {t === 'second' && '2nd Line Assertions'}
            {t === 'coverage' && 'Coverage Map'}
            {t === 'links' && 'Attestation Links'}
          </button>
        ))}
      </div>

      {/* Overview tab — three column per entity */}
      {tab === 'overview' && (
        <div className="space-y-4">
          <TlodConfigEditor />
          <div className="flex items-center gap-2">
            <label className="inline-flex items-center gap-2 text-sm text-slate-200">
              <input type="checkbox" checked={onlyGaps} onChange={e => setOnlyGaps(e.target.checked)} />
              <Filter className="h-4 w-4" /> Only entities with assurance gaps
            </label>
          </div>
          {summaryQ.isLoading && <Loading />}
          {!summaryQ.isLoading && summary.length === 0 && (
            <Empty msg="No auditable entities yet. Add entities to your Audit Universe first." />
          )}
          {summary.map(row => (
            <EntityRow key={row.entity_id} row={row} />
          ))}
        </div>
      )}

      {/* 1st-line tab */}
      {tab === 'first' && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <EntityFilter entities={entities} value={selectedEntityId} onChange={setSelectedEntityId} />
            <button
              onClick={() => setShowFirstForm(true)}
              className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
            >
              <Plus className="h-4 w-4" /> New self-assessment
            </button>
          </div>
          <FirstLineTable
            rows={firstLineRows}
            loading={firstLineQ.isLoading}
            onDelete={async (id) => {
              await auditApi.tlod.deleteFirstLine(id);
              qc.invalidateQueries({ queryKey: ['tlod-first-line'] });
              qc.invalidateQueries({ queryKey: ['tlod-summary'] });
            }}
          />
        </div>
      )}

      {/* 2nd-line tab */}
      {tab === 'second' && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <EntityFilter entities={entities} value={selectedEntityId} onChange={setSelectedEntityId} />
            <button
              onClick={() => setShowSecondForm(true)}
              className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
            >
              <Plus className="h-4 w-4" /> New assertion
            </button>
          </div>
          <SecondLineTable
            rows={secondLineRows}
            loading={secondLineQ.isLoading}
            onDelete={async (id) => {
              await auditApi.tlod.deleteSecondLine(id);
              qc.invalidateQueries({ queryKey: ['tlod-second-line'] });
              qc.invalidateQueries({ queryKey: ['tlod-summary'] });
            }}
          />
        </div>
      )}

      {/* Coverage map */}
      {tab === 'coverage' && (
        <CoverageMap rows={summary} loading={summaryQ.isLoading} />
      )}

      {/* Attestation Links */}
      {tab === 'links' && (
        <AttestationLinksPanel entities={entities} />
      )}

      {showFirstForm && (
        <FirstLineForm
          entities={entities}
          onClose={() => setShowFirstForm(false)}
          onSaved={() => {
            setShowFirstForm(false);
            qc.invalidateQueries({ queryKey: ['tlod-first-line'] });
            qc.invalidateQueries({ queryKey: ['tlod-summary'] });
          }}
        />
      )}
      {showSecondForm && (
        <SecondLineForm
          entities={entities}
          onClose={() => setShowSecondForm(false)}
          onSaved={() => {
            setShowSecondForm(false);
            qc.invalidateQueries({ queryKey: ['tlod-second-line'] });
            qc.invalidateQueries({ queryKey: ['tlod-summary'] });
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Tile({
  icon: Icon, label, value, tone,
}: { icon: typeof Shield; label: string; value: number; tone: 'slate' | 'green' | 'red' }) {
  const toneCls = {
    slate: 'bg-slate-900/40 text-slate-200 border-slate-700/60',
    green: 'bg-green-500/10 text-green-400 border-green-500/30',
    red: 'bg-red-500/10 text-red-400 border-red-500/30',
  }[tone];
  return (
    <div className={`rounded-lg border p-4 ${toneCls}`}>
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide opacity-80">
        <Icon className="h-4 w-4" /> {label}
      </div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
    </div>
  );
}

function Loading() {
  return <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>;
}

function Empty({ msg }: { msg: string }) {
  return <div className="rounded-lg border border-dashed border-slate-700 bg-slate-900/40 p-8 text-center text-sm text-slate-500">{msg}</div>;
}

function EntityFilter({
  entities, value, onChange,
}: { entities: AuditableEntity[]; value: number | 'all'; onChange: (v: number | 'all') => void }) {
  return (
    <select
      className="rounded-md border border-slate-700 px-3 py-1.5 text-sm"
      value={value}
      onChange={e => onChange(e.target.value === 'all' ? 'all' : Number(e.target.value))}
    >
      <option value="all">All entities</option>
      {entities.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
    </select>
  );
}

function EntityRow({ row }: { row: SummaryRow }) {
  return (
    <div className="rounded-lg border border-slate-700/60 bg-slate-900/60">
      <div className="flex items-center justify-between border-b border-slate-700/60 px-4 py-3">
        <div>
          <div className="font-medium text-white">{row.entity_name}</div>
          <div className="text-xs text-slate-500 mt-0.5">
            {row.entity_type} · risk {row.risk_rating}
          </div>
        </div>
        {row.has_assurance_gap && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 text-[11px] font-medium text-amber-400">
            <AlertTriangle className="h-3 w-3" /> Assurance gap
          </span>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-800">
        <LineColumn
          title="1st line · Management"
          status={row.first_line_status}
          body={row.first_line ? (
            <>
              <div className="text-slate-200 line-clamp-2">{row.first_line.control_description}</div>
              <Meta date={row.first_line.attestation_date} who={row.first_line.submitted_by_name} />
              <div className="mt-1 text-[11px] text-slate-500">
                Design: {row.first_line.design_effectiveness} · Operating: {row.first_line.operating_effectiveness}
              </div>
            </>
          ) : null}
        />
        <LineColumn
          title="2nd line · Risk & Compliance"
          status={row.second_line_status}
          body={row.second_line ? (
            <>
              <div className="text-slate-200 line-clamp-2">{row.second_line.summary || '—'}</div>
              <Meta date={row.second_line.last_review_date} who={row.second_line.submitted_by_name} />
              <div className="mt-1 text-[11px] text-slate-500">
                {row.second_line.function_type} · risk {row.second_line.risk_rating || '—'} · open issues {row.second_line.open_issues_count ?? 0}
              </div>
            </>
          ) : null}
        />
        <LineColumn
          title="3rd line · Internal Audit"
          status={row.third_line_status}
          body={row.third_line ? (
            <>
              <div className="text-slate-200 line-clamp-2">{row.third_line.engagement_title || '—'}</div>
              <div className="mt-1 text-[11px] text-slate-500 flex items-center gap-1">
                <Calendar className="h-3 w-3" /> {fmtDate(row.third_line.last_audit_date)} · {row.third_line.status || '—'}
              </div>
              {row.third_line.opinion && (
                <div className="mt-1 text-[11px] text-slate-500">Opinion: {row.third_line.opinion}</div>
              )}
            </>
          ) : null}
        />
      </div>
    </div>
  );
}

function LineColumn({ title, status, body }: { title: string; status: GapStatus; body: React.ReactNode }) {
  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-medium text-slate-200 uppercase tracking-wide">{title}</div>
        <StatusBadge status={status} />
      </div>
      <div className="text-sm">
        {body || <div className="text-slate-400 italic">No input recorded</div>}
      </div>
    </div>
  );
}

function Meta({ date, who }: { date?: string | null; who?: string | null }) {
  return (
    <div className="mt-1 text-[11px] text-slate-500 flex items-center gap-2">
      <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" /> {fmtDate(date)}</span>
      {who && <span className="inline-flex items-center gap-1"><UserIcon className="h-3 w-3" /> {who}</span>}
    </div>
  );
}

function FirstLineTable({ rows, loading, onDelete }: { rows: FirstLineRow[]; loading: boolean; onDelete: (id: number) => void }) {
  if (loading) return <Loading />;
  if (!rows.length) return <Empty msg="No 1st-line self-assessments recorded yet." />;
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-700/60 bg-slate-900/60">
      <table className="min-w-full divide-y divide-slate-700/60 text-sm">
        <thead className="bg-slate-900/40 text-xs text-slate-400 uppercase tracking-wide">
          <tr>
            <th className="px-3 py-2 text-left">Entity</th>
            <th className="px-3 py-2 text-left">Control</th>
            <th className="px-3 py-2 text-left">Design</th>
            <th className="px-3 py-2 text-left">Operating</th>
            <th className="px-3 py-2 text-left">Date</th>
            <th className="px-3 py-2 text-left">By</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {rows.map(r => (
            <tr key={r.id}>
              <td className="px-3 py-2 font-medium text-slate-100">{r.entity_name}</td>
              <td className="px-3 py-2 text-slate-200 max-w-md truncate" title={r.control_description}>{r.control_description}</td>
              <td className="px-3 py-2">{r.design_effectiveness}</td>
              <td className="px-3 py-2">{r.operating_effectiveness}</td>
              <td className="px-3 py-2">{fmtDate(r.attestation_date)}</td>
              <td className="px-3 py-2 text-slate-400">{r.submitted_by_name || '—'}</td>
              <td className="px-3 py-2 text-right">
                <button onClick={() => onDelete(r.id)} className="text-xs text-red-400 hover:underline">Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SecondLineTable({ rows, loading, onDelete }: { rows: SecondLineRow[]; loading: boolean; onDelete: (id: number) => void }) {
  if (loading) return <Loading />;
  if (!rows.length) return <Empty msg="No 2nd-line assertions recorded yet." />;
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-700/60 bg-slate-900/60">
      <table className="min-w-full divide-y divide-slate-700/60 text-sm">
        <thead className="bg-slate-900/40 text-xs text-slate-400 uppercase tracking-wide">
          <tr>
            <th className="px-3 py-2 text-left">Entity</th>
            <th className="px-3 py-2 text-left">Function</th>
            <th className="px-3 py-2 text-left">Risk</th>
            <th className="px-3 py-2 text-left">Compliance</th>
            <th className="px-3 py-2 text-left">Open issues</th>
            <th className="px-3 py-2 text-left">Reviewed</th>
            <th className="px-3 py-2 text-left">By</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {rows.map(r => (
            <tr key={r.id}>
              <td className="px-3 py-2 font-medium text-slate-100">{r.entity_name}</td>
              <td className="px-3 py-2">{r.function_type}</td>
              <td className="px-3 py-2">{r.risk_rating || '—'}</td>
              <td className="px-3 py-2">{r.compliance_status || '—'}</td>
              <td className="px-3 py-2">{r.open_issues_count ?? 0}</td>
              <td className="px-3 py-2">{fmtDate(r.last_review_date)}</td>
              <td className="px-3 py-2 text-slate-400">{r.submitted_by_name || '—'}</td>
              <td className="px-3 py-2 text-right">
                <button onClick={() => onDelete(r.id)} className="text-xs text-red-400 hover:underline">Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CoverageMap({ rows, loading }: { rows: SummaryRow[]; loading: boolean }) {
  if (loading) return <Loading />;
  if (!rows.length) return <Empty msg="No auditable entities to map." />;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-slate-700/60 bg-slate-900/40 px-3 py-2 text-[11px] text-slate-400">
        <span className="uppercase tracking-wider text-slate-500">Legend</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.7)]" />Current</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.7)]" />Stale</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-rose-400 shadow-[0_0_6px_rgba(251,113,133,0.7)]" />Missing</span>
        <span className="ml-auto inline-flex items-center gap-1.5 text-slate-500">Gap = at least one line missing or stale</span>
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-700/60 bg-slate-900/60">
      <table className="min-w-full divide-y divide-slate-700/60 text-sm">
        <thead className="bg-slate-900/40 text-xs text-slate-400 uppercase tracking-wide">
          <tr>
            <th className="px-3 py-2 text-left">Auditable entity</th>
            <th className="px-3 py-2 text-center">1st line</th>
            <th className="px-3 py-2 text-center">2nd line</th>
            <th className="px-3 py-2 text-center">3rd line</th>
            <th className="px-3 py-2 text-center">Gap</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {rows.map(r => (
            <tr key={r.entity_id}>
              <td className="px-3 py-2">
                <div className="font-medium text-slate-100">{r.entity_name}</div>
                <div className="text-[11px] text-slate-500">{r.entity_type}</div>
              </td>
              <td className="px-3 py-2 text-center"><StatusBadge status={r.first_line_status} /></td>
              <td className="px-3 py-2 text-center"><StatusBadge status={r.second_line_status} /></td>
              <td className="px-3 py-2 text-center"><StatusBadge status={r.third_line_status} /></td>
              <td className="px-3 py-2 text-center">
                {r.has_assurance_gap
                  ? <span className="text-amber-400 text-xs font-medium">Yes</span>
                  : <span className="text-green-400 text-xs">No</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------------

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-lg bg-slate-900/60 shadow-xl">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-base font-semibold text-white">{title}</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-200"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-200">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function FirstLineForm({ entities, onClose, onSaved }: { entities: AuditableEntity[]; onClose: () => void; onSaved: () => void }) {
  const [entityId, setEntityId] = useState<number | ''>('');
  const [controlDescription, setControlDescription] = useState('');
  const [design, setDesign] = useState('effective');
  const [operating, setOperating] = useState('effective');
  const [periodLabel, setPeriodLabel] = useState('');
  const [evidenceLink, setEvidenceLink] = useState('');
  const [notes, setNotes] = useState('');
  const [attestationDate, setAttestationDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!entityId || !controlDescription.trim()) {
      setError('Entity and control description are required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await auditApi.tlod.createFirstLine({
        auditable_entity_id: entityId,
        control_description: controlDescription,
        design_effectiveness: design,
        operating_effectiveness: operating,
        period_label: periodLabel || undefined,
        evidence_link: evidenceLink || undefined,
        notes: notes || undefined,
        attestation_date: new Date(attestationDate).toISOString(),
      });
      onSaved();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to save';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="New 1st-line self-assessment" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Auditable entity">
          <select
            className="w-full rounded-md border border-slate-700 px-3 py-1.5 text-sm"
            value={entityId}
            onChange={e => setEntityId(e.target.value ? Number(e.target.value) : '')}
          >
            <option value="">Select entity…</option>
            {entities.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </Field>
        <Field label="Period (e.g. Q1 2026)">
          <input className="w-full rounded-md border border-slate-700 px-3 py-1.5 text-sm" value={periodLabel} onChange={e => setPeriodLabel(e.target.value)} />
        </Field>
        <Field label="Control description">
          <textarea className="w-full rounded-md border border-slate-700 px-3 py-1.5 text-sm" rows={3} value={controlDescription} onChange={e => setControlDescription(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Design effectiveness">
            <select className="w-full rounded-md border border-slate-700 px-3 py-1.5 text-sm" value={design} onChange={e => setDesign(e.target.value)}>
              <option value="effective">Effective</option>
              <option value="partial">Partially effective</option>
              <option value="ineffective">Ineffective</option>
            </select>
          </Field>
          <Field label="Operating effectiveness">
            <select className="w-full rounded-md border border-slate-700 px-3 py-1.5 text-sm" value={operating} onChange={e => setOperating(e.target.value)}>
              <option value="effective">Effective</option>
              <option value="partial">Partially effective</option>
              <option value="ineffective">Ineffective</option>
            </select>
          </Field>
        </div>
        <Field label="Evidence link">
          <input className="w-full rounded-md border border-slate-700 px-3 py-1.5 text-sm" value={evidenceLink} onChange={e => setEvidenceLink(e.target.value)} placeholder="https://…" />
        </Field>
        <Field label="Attestation date">
          <input type="date" className="w-full rounded-md border border-slate-700 px-3 py-1.5 text-sm" value={attestationDate} onChange={e => setAttestationDate(e.target.value)} />
        </Field>
        <Field label="Notes">
          <textarea className="w-full rounded-md border border-slate-700 px-3 py-1.5 text-sm" rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
        </Field>
        {error && <div className="text-xs text-red-400">{error}</div>}
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="rounded-md border border-slate-700 px-3 py-1.5 text-sm">Cancel</button>
          <button onClick={submit} disabled={saving} className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-700 disabled:opacity-60">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
          </button>
        </div>
      </div>
    </Modal>
  );
}

function SecondLineForm({ entities, onClose, onSaved }: { entities: AuditableEntity[]; onClose: () => void; onSaved: () => void }) {
  const [entityId, setEntityId] = useState<number | ''>('');
  const [functionType, setFunctionType] = useState('risk');
  const [riskRating, setRiskRating] = useState('medium');
  const [complianceStatus, setComplianceStatus] = useState('compliant');
  const [openIssues, setOpenIssues] = useState(0);
  const [summary, setSummary] = useState('');
  const [reviewDate, setReviewDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!entityId) {
      setError('Entity is required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await auditApi.tlod.createSecondLine({
        auditable_entity_id: entityId,
        function_type: functionType,
        risk_rating: riskRating,
        compliance_status: complianceStatus,
        open_issues_count: openIssues,
        summary: summary || undefined,
        last_review_date: new Date(reviewDate).toISOString(),
      });
      onSaved();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to save';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="New 2nd-line assertion" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Auditable entity">
          <select className="w-full rounded-md border border-slate-700 px-3 py-1.5 text-sm" value={entityId} onChange={e => setEntityId(e.target.value ? Number(e.target.value) : '')}>
            <option value="">Select entity…</option>
            {entities.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Function">
            <select className="w-full rounded-md border border-slate-700 px-3 py-1.5 text-sm" value={functionType} onChange={e => setFunctionType(e.target.value)}>
              <option value="risk">Risk</option>
              <option value="compliance">Compliance</option>
              <option value="security">Security</option>
            </select>
          </Field>
          <Field label="Risk rating">
            <select className="w-full rounded-md border border-slate-700 px-3 py-1.5 text-sm" value={riskRating} onChange={e => setRiskRating(e.target.value)}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Compliance status">
            <select className="w-full rounded-md border border-slate-700 px-3 py-1.5 text-sm" value={complianceStatus} onChange={e => setComplianceStatus(e.target.value)}>
              <option value="compliant">Compliant</option>
              <option value="partial">Partially compliant</option>
              <option value="non_compliant">Non-compliant</option>
            </select>
          </Field>
          <Field label="Open issues">
            <input type="number" min={0} className="w-full rounded-md border border-slate-700 px-3 py-1.5 text-sm" value={openIssues} onChange={e => setOpenIssues(Number(e.target.value))} />
          </Field>
        </div>
        <Field label="Last review date">
          <input type="date" className="w-full rounded-md border border-slate-700 px-3 py-1.5 text-sm" value={reviewDate} onChange={e => setReviewDate(e.target.value)} />
        </Field>
        <Field label="Summary">
          <textarea className="w-full rounded-md border border-slate-700 px-3 py-1.5 text-sm" rows={3} value={summary} onChange={e => setSummary(e.target.value)} />
        </Field>
        {error && <div className="text-xs text-red-400">{error}</div>}
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="rounded-md border border-slate-700 px-3 py-1.5 text-sm">Cancel</button>
          <button onClick={submit} disabled={saving} className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-700 disabled:opacity-60">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
          </button>
        </div>
      </div>
    </Modal>
  );
}

function TlodConfigEditor() {
  const qc = useQueryClient();
  const cfgQ = useQuery({
    queryKey: ['tlod-config'],
    queryFn: async () => (await auditApi.tlod.getConfig()).data as {
      first_line_stale_days: number;
      second_line_stale_days: number;
      third_line_stale_days: number;
    },
  });
  const [open, setOpen] = useState(false);
  const [fl, setFl] = useState<number>(180);
  const [sl, setSl] = useState<number>(365);
  const [tl, setTl] = useState<number>(730);
  useEffect(() => {
    if (cfgQ.data) {
      setFl(cfgQ.data.first_line_stale_days);
      setSl(cfgQ.data.second_line_stale_days);
      setTl(cfgQ.data.third_line_stale_days);
    }
  }, [cfgQ.data]);
  const save = useMutation({
    mutationFn: () => auditApi.tlod.updateConfig({
      first_line_stale_days: fl,
      second_line_stale_days: sl,
      third_line_stale_days: tl,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tlod-config'] });
      qc.invalidateQueries({ queryKey: ['tlod-summary'] });
      qc.invalidateQueries({ queryKey: ['audit-tlod-summary-plans'] });
      setOpen(false);
    },
  });
  return (
    <div className="rounded-lg border border-slate-700/60 bg-slate-900/60 p-3 text-sm">
      <div className="flex items-center justify-between">
        <div className="text-slate-200">
          <span className="font-medium">Staleness thresholds (days):</span>{' '}
          1st line {cfgQ.data?.first_line_stale_days ?? '…'} · 2nd line {cfgQ.data?.second_line_stale_days ?? '…'} · 3rd line {cfgQ.data?.third_line_stale_days ?? '…'}
        </div>
        <button onClick={() => setOpen(o => !o)} className="text-xs text-indigo-400 hover:underline">
          {open ? 'Cancel' : 'Configure'}
        </button>
      </div>
      {open && (
        <div className="mt-3 grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <label className="text-xs text-slate-400 flex flex-col gap-1">
            1st line stale after (days)
            <input type="number" min={1} value={fl} onChange={e => setFl(Number(e.target.value))} className="rounded-md border border-slate-700 px-2 py-1 text-sm" />
          </label>
          <label className="text-xs text-slate-400 flex flex-col gap-1">
            2nd line stale after (days)
            <input type="number" min={1} value={sl} onChange={e => setSl(Number(e.target.value))} className="rounded-md border border-slate-700 px-2 py-1 text-sm" />
          </label>
          <label className="text-xs text-slate-400 flex flex-col gap-1">
            3rd line stale after (days)
            <input type="number" min={1} value={tl} onChange={e => setTl(Number(e.target.value))} className="rounded-md border border-slate-700 px-2 py-1 text-sm" />
          </label>
          <button
            onClick={() => save.mutate()}
            disabled={save.isPending}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            Save thresholds
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Attestation Links (token-based 1st-line intake)
// ---------------------------------------------------------------------------

interface AttestationLink {
  id: number;
  auditable_entity_id: number;
  entity_name?: string;
  access_token: string;
  owner_name?: string;
  owner_email?: string;
  period_label?: string;
  instructions?: string;
  max_uses?: number | null;
  use_count: number;
  status: string;
  expires_at?: string | null;
  last_used_at?: string | null;
  last_reminder_sent_at?: string | null;
}

function AttestationLinksPanel({ entities }: { entities: AuditableEntity[] }) {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [reminderResult, setReminderResult] = useState<string | null>(null);

  const linksQ = useQuery({
    queryKey: ['tlod-attestation-links'],
    queryFn: async () => (await auditApi.tlod.listAttestationLinks()).data,
  });

  const remindMut = useMutation({
    mutationFn: async () => (await auditApi.tlod.sendStaleReminders()).data,
    onSuccess: (data: any) => {
      setReminderResult(
        `${data.reminded_count} reminder(s) recorded for stale entities ` +
        `(threshold ${data.stale_threshold_days}d). ${data.skipped_count} skipped.`
      );
      qc.invalidateQueries({ queryKey: ['tlod-attestation-links'] });
    },
    onError: (err: any) => setReminderResult(err?.response?.data?.detail || 'Reminder run failed'),
  });

  const links: AttestationLink[] = linksQ.data?.items || [];

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-white">
            Business-owner attestation links
          </h2>
          <p className="text-sm text-slate-400 mt-1 max-w-2xl">
            Generate scoped, tokenized links so process owners outside Internal Audit
            can submit 1st-line self-assessments for a specific entity without seeing
            other audit data.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => remindMut.mutate()}
            disabled={remindMut.isPending}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 px-3 py-1.5 text-sm font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-60"
            title="Find entities with stale 1st-line attestations and record a reminder"
          >
            {remindMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4" />}
            Send stale reminders
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
          >
            <Plus className="h-4 w-4" /> New attestation link
          </button>
        </div>
      </div>

      {reminderResult && (
        <div className="rounded border border-indigo-500/40 bg-indigo-500/10 px-3 py-2 text-sm text-indigo-300">
          {reminderResult}
        </div>
      )}

      {linksQ.isLoading && <Loading />}
      {!linksQ.isLoading && links.length === 0 && (
        <Empty msg="No attestation links yet. Create one to invite a business owner." />
      )}

      {links.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-slate-700/60 bg-slate-900/60">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-900/40 text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-3 py-2 text-left">Entity</th>
                <th className="px-3 py-2 text-left">Owner</th>
                <th className="px-3 py-2 text-left">Period</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Uses</th>
                <th className="px-3 py-2 text-left">Expires</th>
                <th className="px-3 py-2 text-left">Last used</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {links.map(link => (
                <AttestationLinkRow key={link.id} link={link} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <CreateAttestationLinkModal
          entities={entities}
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            setShowCreate(false);
            qc.invalidateQueries({ queryKey: ['tlod-attestation-links'] });
          }}
        />
      )}
    </div>
  );
}

function AttestationLinkRow({ link }: { link: AttestationLink }) {
  const qc = useQueryClient();
  const [copied, setCopied] = useState(false);

  const url = useMemo(() => {
    if (typeof window === 'undefined') return `/attest/${link.access_token}`;
    return `${window.location.origin}/attest/${link.access_token}`;
  }, [link.access_token]);

  const revokeMut = useMutation({
    mutationFn: async () => (await auditApi.tlod.revokeAttestationLink(link.id)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tlod-attestation-links'] }),
  });
  const deleteMut = useMutation({
    mutationFn: async () => (await auditApi.tlod.deleteAttestationLink(link.id)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tlod-attestation-links'] }),
  });

  function copy() {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      });
    }
  }

  const statusCls: Record<string, string> = {
    active: 'bg-green-500/10 text-green-400 border-green-500/30',
    revoked: 'bg-slate-700/40 text-slate-400 border-slate-600',
    expired: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  };

  return (
    <tr className="text-sm">
      <td className="px-3 py-2 font-medium text-slate-100">{link.entity_name || `#${link.auditable_entity_id}`}</td>
      <td className="px-3 py-2 text-slate-200">
        <div>{link.owner_name || '—'}</div>
        {link.owner_email && <div className="text-xs text-slate-400">{link.owner_email}</div>}
      </td>
      <td className="px-3 py-2 text-slate-200">{link.period_label || '—'}</td>
      <td className="px-3 py-2">
        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusCls[link.status] || 'bg-slate-700/40 text-slate-400 border-slate-600'}`}>
          {link.status}
        </span>
      </td>
      <td className="px-3 py-2 text-slate-200">
        {link.use_count}{link.max_uses != null ? ` / ${link.max_uses}` : ''}
      </td>
      <td className="px-3 py-2 text-slate-200">{fmtDate(link.expires_at)}</td>
      <td className="px-3 py-2 text-slate-200">{fmtDate(link.last_used_at)}</td>
      <td className="px-3 py-2 text-right">
        <div className="inline-flex items-center gap-2">
          <button
            onClick={copy}
            className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-200 hover:bg-slate-800"
            title={url}
          >
            {copied ? 'Copied!' : 'Copy link'}
          </button>
          {link.status === 'active' && (
            <button
              onClick={() => revokeMut.mutate()}
              disabled={revokeMut.isPending}
              className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-xs text-amber-400 hover:bg-amber-500/20 disabled:opacity-60"
            >
              Revoke
            </button>
          )}
          <button
            onClick={() => {
              if (confirm('Delete this attestation link? Submissions already received will remain.')) {
                deleteMut.mutate();
              }
            }}
            disabled={deleteMut.isPending}
            className="rounded border border-red-500/30 bg-red-500/10 px-2 py-1 text-xs text-red-400 hover:bg-red-500/20 disabled:opacity-60"
          >
            Delete
          </button>
        </div>
      </td>
    </tr>
  );
}

function CreateAttestationLinkModal({
  entities, onClose, onSaved,
}: { entities: AuditableEntity[]; onClose: () => void; onSaved: () => void }) {
  const [entityId, setEntityId] = useState<number | ''>(entities[0]?.id ?? '');
  const [ownerName, setOwnerName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [periodLabel, setPeriodLabel] = useState('');
  const [instructions, setInstructions] = useState('');
  const [expiresDays, setExpiresDays] = useState<number | ''>(30);
  const [maxUses, setMaxUses] = useState<number | ''>('');
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<AttestationLink | null>(null);

  const createMut = useMutation({
    mutationFn: async () => (await auditApi.tlod.createAttestationLink({
      auditable_entity_id: entityId,
      owner_name: ownerName || null,
      owner_email: ownerEmail || null,
      period_label: periodLabel || null,
      instructions: instructions || null,
      expires_days: expiresDays === '' ? null : expiresDays,
      max_uses: maxUses === '' ? null : maxUses,
    })).data,
    onSuccess: (data: AttestationLink) => setCreated(data),
    onError: (err: any) => setError(err?.response?.data?.detail || 'Failed to create link'),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!entityId) {
      setError('Please choose an entity');
      return;
    }
    createMut.mutate();
  }

  const link = created;
  const url = link && typeof window !== 'undefined'
    ? `${window.location.origin}/attest/${link.access_token}`
    : '';

  return (
    <Modal title={created ? 'Attestation link created' : 'New attestation link'} onClose={created ? onSaved : onClose}>
      {!created && (
        <form onSubmit={handleSubmit} className="space-y-3">
          <Field label="Auditable entity">
            <select
              value={entityId}
              onChange={e => setEntityId(e.target.value === '' ? '' : Number(e.target.value))}
              className="w-full rounded border border-slate-700 px-3 py-2 text-sm"
              required
            >
              <option value="">Select an entity…</option>
              {entities.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Owner name">
              <input
                type="text"
                value={ownerName}
                onChange={e => setOwnerName(e.target.value)}
                className="w-full rounded border border-slate-700 px-3 py-2 text-sm"
                placeholder="Jane Smith"
              />
            </Field>
            <Field label="Owner email">
              <input
                type="email"
                value={ownerEmail}
                onChange={e => setOwnerEmail(e.target.value)}
                className="w-full rounded border border-slate-700 px-3 py-2 text-sm"
                placeholder="jane@company.com"
              />
            </Field>
          </div>
          <Field label="Period label (optional)">
            <input
              type="text"
              value={periodLabel}
              onChange={e => setPeriodLabel(e.target.value)}
              className="w-full rounded border border-slate-700 px-3 py-2 text-sm"
              placeholder="Q3 2026"
            />
          </Field>
          <Field label="Instructions to the owner (optional)">
            <textarea
              value={instructions}
              onChange={e => setInstructions(e.target.value)}
              rows={3}
              className="w-full rounded border border-slate-700 px-3 py-2 text-sm"
              placeholder="Please attest to the design and operating effectiveness of your key controls…"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Expires in (days)">
              <input
                type="number"
                min={1}
                value={expiresDays}
                onChange={e => setExpiresDays(e.target.value === '' ? '' : Math.max(1, Number(e.target.value)))}
                className="w-full rounded border border-slate-700 px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Max submissions (blank = unlimited)">
              <input
                type="number"
                min={1}
                value={maxUses}
                onChange={e => setMaxUses(e.target.value === '' ? '' : Math.max(1, Number(e.target.value)))}
                className="w-full rounded border border-slate-700 px-3 py-2 text-sm"
              />
            </Field>
          </div>
          {error && (
            <div className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createMut.isPending}
              className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {createMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Create link
            </button>
          </div>
        </form>
      )}

      {created && (
        <div className="space-y-3">
          <p className="text-sm text-slate-200">
            Share this scoped link with the business owner. They will be able to submit a
            self-assessment for <strong>{created.entity_name}</strong> without logging in.
          </p>
          <div className="rounded border border-slate-700 bg-slate-900/60 p-3 text-xs font-mono break-all text-slate-200">
            {url}
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => {
                if (typeof navigator !== 'undefined' && navigator.clipboard) {
                  navigator.clipboard.writeText(url);
                }
              }}
              className="rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800"
            >
              Copy link
            </button>
            <button
              onClick={onSaved}
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
