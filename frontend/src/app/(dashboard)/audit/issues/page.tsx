'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { auditApi } from '@/lib/api';
import {
  AlertCircle, Zap, CheckCircle, Clock, TrendingUp, Plus, X, Save,
  Loader2, AlertTriangle, ChevronRight, Users, ArrowUp, Shield,
} from 'lucide-react';

const LEVEL_LABELS: Record<number, { label: string; color: string }> = {
  1: { label: 'Level 1 — First Reminder', color: 'text-amber-400' },
  2: { label: 'Level 2 — Manager Escalation', color: 'text-orange-400' },
  3: { label: 'Level 3 — Executive Escalation', color: 'text-red-400' },
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-red-500/20 text-red-400 border-red-500/30',
  high: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  medium: 'bg-yellow-500/20 text-black border-yellow-500/30',
  low: 'bg-green-500/20 text-green-400 border-green-500/30',
};

export default function IssueTrackingPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [filterResolved, setFilterResolved] = useState<boolean | undefined>(false);
  const [form, setForm] = useState({
    issue_title: '', finding_id: '', escalation_level: 1,
    escalation_reason: '', original_due_date: '', extended_due_date: '', notes: '',
  });

  const { data: agingSummary, isLoading: agingLoading } = useQuery({
    queryKey: ['aging-summary'],
    queryFn: () => auditApi.issueTracking.getAgingSummary().then(r => r.data),
  });

  const { data: escalationsData, isLoading } = useQuery({
    queryKey: ['escalations', filterResolved],
    queryFn: () => auditApi.issueTracking.getAll(filterResolved !== undefined ? { resolved: filterResolved } : {}).then(r => r.data?.escalations || []),
  });

  const createMut = useMutation({
    mutationFn: (data: any) => auditApi.issueTracking.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['escalations'] }); qc.invalidateQueries({ queryKey: ['aging-summary'] }); setShowCreate(false); resetForm(); },
  });

  const resolveMut = useMutation({
    mutationFn: (id: number) => auditApi.issueTracking.resolve(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['escalations'] }); qc.invalidateQueries({ queryKey: ['aging-summary'] }); },
  });

  const autoEscalateMut = useMutation({
    mutationFn: () => auditApi.issueTracking.autoEscalate(),
    onSuccess: (res) => { qc.invalidateQueries({ queryKey: ['escalations'] }); qc.invalidateQueries({ queryKey: ['aging-summary'] }); alert(`Auto-escalated ${res.data?.auto_escalated || 0} overdue finding(s).`); },
  });

  const resetForm = () => setForm({ issue_title: '', finding_id: '', escalation_level: 1, escalation_reason: '', original_due_date: '', extended_due_date: '', notes: '' });

  const escalations = escalationsData || [];
  const summary = agingSummary || {};

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Issue Tracking & Escalation</h1>
          <p className="text-slate-400 mt-1">Track overdue findings, manage escalations, and monitor remediation aging</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => autoEscalateMut.mutate()}
            disabled={autoEscalateMut.isPending}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 text-sm transition-all"
          >
            {autoEscalateMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            Auto-Escalate Overdue
          </button>
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm transition-all">
            <Plus className="h-4 w-4" />
            New Escalation
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      {!agingLoading && summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
          {[
            { label: 'Open Findings', value: summary.total_open_findings, color: 'text-white' },
            { label: 'Overdue', value: summary.total_overdue, color: 'text-red-400' },
            { label: 'Critical/High Open', value: (summary.by_severity?.critical?.count || 0) + (summary.by_severity?.high?.count || 0), color: 'text-orange-400' },
            { label: 'Active Escalations', value: summary.active_escalations, color: 'text-amber-400' },
            { label: 'L1 Escalations', value: summary.escalation_breakdown?.level_1, color: 'text-black' },
            { label: 'L2 Escalations', value: summary.escalation_breakdown?.level_2, color: 'text-black' },
            { label: 'L3 Escalations', value: summary.escalation_breakdown?.level_3, color: 'text-black' },
          ].map((s, i) => (
            <div key={i} className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-4 text-center">
              <p className={`text-2xl font-bold ${s.color}`}>{s.value ?? 0}</p>
              <p className="text-xs text-slate-400 mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Overdue Findings Table */}
      {summary?.overdue_findings?.length > 0 && (
        <div className="rounded-xl border border-red-500/20  p-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-400" />
            Overdue Findings — Immediate Attention Required
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-red-500/20">
                <tr>
                  <th className="text-left py-2 px-3 text-xs text-slate-500 font-medium">Finding</th>
                  <th className="text-left py-2 px-3 text-xs text-slate-500 font-medium">Severity</th>
                  <th className="text-left py-2 px-3 text-xs text-slate-500 font-medium">Due Date</th>
                  <th className="text-right py-2 px-3 text-xs text-slate-500 font-medium">Days Overdue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-red-500/10">
                {summary.overdue_findings.slice(0, 10).map((f: any) => (
                  <tr key={f.id} className="hover:bg-red-500/5">
                    <td className="py-2 px-3">
                      {f.finding_number && <span className="text-xs text-slate-500 mr-2">{f.finding_number}</span>}
                      <span className="text-white">{f.title}</span>
                    </td>
                    <td className="py-2 px-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs border ${SEVERITY_COLORS[f.severity] || ''}`}>{f.severity}</span>
                    </td>
                    <td className="py-2 px-3 text-slate-400">{f.due_date ? new Date(f.due_date).toLocaleDateString() : '—'}</td>
                    <td className="py-2 px-3 text-right font-medium text-red-400">{f.days_overdue}d</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Escalations Filter + List */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-lg font-semibold text-white">Escalation Records</h2>
          <div className="flex gap-2 ml-auto">
            {[{ label: 'Active', value: false }, { label: 'Resolved', value: true }, { label: 'All', value: undefined }].map(f => (
              <button
                key={String(f.value)}
                onClick={() => setFilterResolved(f.value)}
                className={`px-3 py-1.5 rounded-lg text-xs transition-all border ${filterResolved === f.value ? 'bg-blue-600 border-blue-500 text-white' : 'border-slate-700 text-slate-400 hover:text-white'}`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-40"><Loader2 className="h-8 w-8 animate-spin text-blue-400" /></div>
        ) : escalations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 rounded-xl border border-slate-700/60 bg-slate-900/60">
            <Shield className="h-10 w-10 text-slate-400 mb-3" />
            <p className="text-slate-400">No escalations {filterResolved === false ? 'active' : filterResolved === true ? 'resolved' : ''}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {escalations.map((e: any) => {
              const levelInfo = LEVEL_LABELS[e.escalation_level] || LEVEL_LABELS[1];
              return (
                <div key={e.id} className={`rounded-xl border ${e.resolved ? 'border-slate-700/40 bg-slate-900/40' : 'border-slate-700/60 bg-slate-900/60'} p-5`}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className={`text-xs font-medium ${levelInfo.color}`}>
                          <ArrowUp className="h-3 w-3 inline mr-1" />{levelInfo.label}
                        </span>
                        {e.finding_severity && (
                          <span className={`px-2 py-0.5 rounded-full text-xs border ${SEVERITY_COLORS[e.finding_severity] || ''}`}>{e.finding_severity}</span>
                        )}
                        {e.resolved && <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">Resolved</span>}
                      </div>
                      <h3 className="font-semibold text-white">{e.issue_title}</h3>
                      {e.finding_number && <p className="text-xs text-slate-500">Finding: {e.finding_number}</p>}
                      {e.escalation_reason && <p className="text-sm text-slate-400 mt-1">{e.escalation_reason}</p>}
                      <div className="flex gap-4 mt-2 text-xs text-slate-500">
                        {e.original_due_date && <span>Due: {new Date(e.original_due_date).toLocaleDateString()}</span>}
                        {e.days_overdue > 0 && <span className="text-red-400">{e.days_overdue}d overdue</span>}
                        {e.escalated_to_name && <span className="flex items-center gap-1"><Users className="h-3 w-3" />{e.escalated_to_name}</span>}
                      </div>
                    </div>
                    {!e.resolved && (
                      <button
                        onClick={() => resolveMut.mutate(e.id)}
                        disabled={resolveMut.isPending}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600/20 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-600/30 text-xs transition-all flex-shrink-0"
                      >
                        <CheckCircle className="h-3.5 w-3.5" />
                        Resolve
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-slate-700">
              <h2 className="text-lg font-semibold text-white">New Escalation</h2>
              <button onClick={() => { setShowCreate(false); resetForm(); }} className="text-slate-400 hover:text-white"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Issue Title *</label>
                <input className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-900/60 text-white text-sm focus:outline-none focus:border-blue-500" value={form.issue_title} onChange={e => setForm(f => ({ ...f, issue_title: e.target.value }))} placeholder="Brief description of the issue" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Escalation Level</label>
                  <select className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-900/60 text-white text-sm focus:outline-none focus:border-blue-500" value={form.escalation_level} onChange={e => setForm(f => ({ ...f, escalation_level: Number(e.target.value) }))}>
                    <option value={1}>Level 1 — First Reminder</option>
                    <option value={2}>Level 2 — Manager</option>
                    <option value={3}>Level 3 — Executive</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Original Due Date</label>
                  <input type="date" className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-900/60 text-white text-sm focus:outline-none focus:border-blue-500" value={form.original_due_date} onChange={e => setForm(f => ({ ...f, original_due_date: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Escalation Reason</label>
                <textarea className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-900/60 text-white text-sm focus:outline-none focus:border-blue-500 resize-none" rows={3} value={form.escalation_reason} onChange={e => setForm(f => ({ ...f, escalation_reason: e.target.value }))} placeholder="Why is this being escalated?" />
              </div>
            </div>
            <div className="flex justify-end gap-3 p-6 border-t border-slate-700">
              <button onClick={() => { setShowCreate(false); resetForm(); }} className="px-4 py-2 rounded-lg border border-slate-700 text-slate-400 hover:text-white text-sm">Cancel</button>
              <button
                onClick={() => createMut.mutate({ issue_title: form.issue_title, finding_id: form.finding_id ? Number(form.finding_id) : undefined, escalation_level: form.escalation_level, escalation_reason: form.escalation_reason, original_due_date: form.original_due_date || undefined, notes: form.notes })}
                disabled={!form.issue_title || createMut.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-sm"
              >
                {createMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Create Escalation
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
