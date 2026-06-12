'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { auditApi } from '@/lib/api';
import {
  ShieldCheck,
  Map as MapIcon,
  ClipboardList,
  Repeat,
  BarChart3,
  BookOpen,
  Gavel,
  FileText,
  Users,
  Clock,
  Globe,
  Calendar,
  ClipboardCheck,
  AlertTriangle,
  AlertCircle,
  Activity,
  MessageSquare,
  FolderOpen,
  ExternalLink,
  CheckCircle,
  Bell,
  ArrowRight,
  Shield,
  type LucideIcon,
} from 'lucide-react';

type Tone = 'emerald' | 'sky' | 'amber' | 'violet' | 'rose';

const TONE: Record<Tone, { iconBg: string; iconText: string; badge: string; ring: string }> = {
  emerald: {
    iconBg: 'bg-emerald-500/15',
    iconText: 'text-emerald-300',
    badge: 'bg-emerald-500/15 text-emerald-800 border border-emerald-500/30',
    ring: 'group-hover:ring-emerald-500/40',
  },
  sky: {
    iconBg: 'bg-sky-500/15',
    iconText: 'text-sky-300',
    badge: 'bg-sky-500/15 text-sky-800 border border-sky-500/30',
    ring: 'group-hover:ring-sky-500/40',
  },
  amber: {
    iconBg: 'bg-amber-500/15',
    iconText: 'text-amber-300',
    badge: 'bg-amber-500/15 text-amber-800 border border-amber-500/30',
    ring: 'group-hover:ring-amber-500/40',
  },
  violet: {
    iconBg: 'bg-violet-500/15',
    iconText: 'text-violet-300',
    badge: 'bg-violet-500/15 text-violet-800 border border-violet-500/30',
    ring: 'group-hover:ring-violet-500/40',
  },
  rose: {
    iconBg: 'bg-rose-500/15',
    iconText: 'text-rose-300',
    badge: 'bg-rose-500/15 text-rose-800 border border-rose-500/30',
    ring: 'group-hover:ring-rose-500/40',
  },
};

interface ModuleDef {
  name: string;
  href: string;
  icon: LucideIcon;
  description: string;
  metricKey?: string;
}

interface Stage {
  key: string;
  tier: number;
  name: string;
  blurb: string;
  icon: LucideIcon;
  tone: Tone;
  modules: ModuleDef[];
}

