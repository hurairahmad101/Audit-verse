'use client';

import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { auditApi } from '@/lib/api';
import {
  BarChart3, TrendingUp, AlertTriangle, CheckCircle, Clock, RefreshCw,
  RotateCcw, Target, Loader2, ChevronDown, ChevronRight, Calculator,
  Zap, AlertCircle,
} from 'lucide-react';

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#f87171',
  high: '#fb923c',
  medium: '#facc15',
  low: '#34d399',
  observation: '#818cf8',
};

const ROOT_CAUSE_COLORS: Record<string, string> = {
  people: '#818cf8',
  process: '#60a5fa',
  technology: '#fbbf24',
  governance: '#a78bfa',
  uncategorized: '#94a3b8',
};

export default function AnalyticsPage() {
  const [benfordValues, setBenfordValues] = useState('');
  const [outlierValues, setOutlierValues] = useState('');
  const [benfordResult, setBenfordResult] = useState<any>(null);
  const [outlierResult, setOutlierResult] = useState<any>(null);
  const [runningBenford, setRunningBenford] = useState(false);
  const [runningOutlier, setRunningOutlier] = useState(false);

  const { data: summary } = useQuery({
    queryKey: ['analytics-summary'],
    queryFn: () => auditApi.analytics.getSummary().then(r => r.data),
  });

  const { data: trend } = useQuery({
    queryKey: ['findings-trend'],
    queryFn: () => auditApi.analytics.getFindingsTrend({ months: 12 }).then(r => r.data),
  });

  const { data: severity } = useQuery({
    queryKey: ['severity-dist'],
    queryFn: () => auditApi.analytics.getSeverityDistribution().then(r => r.data),
  });

  const { data: rca } = useQuery({
    queryKey: ['root-cause'],
    queryFn: () => auditApi.analytics.getRootCauseAnalysis().then(r => r.data),
  });

  const { data: aging } = useQuery({
    queryKey: ['remediation-aging'],
    queryFn: () => auditApi.analytics.getRemediationAging().then(r => r.data),
  });

  const { data: repeat } = useQuery({
    queryKey: ['repeat-findings'],
    queryFn: () => auditApi.analytics.getRepeatFindings().then(r => r.data),
  });

  const { data: engPerf } = useQuery({
    queryKey: ['engagement-perf'],
    queryFn: () => auditApi.analytics.getEngagementPerformance().then(r => r.data),
  });

  const runBenford = async () => {
    const values = benfordValues.split(',').map(v => parseFloat(v.trim())).filter(v => !isNaN(v));
    if (!values.length) return;
    setRunningBenford(true);
    try {
      const res = await auditApi.analytics.benfordTest({ values });
      setBenfordResult(res.data);
    } catch (e) { console.error(e); }
    finally { setRunningBenford(false); }
  };

  const runOutlier = async () => {
    const values = outlierValues.split(',').map(v => parseFloat(v.trim())).filter(v => !isNaN(v));
    if (!values.length) return;
    setRunningOutlier(true);
    try {
      const res = await auditApi.analytics.outlierDetection({ values });
      setOutlierResult(res.data);
    } catch (e) { console.error(e); }
    finally { setRunningOutlier(false); }
  };

  const trendData = trend?.trend || [];
  const severityDist = severity?.distribution || [];
  const rcaData = rca?.root_causes || [];
  const agingBuckets = aging?.aging_buckets || [];
  const repeatThemes = repeat?.recurring || [];
  const engagements = engPerf?.engagements || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Audit Analytics</h1>
        <p className="text-slate-400 mt-1">Data-driven insights into findings, remediations, and audit performance</p>
      </div>

      {/* Summary KPIs */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {[
            { label: 'Total Findings', value: summary.total_findings, color: 'text-white' },
            { label: 'Open', value: summary.open_findings, color: 'text-amber-400' },
            { label: 'Overdue', value: summary.overdue_findings, color: 'text-red-400' },
            { label: 'Critical/High', value: summary.critical_high_open, color: 'text-orange-400' },
            { label: 'New (30d)', value: summary.new_findings_30d, color: 'text-blue-400' },
            { label: 'Closure Rate', value: `${summary.closure_rate}%`, color: 'text-emerald-400' },
            { label: 'Active Engagements', value: summary.active_engagements, color: 'text-purple-400' },
          ].map((s, i) => (
            <div key={i} className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-4 text-center">
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-slate-400 mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Severity Distribution */}
        <div className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-orange-400" />
            Severity Distribution
          </h2>
          {severityDist.length === 0 ? (
            <p className="text-slate-500 text-sm">No findings data</p>
          ) : (
            <div className="space-y-3">
              {severityDist.map((s: any) => (
                <div key={s.severity}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-slate-300 capitalize">{s.severity}</span>
                    <span className="text-slate-400">{s.count} ({s.percentage}%)</span>
                  </div>
                  <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all shadow-[0_0_8px_-1px_currentColor]"
                      style={{ width: `${s.percentage}%`, backgroundColor: SEVERITY_COLORS[s.severity] || '#94a3b8', color: SEVERITY_COLORS[s.severity] || '#94a3b8' }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Root Cause Analysis */}
        <div className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Target className="h-5 w-5 text-blue-400" />
            Root Cause Analysis
          </h2>
          {rcaData.length === 0 ? (
            <p className="text-slate-500 text-sm">No root cause data</p>
          ) : (
            <div className="space-y-3">
              {rcaData.map((r: any) => (
                <div key={r.category} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span
                      className="h-3 w-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: ROOT_CAUSE_COLORS[r.category] || '#64748b' }}
                    />
                    <span className="text-sm text-slate-300 capitalize">{r.category}</span>
                  </div>
                  <div className="flex gap-4 text-xs">
                    <span className="text-white font-medium">{r.total} total</span>
                    {r.open > 0 && <span className="text-amber-400">{r.open} open</span>}
                    {r.critical_high > 0 && <span className="text-red-400">{r.critical_high} critical/high</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Remediation Aging */}
        <div className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Clock className="h-5 w-5 text-amber-400" />
            Remediation Aging (Open Findings)
          </h2>
          {agingBuckets.length === 0 ? (
            <p className="text-slate-500 text-sm">No aging data</p>
          ) : (
            <div className="space-y-3">
              {agingBuckets.map((b: any) => {
                const total = agingBuckets.reduce((s: number, a: any) => s + a.count, 0);
                const pct = total > 0 ? (b.count / total * 100) : 0;
                return (
                  <div key={b.bucket}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-slate-300">{b.bucket}</span>
                      <span className="text-slate-400">{b.count} finding(s)</span>
                    </div>
                    <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {aging?.overdue?.length > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-700">
              <p className="text-xs text-red-400 font-medium mb-2">{aging.overdue_count} Overdue Finding(s)</p>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {aging.overdue.slice(0, 5).map((f: any) => (
                  <div key={f.id} className="flex items-center justify-between text-xs">
                    <span className="text-slate-300 truncate flex-1">{f.title}</span>
                    <span className="text-red-400 ml-2 flex-shrink-0">{f.days_overdue}d overdue</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Repeat/Recurring Findings */}
        <div className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <RotateCcw className="h-5 w-5 text-purple-400" />
            Recurring Findings
          </h2>
          {repeatThemes.length === 0 ? (
            <p className="text-slate-500 text-sm">No recurring themes detected</p>
          ) : (
            <div className="space-y-2">
              {repeatThemes.slice(0, 8).map((r: any) => (
                <div key={r.theme} className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-900/50 border border-slate-700/30">
                  <span className="text-sm text-slate-300 truncate flex-1">{r.theme}</span>
                  <span className="ml-2 px-2 py-0.5 rounded-full text-xs bg-purple-500/20 text-purple-400 flex-shrink-0">×{r.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Findings Trend */}
      {trendData.length > 0 && (
        <div className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-blue-400" />
            Findings Trend (12 months)
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-700">
                <tr>
                  <th className="text-left py-2 px-3 text-xs text-slate-500 font-medium">Month</th>
                  <th className="text-left py-2 px-3 text-xs text-slate-500 font-medium">Total</th>
                  <th className="text-left py-2 px-3 text-xs text-slate-500 font-medium">Critical</th>
                  <th className="text-left py-2 px-3 text-xs text-slate-500 font-medium">High</th>
                  <th className="text-left py-2 px-3 text-xs text-slate-500 font-medium">Medium</th>
                  <th className="text-left py-2 px-3 text-xs text-slate-500 font-medium">Open</th>
                  <th className="text-left py-2 px-3 text-xs text-slate-500 font-medium">Closed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {trendData.map((t: any) => (
                  <tr key={t.month} className="hover:bg-slate-700/30">
                    <td className="py-2 px-3 text-white">{t.month}</td>
                    <td className="py-2 px-3 font-medium text-white">{t.total}</td>
                    <td className="py-2 px-3 text-red-400">{t.critical || 0}</td>
                    <td className="py-2 px-3 text-orange-400">{t.high || 0}</td>
                    <td className="py-2 px-3 text-yellow-400">{t.medium || 0}</td>
                    <td className="py-2 px-3 text-amber-400">{t.open}</td>
                    <td className="py-2 px-3 text-emerald-400">{t.closed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Data Analytics Tools */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Benford's Law */}
        <div className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-6">
          <h2 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
            <Calculator className="h-5 w-5 text-cyan-400" />
            Benford&apos;s Law Test
          </h2>
          <p className="text-xs text-slate-400 mb-4">Paste comma-separated numerical values to detect anomalies in financial data distributions</p>
          <textarea
            className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-900 text-white text-sm focus:outline-none focus:border-blue-500 resize-none mb-3"
            rows={3}
            value={benfordValues}
            onChange={e => setBenfordValues(e.target.value)}
            placeholder="100.50, 2345.00, 15.25, 890.00, ..."
          />
          <button onClick={runBenford} disabled={!benfordValues || runningBenford} className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white rounded-lg text-sm transition-all mb-4">
            {runningBenford ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            Run Benford Test
          </button>
          {benfordResult && (
            <div className="space-y-2">
              <div className={`px-3 py-2 rounded-lg text-sm font-medium ${benfordResult.conformity === 'conforming' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                {benfordResult.conformity === 'conforming' ? '✓ Data Conforming' : '⚠ Non-Conforming'} — χ² = {benfordResult.chi_square} ({benfordResult.total_items} items)
              </div>
              <p className="text-xs text-slate-400">{benfordResult.interpretation}</p>
            </div>
          )}
        </div>

        {/* Outlier Detection */}
        <div className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-6">
          <h2 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-orange-400" />
            Outlier Detection
          </h2>
          <p className="text-xs text-slate-400 mb-4">Identify statistical outliers using Z-score and IQR methods</p>
          <textarea
            className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-900 text-white text-sm focus:outline-none focus:border-blue-500 resize-none mb-3"
            rows={3}
            value={outlierValues}
            onChange={e => setOutlierValues(e.target.value)}
            placeholder="500, 520, 480, 5000, 510, 495, ..."
          />
          <button onClick={runOutlier} disabled={!outlierValues || runningOutlier} className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white rounded-lg text-sm transition-all mb-4">
            {runningOutlier ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertCircle className="h-4 w-4" />}
            Detect Outliers
          </button>
          {outlierResult && (
            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-2 text-xs text-center">
                <div className="bg-slate-900/50 rounded p-2 border border-slate-700/30">
                  <p className="font-bold text-white">{outlierResult.stats?.mean}</p>
                  <p className="text-slate-500">Mean</p>
                </div>
                <div className="bg-slate-900/50 rounded p-2 border border-slate-700/30">
                  <p className="font-bold text-white">{outlierResult.stats?.std_dev}</p>
                  <p className="text-slate-500">Std Dev</p>
                </div>
                <div className={`rounded p-2 border ${outlierResult.outlier_count > 0 ? 'bg-red-500/10 border-red-500/20' : 'bg-emerald-500/10 border-emerald-500/20'}`}>
                  <p className={`font-bold ${outlierResult.outlier_count > 0 ? 'text-red-400' : 'text-emerald-400'}`}>{outlierResult.outlier_count}</p>
                  <p className="text-slate-500">Outliers</p>
                </div>
              </div>
              {outlierResult.outliers?.length > 0 && (
                <div className="space-y-1">
                  {outlierResult.outliers.map((o: any, i: number) => (
                    <div key={i} className="flex justify-between text-xs px-2 py-1 bg-red-500/5 rounded border border-red-500/10">
                      <span className="text-slate-300">{o.label}</span>
                      <span className="text-red-400">value: {o.value} (Z={o.z_score})</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Engagement Performance */}
      {engagements.length > 0 && (
        <div className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-green-400" />
            Engagement Performance
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-700">
                <tr>
                  <th className="text-left py-2 px-3 text-xs text-slate-500 font-medium">Engagement</th>
                  <th className="text-left py-2 px-3 text-xs text-slate-500 font-medium">Status</th>
                  <th className="text-right py-2 px-3 text-xs text-slate-500 font-medium">Budget hrs</th>
                  <th className="text-right py-2 px-3 text-xs text-slate-500 font-medium">Actual hrs</th>
                  <th className="text-right py-2 px-3 text-xs text-slate-500 font-medium">Variance</th>
                  <th className="text-center py-2 px-3 text-xs text-slate-500 font-medium">On Time</th>
                  <th className="text-right py-2 px-3 text-xs text-slate-500 font-medium">Findings</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {engagements.map((e: any) => (
                  <tr key={e.id} className="hover:bg-slate-700/30">
                    <td className="py-2 px-3 text-white max-w-[200px] truncate">{e.title}</td>
                    <td className="py-2 px-3"><span className="px-2 py-0.5 rounded-full text-xs bg-blue-500/20 text-blue-400">{e.status}</span></td>
                    <td className="py-2 px-3 text-right text-slate-400">{e.budget_hours}h</td>
                    <td className="py-2 px-3 text-right text-slate-400">{e.actual_hours}h</td>
                    <td className={`py-2 px-3 text-right text-xs font-medium ${e.variance_hours > 0 ? 'text-red-400' : e.variance_hours < 0 ? 'text-emerald-400' : 'text-slate-400'}`}>
                      {e.variance_hours > 0 ? `+${e.variance_pct}%` : e.variance_hours < 0 ? `${e.variance_pct}%` : '—'}
                    </td>
                    <td className="py-2 px-3 text-center">
                      {e.on_time ? <CheckCircle className="h-4 w-4 text-emerald-400 mx-auto" /> : <AlertTriangle className="h-4 w-4 text-red-400 mx-auto" />}
                    </td>
                    <td className="py-2 px-3 text-right text-white">{e.finding_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
