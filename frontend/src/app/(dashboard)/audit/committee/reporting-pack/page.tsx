'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { auditApi } from '@/lib/api';
import {
  ArrowLeft, Printer, Download, Loader2, Gavel, AlertTriangle,
  CheckCircle, Calendar, Users, ClipboardCheck, FileText, TrendingUp,
} from 'lucide-react';

const SEV_COLOR: Record<string, string> = {
  critical: 'bg-red-500/20 text-red-300 border-red-500/30',
  high: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  medium: 'bg-amber-100 text-amber-700 border-amber-400',
  low: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
};

export default function ReportingPackPage() {
  const [fy, setFy] = useState<string>('');
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['committee', 'reporting-pack', fy],
    queryFn: () => auditApi.committee.reportingPack(fy ? { fiscal_year: fy } : undefined).then(r => r.data),
  });

  const exportJson = () => {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `audit-committee-reporting-pack-${data.fiscal_year || 'all'}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (isLoading || !data) {
    return (
      <div className="flex h-96 items-center justify-center text-slate-400">
        <Loader2 className="animate-spin" /> <span className="ml-2">Building reporting pack…</span>
      </div>
    );
  }

  const k = data.kpis || {};
  const sev = data.findings_by_severity || {};
  const cov = data.coverage || {};
  const bud = data.budget_vs_actuals || {};

  return (
    <div className="space-y-5 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div>
          <div className="flex items-center gap-2">
            <Gavel size={20} className="text-amber-400" />
            <h1 className="text-xl font-semibold text-white">Audit Committee Reporting Pack</h1>
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Generated {new Date(data.generated_at).toLocaleString()}
            {data.fiscal_year ? ` · FY ${data.fiscal_year}` : ''}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={fy}
            onChange={e => setFy(e.target.value)}
            onBlur={() => refetch()}
            placeholder="Fiscal year (e.g. 2026)"
            className="rounded-md border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-xs text-white"
          />
          <button onClick={() => window.print()} className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-100">
            <Printer size={12} /> Print / PDF
          </button>
          <button onClick={exportJson} className="inline-flex items-center gap-1 rounded-md bg-amber-500/20 px-3 py-1.5 text-xs text-amber-800 hover:bg-amber-500/30">
            <Download size={12} /> Export JSON
          </button>
        </div>
      </div>

      <div className="hidden print:block">
        <h1 className="text-2xl font-bold text-black">Audit Committee Reporting Pack</h1>
        <div className="text-sm text-zinc-700">
          {data.committee?.name || 'Audit Committee'} · Generated {new Date(data.generated_at).toLocaleString()}
          {data.fiscal_year ? ` · FY ${data.fiscal_year}` : ''}
        </div>
        <hr className="my-4" />
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
        <Kpi label="Open findings" value={k.open_findings} icon={<AlertTriangle size={14} className="text-red-400" />} />
        <Kpi label="Closed findings" value={k.closed_findings} icon={<CheckCircle size={14} className="text-green-400" />} />
        <Kpi label="Engagements total" value={k.engagements_total} icon={<FileText size={14} className="text-blue-400" />} />
        <Kpi label="Engagements done" value={k.engagements_completed} icon={<CheckCircle size={14} className="text-emerald-400" />} />
        <Kpi label="In progress" value={k.engagements_in_progress} icon={<TrendingUp size={14} className="text-amber-400" />} />
        <Kpi label="Overdue actions" value={k.overdue_actions} icon={<ClipboardCheck size={14} className="text-orange-400" />} />
        <Kpi label="Pending approvals" value={k.pending_approvals} icon={<Gavel size={14} className="text-purple-400" />} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section title="Findings by severity" icon={<AlertTriangle size={16} className="text-red-400" />}>
          {Object.keys(sev).length === 0 ? (
            <Empty msg="No open findings." />
          ) : (
            <div className="space-y-2">
              {['critical', 'high', 'medium', 'low'].map(s => (
                sev[s] ? (
                  <div key={s} className="flex items-center justify-between">
                    <span className={`rounded-md border px-2 py-0.5 text-xs uppercase ${SEV_COLOR[s] || 'border-slate-700 text-slate-300'}`}>{s}</span>
                    <span className="text-sm font-medium text-white">{sev[s]}</span>
                  </div>
                ) : null
              ))}
            </div>
          )}
        </Section>

        <Section title="Plan coverage" icon={<FileText size={16} className="text-blue-400" />}>
          {!cov.plan_name ? (
            <Empty msg="No plan recorded for this period." />
          ) : (
            <div className="space-y-2 text-sm">
              <Row label="Plan">{cov.plan_name} ({cov.fiscal_year})</Row>
              <Row label="Approval status"><span className="capitalize">{cov.approval_status || 'pending'}</span></Row>
              <Row label="Items">
                {cov.items_completed}/{cov.items_total} completed
                <span className="ml-2 text-xs text-slate-500">({cov.coverage_pct}%)</span>
              </Row>
              <div className="pt-1">
                <div className="h-2 w-full overflow-hidden rounded bg-slate-800">
                  <div className="h-full bg-emerald-500/70" style={{ width: `${Math.min(100, cov.coverage_pct)}%` }} />
                </div>
              </div>
              <Row label="Scheduled">{cov.items_scheduled}</Row>
              <Row label="In progress">{cov.items_in_progress}</Row>
            </div>
          )}
        </Section>

        <Section title="Budget vs actuals" icon={<TrendingUp size={16} className="text-amber-400" />}>
          <div className="space-y-2 text-sm">
            <Row label="Planned days">{bud.planned_days}</Row>
            <Row label="Budget hours">{bud.budget_hours}</Row>
            <Row label="Actual hours">{bud.actual_hours}</Row>
            <Row label="Variance">
              <span className={(bud.variance_pct || 0) > 0 ? 'text-red-400' : 'text-emerald-400'}>
                {bud.variance_pct > 0 ? '+' : ''}{bud.variance_pct}%
              </span>
            </Row>
          </div>
        </Section>

        <Section title="Charter status" icon={<FileText size={16} className="text-purple-400" />}>
          {!data.charter ? (
            <Empty msg="No charter on file." />
          ) : (
            <div className="space-y-2 text-sm">
              <Row label="Title">{data.charter.title} v{data.charter.version}</Row>
              <Row label="Status"><span className="capitalize">{data.charter.status}</span></Row>
              <Row label="Approved">{data.charter.approved_at ? new Date(data.charter.approved_at).toLocaleDateString() : '—'}</Row>
            </div>
          )}
        </Section>
      </div>

      <Section title="Open committee actions" icon={<ClipboardCheck size={16} className="text-amber-400" />}>
        {(data.open_actions || []).length === 0 ? (
          <Empty msg="No open committee actions." />
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-slate-500">
              <tr>
                <th className="py-1 text-left font-normal">Title</th>
                <th className="py-1 text-left font-normal">Owner</th>
                <th className="py-1 text-left font-normal">Due</th>
                <th className="py-1 text-left font-normal">Priority</th>
                <th className="py-1 text-left font-normal">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.open_actions.map((a: any) => {
                const overdue = a.due_date && new Date(a.due_date) < new Date();
                return (
                  <tr key={a.id} className="border-t border-slate-700/60">
                    <td className="py-1.5 text-zinc-200">{a.title}</td>
                    <td className="py-1.5 text-slate-400">{a.owner_name || '—'}</td>
                    <td className={`py-1.5 ${overdue ? 'text-red-400' : 'text-slate-400'}`}>
                      {a.due_date ? new Date(a.due_date).toLocaleDateString() : '—'}
                      {overdue ? ' (overdue)' : ''}
                    </td>
                    <td className="py-1.5 text-slate-400 capitalize">{a.priority}</td>
                    <td className="py-1.5 text-slate-400 capitalize">{a.status}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Section>

      <Section title="Pending approvals" icon={<Gavel size={16} className="text-purple-400" />}>
        {(data.pending_approvals || []).length === 0 ? (
          <Empty msg="Nothing awaiting committee approval." />
        ) : (
          <div className="space-y-2">
            {data.pending_approvals.map((p: any) => (
              <div key={p.id} className="flex items-center justify-between rounded-md border border-slate-700/60 bg-zinc-100 px-3 py-2 text-sm">
                <div>
                  <div className="text-white">{p.target_label || `${p.target_type} #${p.target_id}`}</div>
                  <div className="text-xs text-slate-500">
                    Requested {p.requested_at ? new Date(p.requested_at).toLocaleDateString() : '—'} by {p.requested_by_name || '—'}
                  </div>
                </div>
                <span className="rounded-md border border-amber-400 bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 capitalize">{p.status}</span>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Recent meetings" icon={<Calendar size={16} className="text-blue-400" />}>
        {(data.recent_meetings || []).length === 0 ? (
          <Empty msg="No meetings recorded." />
        ) : (
          <div className="space-y-2">
            {data.recent_meetings.map((m: any) => (
              <Link
                key={m.id}
                href={`/audit/committee/${m.id}`}
                className="block rounded-md border border-slate-700/60 bg-zinc-100 px-3 py-2 text-sm hover:border-slate-700"
              >
                <div className="flex items-center justify-between">
                  <span className="text-white">{m.title}</span>
                  <span className={`rounded-md border px-2 py-0.5 text-xs font-medium capitalize ${
                    m.status === 'completed'   ? 'border-emerald-400 bg-emerald-100 text-emerald-700' :
                    m.status === 'scheduled'   ? 'border-blue-400 bg-blue-100 text-blue-700' :
                    m.status === 'in_progress' ? 'border-amber-400 bg-amber-100 text-amber-700' :
                    m.status === 'cancelled'   ? 'border-red-400 bg-red-100 text-red-700' :
                                                 'border-slate-400 bg-slate-100 text-slate-700'
                  }`}>{m.status?.replace(/_/g, ' ')}</span>
                </div>
                <div className="text-xs text-slate-500">
                  {m.scheduled_at ? new Date(m.scheduled_at).toLocaleString() : 'Unscheduled'} · {m.meeting_type}
                  {m.minutes_approved ? ' · minutes approved' : ''}
                </div>
              </Link>
            ))}
          </div>
        )}
      </Section>

      <div className="flex items-center gap-2 rounded-md border border-slate-700/60 bg-slate-900/40 p-3 text-xs text-slate-400 print:hidden">
        <Users size={12} /> Pack covers: governance, plan coverage, budget, findings, open actions, pending approvals, charter, and recent meetings.
      </div>
    </div>
  );
}

function Kpi({ label, value, icon }: any) {
  return (
    <div className="rounded-lg border border-slate-700/60 bg-slate-900/40 p-3">
      <div className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-slate-500">{icon} {label}</div>
      <div className="mt-1 text-xl font-semibold text-white">{value ?? 0}</div>
    </div>
  );
}

function Section({ title, icon, children }: any) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white print:break-inside-avoid">
      <div className="flex items-center gap-2 border-b border-gray-200 p-3 text-sm font-medium text-gray-900">
        {icon} {title}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function Row({ label, children }: any) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs uppercase tracking-wide text-slate-500">{label}</span>
      <span className="text-zinc-200">{children}</span>
    </div>
  );
}

function Empty({ msg }: any) {
  return <div className="rounded-md border border-dashed border-slate-700/60 p-3 text-center text-xs text-slate-500">{msg}</div>;
}