const STAGES: Stage[] = [
  {
    key: 'governance',
    tier: 1,
    name: 'Governance',
    blurb: 'Charter, audit committee oversight, people & capacity.',
    icon: ShieldCheck,
    tone: 'emerald',
    modules: [
      { name: 'Charter', href: '/audit/charter', icon: BookOpen, description: 'Mandate, authority, independence', metricKey: 'charter' },
      { name: 'Audit Committee', href: '/audit/committee', icon: Gavel, description: 'Meetings, minutes, approvals', metricKey: 'committee' },
      { name: 'Reporting Pack', href: '/audit/committee/reporting-pack', icon: FileText, description: 'Board / committee deliverables', metricKey: 'reportingPack' },
      { name: '3LoD Inputs', href: '/audit/tlod', icon: Shield, description: 'First & second line attestations', metricKey: 'tlod' },
      { name: 'Skill Matrix', href: '/audit/skill-matrix', icon: Users, description: 'Auditor capabilities & gaps', metricKey: 'skills' },
      { name: 'Capacity Planning', href: '/audit/capacity', icon: Clock, description: 'Resource availability', metricKey: 'capacity' },
    ],
  },
  {
    key: 'planning',
    tier: 2,
    name: 'Planning',
    blurb: 'Risk-based audit universe and the annual plan.',
    icon: MapIcon,
    tone: 'sky',
    modules: [
      { name: 'Audit Universe', href: '/audit/universe', icon: Globe, description: 'Auditable entities & risk scoring', metricKey: 'universe' },
      { name: 'Annual Audit Plans', href: '/audit/plans', icon: Calendar, description: 'Approved annual & rolling plans', metricKey: 'plans' },
    ],
  },
  {
    key: 'execution',
    tier: 3,
    name: 'Execution',
    blurb: 'Engagements, evidence, findings and remediation.',
    icon: ClipboardList,
    tone: 'amber',
    modules: [
      { name: 'Engagements', href: '/audit/engagements', icon: ClipboardCheck, description: 'Active audit projects', metricKey: 'engagements' },
      { name: 'Workpapers', href: '/audit/workpapers', icon: FileText, description: 'Evidence & sign-offs', metricKey: 'workpapers' },
      { name: 'Test Scripts', href: '/audit/test-scripts', icon: ClipboardList, description: 'Reusable test programmes', metricKey: 'testScripts' },
      { name: 'Findings', href: '/audit/findings', icon: AlertTriangle, description: 'Issues identified', metricKey: 'findings' },
      { name: 'Issue Tracking', href: '/audit/issues', icon: AlertCircle, description: 'Action plans & remediation', metricKey: 'overdue' },
    ],
  },
  {
    key: 'continuous',
    tier: 4,
    name: 'Continuous Activities',
    blurb: 'Always-on monitoring, surveys, evidence intake.',
    icon: Repeat,
    tone: 'violet',
    modules: [
      { name: 'CCM', href: '/audit/ccm', icon: Activity, description: 'Continuous control monitoring', metricKey: 'ccm' },
      { name: 'Surveys', href: '/audit/surveys', icon: MessageSquare, description: 'Stakeholder feedback', metricKey: 'surveys' },
      { name: 'Document Repository', href: '/audit/documents', icon: FolderOpen, description: 'Audit document library', metricKey: 'documents' },
      { name: 'External Auditor Portal', href: '/audit/portal', icon: ExternalLink, description: 'Co-source / external access', metricKey: 'portal' },
    ],
  },
  {
    key: 'reporting',
    tier: 5,
    name: 'Reporting & Quality',
    blurb: 'Insights, formal reports and quality assurance.',
    icon: BarChart3,
    tone: 'rose',
    modules: [
      { name: 'Analytics', href: '/audit/analytics', icon: BarChart3, description: 'KPIs & trend analysis', metricKey: 'kpis' },
      { name: 'Reporting', href: '/audit/reporting', icon: FileText, description: 'Audit reports & exports', metricKey: 'reports' },
      { name: 'QAIP', href: '/audit/qaip', icon: CheckCircle, description: 'Quality assurance programme', metricKey: 'qaip' },
      { name: 'Notifications', href: '/audit/notifications', icon: Bell, description: 'Alerts & templates', metricKey: 'notifications' },
    ],
  },
];

interface CharterRecord { id: number; status: string; version: string; next_review_due?: string | null }
interface TlodSummary {
  items: Array<{ entity_id: number; has_assurance_gap?: boolean; gap_severity?: string }>;
  total: number;
}

type Metric = { label: string; loading: boolean; available: boolean };

const DASH = '—';
const dash = (loading = false, available = false): Metric => ({ label: DASH, loading, available });
const ok = (label: string): Metric => ({ label, loading: false, available: true });

function useAuditMetrics() {
  const charter = useQuery({ queryKey: ['lifecycle-charter'], queryFn: () => auditApi.charter.getAll().then(r => r.data) });
  const charterDue = useQuery({ queryKey: ['lifecycle-charter-due'], queryFn: () => auditApi.charter.dueReview(60).then(r => r.data) });
  const universe = useQuery({ queryKey: ['lifecycle-universe'], queryFn: () => auditApi.universe.getAll().then(r => r.data) });
  const plans = useQuery({ queryKey: ['lifecycle-plans'], queryFn: () => auditApi.plans.getAll().then(r => r.data) });
  const engagements = useQuery({ queryKey: ['lifecycle-engagements'], queryFn: () => auditApi.engagements.getAll().then(r => r.data) });
  const findings = useQuery({ queryKey: ['lifecycle-findings'], queryFn: () => auditApi.findings.getAll().then(r => r.data) });
  const overdue = useQuery({ queryKey: ['lifecycle-overdue'], queryFn: () => auditApi.findings.getOverdue().then(r => r.data) });
  const workpapers = useQuery({ queryKey: ['lifecycle-workpapers'], queryFn: () => auditApi.workpapers.getAll().then(r => r.data) });
  const ccm = useQuery({ queryKey: ['lifecycle-ccm'], queryFn: () => auditApi.ccm.getStats().then(r => r.data) });
  const surveys = useQuery({ queryKey: ['lifecycle-surveys'], queryFn: () => auditApi.surveys.getAll().then(r => r.data) });
  const documents = useQuery({ queryKey: ['lifecycle-docs'], queryFn: () => auditApi.documents.getStats().then(r => r.data) });
  const testScripts = useQuery({ queryKey: ['lifecycle-test'], queryFn: () => auditApi.testScripts.getAll().then(r => r.data) });
  const skills = useQuery({ queryKey: ['lifecycle-skills'], queryFn: () => auditApi.skillMatrix.getStats().then(r => r.data) });
  const tlod = useQuery({ queryKey: ['lifecycle-tlod'], queryFn: () => auditApi.tlod.getSummary().then(r => r.data as TlodSummary) });
  const kpis = useQuery({ queryKey: ['lifecycle-kpis'], queryFn: () => auditApi.reporting.getKPIs().then(r => r.data) });
  const reports = useQuery({ queryKey: ['lifecycle-reports'], queryFn: () => auditApi.reporting.getReports().then(r => r.data) });
  const qaip = useQuery({ queryKey: ['lifecycle-qaip'], queryFn: () => auditApi.qaip.getReviews().then(r => r.data) });
  const notifications = useQuery({ queryKey: ['lifecycle-notifs'], queryFn: () => auditApi.notifications.getTemplates().then(r => r.data) });
  const committee = useQuery({ queryKey: ['lifecycle-committee'], queryFn: () => auditApi.committee.list().then(r => r.data) });
  const committeeActions = useQuery({ queryKey: ['lifecycle-committee-actions'], queryFn: () => auditApi.committee.listOpenActions().then(r => r.data) });
  const portal = useQuery({ queryKey: ['lifecycle-portal'], queryFn: () => auditApi.externalPortal.getAll().then(r => r.data) });
  const capacity = useQuery({ queryKey: ['lifecycle-capacity'], queryFn: () => auditApi.capacity.getUtilization().then(r => r.data) });

  // Helper: derive a Metric from a query, returning dash when loading/errored/empty.
  // The renderer returns null when the response shape lacks the expected data.
  function fromQuery<T>(q: { isLoading: boolean; isError: boolean; data: T | undefined }, render: (d: T) => string | null): Metric {
    if (q.isLoading) return dash(true, false);
    if (q.isError || q.data === undefined) return dash(false, false);
    const label = render(q.data);
    return label === null ? dash(false, false) : ok(label);
  }

  const charterMetric: Metric = (() => {
    if (charter.isLoading) return dash(true, false);
    if (charter.isError || charter.data === undefined) return dash(false, false);
    const charters = ((charter.data as { charters?: CharterRecord[] })?.charters || (Array.isArray(charter.data) ? charter.data : [])) as CharterRecord[];
    const c = charters.find(x => x.status === 'approved') || charters[0];
    return c ? ok(`v${c.version} · ${c.status}`) : ok('No charter yet');
  })();

  // KPI strip values (number or null when unavailable)
  const engagementsArr = ((engagements.data as { engagements?: Array<{ status?: string }> })?.engagements
    || (Array.isArray(engagements.data) ? (engagements.data as Array<{ status?: string }>) : []));
  const engagementsOpen = engagements.isLoading || engagements.isError || engagements.data === undefined
    ? null
    : engagementsArr.filter(e => e.status !== 'completed' && e.status !== 'closed' && e.status !== 'cancelled').length;
  const engagementsTotal = engagementsArr.length;

  const findingsArr = ((findings.data as { findings?: Array<{ status?: string }> })?.findings
    || (Array.isArray(findings.data) ? (findings.data as Array<{ status?: string }>) : []));
  const findingsOpen = findings.isLoading || findings.isError || findings.data === undefined
    ? null
    : findingsArr.filter(f => f.status !== 'closed' && f.status !== 'resolved').length;

  const overdueArr = ((overdue.data as { findings?: unknown[]; items?: unknown[] })?.findings
    || (overdue.data as { items?: unknown[] })?.items
    || (Array.isArray(overdue.data) ? (overdue.data as unknown[]) : []));
  const overdueCount = overdue.isLoading || overdue.isError || overdue.data === undefined
    ? null
    : overdueArr.length;

  const tlodItems = (tlod.data?.items || []);
  const tlodGaps = tlod.isLoading || tlod.isError || tlod.data === undefined
    ? null
    : tlodItems.filter(i => i.has_assurance_gap).length;
  const tlodEntities = tlod.isLoading || tlod.isError || tlod.data === undefined
    ? null
    : tlodItems.length;

  const charterDueCount = charterDue.isLoading || charterDue.isError || charterDue.data === undefined
    ? null
    : (((charterDue.data as { alerts?: unknown[] })?.alerts) || []).length;

  return {
    loading: {
      engagements: engagements.isLoading,
      findings: findings.isLoading,
      overdue: overdue.isLoading,
      tlod: tlod.isLoading,
      charter: charter.isLoading || charterDue.isLoading,
    },
    kpi: {
      engagementsOpen, engagementsTotal,
      findingsOpen,
      overdueCount,
      tlodGaps, tlodEntities,
      charterDueCount,
      charterLabel: charterMetric.label,
      charterAvailable: charterMetric.available,
    },
    moduleMetrics: {
      charter: charterMetric,
      committee: fromQuery(committee, (d) => {
        const arr = ((d as { committees?: unknown[] })?.committees
          || (Array.isArray(d) ? (d as unknown[]) : [])) as unknown[];
        const openActions = ((committeeActions.data as { actions?: unknown[] })?.actions
          || (Array.isArray(committeeActions.data) ? (committeeActions.data as unknown[]) : [])) as unknown[];
        const actionsLabel = committeeActions.isError || committeeActions.data === undefined
          ? ''
          : ` · ${openActions.length} open action${openActions.length === 1 ? '' : 's'}`;
        return `${arr.length} committee${arr.length === 1 ? '' : 's'}${actionsLabel}`;
      }),
      reportingPack: fromQuery(committeeActions, (d) => {
        const openActions = ((d as { actions?: unknown[] })?.actions
          || (Array.isArray(d) ? (d as unknown[]) : [])) as unknown[];
        return `${openActions.length} open action${openActions.length === 1 ? '' : 's'}`;
      }),
      tlod: fromQuery(tlod, (d) => {
        const items = d.items || [];
        const gaps = items.filter(i => i.has_assurance_gap).length;
        return `${gaps} gap${gaps === 1 ? '' : 's'} · ${items.length} entit${items.length === 1 ? 'y' : 'ies'}`;
      }),
      skills: fromQuery(skills, (d) => {
        const s = (d || {}) as { total_auditors?: number; coverage_percentage?: number };
        if (typeof s.total_auditors !== 'number') return null;
        return `${s.total_auditors} auditor${s.total_auditors === 1 ? '' : 's'}`;
      }),
      capacity: fromQuery(capacity, (d) => {
        const c = (d || {}) as {
          total_auditors?: number;
          utilization_percentage?: number;
          available_days?: number;
          team_size?: number;
        };
        if (typeof c.utilization_percentage === 'number') {
          return `${Math.round(c.utilization_percentage)}% utilised`;
        }
        if (typeof c.available_days === 'number') {
          return `${c.available_days} days free`;
        }
        if (typeof c.total_auditors === 'number') {
          return `${c.total_auditors} auditor${c.total_auditors === 1 ? '' : 's'}`;
        }
        return null;
      }),
      universe: fromQuery(universe, (d) => {
        const arr = ((d as { entities?: Array<{ risk_rating?: string }> })?.entities
          || (d as { universe?: Array<{ risk_rating?: string }> })?.universe
          || (Array.isArray(d) ? (d as Array<{ risk_rating?: string }>) : [])) as Array<{ risk_rating?: string }>;
        const high = arr.filter(u => ['critical', 'high'].includes(String(u.risk_rating || '').toLowerCase())).length;
        return `${arr.length} entit${arr.length === 1 ? 'y' : 'ies'} · ${high} high/critical`;
      }),
      plans: fromQuery(plans, (d) => {
        const arr = ((d as { plans?: Array<{ status?: string }> })?.plans
          || (Array.isArray(d) ? (d as Array<{ status?: string }>) : [])) as Array<{ status?: string }>;
        const active = arr.filter(p => p.status === 'approved' || p.status === 'in_progress').length;
        return `${active} active · ${arr.length} total`;
      }),
      engagements: fromQuery(engagements, (d) => {
        const arr = ((d as { engagements?: Array<{ status?: string }> })?.engagements
          || (Array.isArray(d) ? (d as Array<{ status?: string }>) : [])) as Array<{ status?: string }>;
        const open = arr.filter(e => e.status !== 'completed' && e.status !== 'closed' && e.status !== 'cancelled').length;
        return `${open} open · ${arr.length} total`;
      }),
      workpapers: fromQuery(workpapers, (d) => {
        const arr = ((d as { workpapers?: unknown[] })?.workpapers
          || (Array.isArray(d) ? (d as unknown[]) : [])) as unknown[];
        return `${arr.length} workpaper${arr.length === 1 ? '' : 's'}`;
      }),
      testScripts: fromQuery(testScripts, (d) => {
        const arr = ((d as { test_scripts?: unknown[] })?.test_scripts
          || (d as { scripts?: unknown[] })?.scripts
          || (Array.isArray(d) ? (d as unknown[]) : [])) as unknown[];
        return `${arr.length} script${arr.length === 1 ? '' : 's'}`;
      }),
      findings: fromQuery(findings, (d) => {
        const arr = ((d as { findings?: Array<{ status?: string }> })?.findings
          || (Array.isArray(d) ? (d as Array<{ status?: string }>) : [])) as Array<{ status?: string }>;
        const open = arr.filter(f => f.status !== 'closed' && f.status !== 'resolved').length;
        return `${open} open · ${arr.length} total`;
      }),
      overdue: fromQuery(overdue, (d) => {
        const arr = ((d as { findings?: unknown[] })?.findings
          || (d as { items?: unknown[] })?.items
          || (Array.isArray(d) ? (d as unknown[]) : [])) as unknown[];
        return `${arr.length} overdue`;
      }),
      ccm: fromQuery(ccm, (d) => {
        const s = (d || {}) as { active_rules?: number; open_anomalies?: number };
        if (typeof s.active_rules !== 'number') return null;
        return `${s.active_rules} rules · ${s.open_anomalies ?? 0} anomalies`;
      }),
      surveys: fromQuery(surveys, (d) => {
        const arr = ((d as { surveys?: Array<{ status?: string }> })?.surveys
          || (Array.isArray(d) ? (d as Array<{ status?: string }>) : [])) as Array<{ status?: string }>;
        const active = arr.filter(s => s.status === 'sent' || s.status === 'in_progress').length;
        return `${active} active · ${arr.length} total`;
      }),
      documents: fromQuery(documents, (d) => {
        const s = (d || {}) as { total?: number; total_documents?: number };
        const n = s.total ?? s.total_documents;
        if (typeof n !== 'number') return null;
        return `${n} document${n === 1 ? '' : 's'}`;
      }),
      portal: fromQuery(portal, (d) => {
        const arr = ((d as { portals?: Array<{ status?: string }> })?.portals
          || (d as { external_portals?: Array<{ status?: string }> })?.external_portals
          || (Array.isArray(d) ? (d as Array<{ status?: string }>) : [])) as Array<{ status?: string }>;
        const active = arr.filter(p => p.status === 'active' || p.status === 'open').length;
        return `${active} active · ${arr.length} total`;
      }),
      kpis: fromQuery(kpis, (d) => {
        const k = (d || {}) as { findings_closure_rate?: number; closure_rate?: number };
        const c = k.findings_closure_rate ?? k.closure_rate;
        if (typeof c !== 'number') return null;
        return `${Math.round(c)}% closure`;
      }),
      reports: fromQuery(reports, (d) => {
        const arr = ((d as { reports?: unknown[] })?.reports
          || (Array.isArray(d) ? (d as unknown[]) : [])) as unknown[];
        return `${arr.length} report${arr.length === 1 ? '' : 's'}`;
      }),
      qaip: fromQuery(qaip, (d) => {
        const arr = ((d as { reviews?: unknown[] })?.reviews
          || (Array.isArray(d) ? (d as unknown[]) : [])) as unknown[];
        return `${arr.length} review${arr.length === 1 ? '' : 's'}`;
      }),
      notifications: fromQuery(notifications, (d) => {
        const arr = ((d as { templates?: unknown[] })?.templates
          || (Array.isArray(d) ? (d as unknown[]) : [])) as unknown[];
        return `${arr.length} template${arr.length === 1 ? '' : 's'}`;
      }),
    } as Record<string, Metric>,
  };
}

type AuditMetrics = ReturnType<typeof useAuditMetrics>;

function moduleMetric(key: string | undefined, m: AuditMetrics): Metric {
  if (!key) return dash(false, false);
  return m.moduleMetrics[key] ?? dash(false, false);
}

function KpiTile({
  label, value, sub, tone, loading, icon: Icon,
}: { label: string; value: string | number | null; sub?: string | null; tone: Tone; loading: boolean; icon: LucideIcon }) {
  const t = TONE[tone];
  const display = value === null || value === undefined ? DASH : value;
  const isDash = display === DASH;
  return (
    <div className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-4 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <div className={`h-8 w-8 rounded-lg ${t.iconBg} flex items-center justify-center`}>
          <Icon className={`h-4 w-4 ${t.iconText}`} />
        </div>
        <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400">{label}</div>
      </div>
      {loading ? (
        <div className="h-7 w-16 rounded bg-slate-800 animate-pulse" />
      ) : (
        <div className={`text-2xl font-semibold leading-none ${isDash ? 'text-slate-500' : 'text-white'}`}>{display}</div>
      )}
      {loading ? (
        <div className="h-3 w-24 rounded bg-slate-800/60 animate-pulse" />
      ) : (
        <div className="text-xs text-slate-400 min-h-[1rem]">{sub || ''}</div>
      )}
    </div>
  );
}

function ModuleCard({ mod, tone, metric }: { mod: ModuleDef; tone: Tone; metric: Metric }) {
  const t = TONE[tone];
  const Icon = mod.icon;
  return (
    <Link
      href={mod.href}
      className={`group relative rounded-xl border border-slate-700/60 bg-slate-900/60 p-4 ring-1 ring-transparent transition-all hover:bg-slate-900/90 hover:border-slate-500 ${t.ring} focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 flex flex-col gap-2`}
    >
      <div className="flex items-start justify-between">
        <div className={`h-9 w-9 rounded-lg ${t.iconBg} flex items-center justify-center`}>
          <Icon className={`h-4.5 w-4.5 ${t.iconText}`} />
        </div>
        <ArrowRight className="h-4 w-4 text-slate-500 group-hover:text-white transition-colors" />
      </div>
      <div>
        <div className="text-sm font-semibold text-white leading-tight">{mod.name}</div>
        <div className="text-xs text-slate-400 mt-1 leading-snug">{mod.description}</div>
      </div>
      {metric.loading ? (
        <div className="mt-auto h-3 w-20 rounded bg-slate-800/70 animate-pulse" />
      ) : metric.available ? (
        <div className={`mt-auto inline-flex items-center self-start text-[11px] font-medium ${t.iconText}`}>
          {metric.label}
        </div>
      ) : (
        <div className="mt-auto inline-flex items-center self-start text-[11px] font-medium text-slate-500" title="Metric unavailable">
          {DASH}
        </div>
      )}
    </Link>
  );
}

function StageSection({ stage, m }: { stage: Stage; m: AuditMetrics }) {
  const t = TONE[stage.tone];
  const Icon = stage.icon;
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`h-10 w-10 rounded-xl ${t.iconBg} flex items-center justify-center shrink-0`}>
            <Icon className={`h-5 w-5 ${t.iconText}`} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className={`text-[10px] uppercase tracking-[0.16em] px-1.5 py-0.5 rounded ${t.badge} text-gray-900`}>Tier {stage.tier}</span>
              <h2 className="text-base font-semibold text-white truncate">{stage.name}</h2>
            </div>
            <p className="text-xs text-slate-400 mt-0.5 leading-snug">{stage.blurb}</p>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {stage.modules.map(mod => (
          <ModuleCard key={mod.href} mod={mod} tone={stage.tone} metric={moduleMetric(mod.metricKey, m)} />
        ))}
      </div>
    </section>
  );
}

export default function AuditLifecyclePage() {
  const m = useAuditMetrics();
  const { kpi, loading } = m;

  return (
    <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Audit Management</div>
            <h1 className="text-3xl font-semibold text-white tracking-tight mt-1">Audit Lifecycle</h1>
            <p className="text-sm text-slate-400 mt-2 max-w-2xl">
              The full IIA-aligned internal audit flow — from governance and planning through execution,
              continuous monitoring and reporting. Click any module to jump in.
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Link
              href="/audit/dashboard"
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 hover:bg-slate-700 hover:text-white text-sm font-medium transition-colors"
            >
              <BarChart3 className="h-4 w-4" /> Operational Dashboard
            </Link>
            <Link
              href="/audit/engagements"
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium shadow-sm shadow-blue-900/40 transition-colors"
            >
              <ClipboardCheck className="h-4 w-4" /> New Engagement
            </Link>
          </div>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiTile
            label="Open Engagements"
            value={kpi.engagementsOpen}
            sub={kpi.engagementsOpen === null ? null : `${kpi.engagementsTotal} total`}
            tone="amber"
            loading={loading.engagements}
            icon={ClipboardCheck}
          />
          <KpiTile
            label="Overdue Findings"
            value={kpi.overdueCount}
            sub={kpi.findingsOpen === null ? null : `${kpi.findingsOpen} open in total`}
            tone="rose"
            loading={loading.overdue || loading.findings}
            icon={AlertTriangle}
          />
          <KpiTile
            label="Charter Status"
            value={kpi.charterAvailable ? kpi.charterLabel : null}
            sub={kpi.charterDueCount === null ? null : (kpi.charterDueCount ? `${kpi.charterDueCount} due for review` : 'all current')}
            tone="emerald"
            loading={loading.charter}
            icon={BookOpen}
          />
          <KpiTile
            label="Assurance Gaps"
            value={kpi.tlodGaps}
            sub={kpi.tlodEntities === null ? null : `${kpi.tlodEntities} entit${kpi.tlodEntities === 1 ? 'y' : 'ies'} tracked`}
            tone="violet"
            loading={loading.tlod}
            icon={Shield}
          />
        </div>

        {/* Stage stepper */}
        <div className="hidden md:flex items-center flex-wrap gap-2 text-[11px]">
          {STAGES.map((s, i) => {
            const t = TONE[s.tone];
            return (
              <div key={s.key} className="flex items-center gap-2">
                <span className={`px-2 py-1 rounded ${t.badge}`}>{s.name}</span>
                {i < STAGES.length - 1 && <ArrowRight className="h-3 w-3 text-slate-600" />}
              </div>
            );
          })}
        </div>

        {/* Stage sections */}
        <div className="space-y-4">
          {STAGES.map(stage => (
            <StageSection key={stage.key} stage={stage} m={m} />
          ))}
        </div>
    </div>
  );
}
