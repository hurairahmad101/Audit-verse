'use client';

import React, { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import { auditApi, apiClient } from '@/lib/api';
import {
  Plus,
  Search,
  Filter,
  Globe,
  AlertTriangle,
  Calendar,
  Clock,
  User,
  Edit2,
  Trash2,
  X,
  ShieldAlert,
  BarChart3,
  AlertCircle,
  RefreshCw,
  Link2,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Phone,
  Mail,
  Building2,
  Eye,
  ShieldCheck,
  Upload,
  Download,
  FileSpreadsheet,
  Wand2,
  Loader2,
  CheckCircle2,
} from 'lucide-react';

interface TlodSummaryItem {
  entity_id: number;
  first_line_status: 'current' | 'stale' | 'missing';
  second_line_status: 'current' | 'stale' | 'missing';
  third_line_status: 'current' | 'stale' | 'missing';
  has_assurance_gap: boolean;
  gap_severity: 'none' | 'low' | 'medium' | 'high';
}

const GAP_BADGE: Record<string, string> = {
  high: 'bg-red-500/10 text-red-400 border-red-500/30',
  medium: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  low: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
};

const STATUS_DOT: Record<string, string> = {
  current: 'bg-emerald-500',
  stale: 'bg-amber-500',
  missing: 'bg-red-500',
};

const ENTITY_TYPES = ['Business Unit', 'Process', 'IT System', 'Department', 'Project', 'Third Party', 'Regulatory'];
const RISK_RATINGS = ['critical', 'high', 'medium', 'low'];
const STATUSES = ['active', 'inactive', 'pending_review', 'archived'];
const AUDIT_CYCLES = ['annual', 'semi-annual', 'quarterly', 'biennial', 'ad-hoc'];
const INDUSTRIES = ['Banking', 'Healthcare', 'Insurance', 'Technology', 'Energy', 'Government', 'Manufacturing', 'Retail', 'Telecom', 'Other'];

function getRiskBadgeClasses(rating: string) {
  switch (rating?.toLowerCase()) {
    case 'critical': return 'bg-red-500/10 text-red-400 border-red-500/20';
    case 'high': return 'bg-orange-500/10 text-orange-400 border-orange-500/20';
    case 'medium': return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    case 'low': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    default: return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
  }
}

function getStatusBadgeClasses(status: string) {
  switch (status) {
    case 'active': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    case 'inactive': return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
    case 'pending_review': return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    case 'archived': return 'bg-slate-700/10 text-slate-500 border-slate-700/20';
    default: return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
  }
}

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatStatus(status: string) {
  return status?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || '—';
}

const defaultForm = {
  name: '',
  entity_type: 'Business Unit',
  description: '',
  audit_cycle: 'annual',
  owner_id: '' as string | number,
  status: 'active',
  last_audited: '',
  next_audit_due: '',
  industry: '',
  contact_name: '',
  contact_email: '',
  contact_phone: '',
  contact_designation: '',
};

function AuditUniverseInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const idsParam = searchParams.get('ids');
  const focusIds = idsParam ? idsParam.split(',').map((v) => parseInt(v, 10)).filter((n) => !isNaN(n)) : null;
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterRisk, setFilterRisk] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterGap, setFilterGap] = useState('');
  const [sortByGap, setSortByGap] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingEntity, setEditingEntity] = useState<any>(null);
  const [form, setForm] = useState(defaultForm);
  const [expandedEntity, setExpandedEntity] = useState<number | null>(null);
  const [syncResult, setSyncResult] = useState<any>(null);
  const [sortByScore, setSortByScore] = useState(false);
  const [overrideEntity, setOverrideEntity] = useState<any>(null);
  const [overrideForm, setOverrideForm] = useState({ override_score: 0, override_rating: '', justification: '' });
  const [factorEntity, setFactorEntity] = useState<any>(null);
  const [factorForm, setFactorForm] = useState<Record<string, number>>({});
  const [formFactors, setFormFactors] = useState<Record<string, number>>({});
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<any>(null);
  const [importMapping, setImportMapping] = useState<Record<string, string | null>>({});
  const [importResult, setImportResult] = useState<any>(null);
  const [narrativeEntityId, setNarrativeEntityId] = useState<number | null>(null);
  const [narrative, setNarrative] = useState<any>(null);
  const [assessSuggestions, setAssessSuggestions] = useState<any>(null);

  const { data: entities, isLoading, refetch } = useQuery({
    queryKey: ['audit-entities'],
    queryFn: () => auditApi.universe.getAll().then(r => r.data?.entities || r.data || []),
  });

  const { data: gaps } = useQuery({
    queryKey: ['coverage-gaps'],
    queryFn: () => auditApi.universe.getCoverageGaps().then(r => r.data),
  });

  const { data: riskEnrichment } = useQuery({
    queryKey: ['risk-enrichment'],
    queryFn: () => auditApi.universe.getRiskEnrichment().then(r => r.data),
  });

  const { data: tlodSummary } = useQuery({
    queryKey: ['audit-tlod-summary-universe'],
    queryFn: () => auditApi.tlod.getSummary().then(r => r.data),
  });

  const tlodByEntity = React.useMemo(() => {
    const map: Record<number, TlodSummaryItem> = {};
    const items: TlodSummaryItem[] = tlodSummary?.items || [];
    for (const it of items) {
      if (it.entity_id != null) map[it.entity_id] = it;
    }
    return map;
  }, [tlodSummary]);

  const SEVERITY_RANK: Record<string, number> = { high: 3, medium: 2, low: 1, none: 0 };

  const { data: currentUser } = useQuery({
    queryKey: ['current-user'],
    queryFn: () => apiClient.get('/auth/me').then(r => r.data),
  });

  const tenantId = currentUser?.user?.primary_tenant_id || currentUser?.primary_tenant_id;

  const { data: tenantUsers } = useQuery({
    queryKey: ['tenant-users', tenantId],
    queryFn: () => apiClient.get(`/tenants/${tenantId}/users`).then(r => r.data),
    enabled: !!tenantId,
  });

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => auditApi.universe.create(data),
    onSuccess: () => { refetch(); closeModal(); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Record<string, unknown> }) => auditApi.universe.update(id, data),
    onSuccess: () => { refetch(); closeModal(); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => auditApi.universe.delete(id),
    onSuccess: () => { refetch(); },
  });

  const syncMutation = useMutation({
    mutationFn: () => auditApi.universe.syncFromRisks().then(r => r.data),
    onSuccess: (data) => { refetch(); setSyncResult(data); setTimeout(() => setSyncResult(null), 8000); },
  });

  const refreshMutation = useMutation({
    mutationFn: () => auditApi.universe.refreshRiskScores().then(r => r.data),
    onSuccess: () => { refetch(); },
  });

  const scoreAllMutation = useMutation({
    mutationFn: () => auditApi.scoring.run().then(r => r.data),
    onSuccess: () => { refetch(); },
  });

  const scoreSingleMutation = useMutation({
    mutationFn: (id: number) => auditApi.scoring.run(id).then(r => r.data),
    onSuccess: () => { refetch(); },
  });

  const clearOverrideMutation = useMutation({
    mutationFn: (id: number) => auditApi.scoring.clearOverride(id).then(r => r.data),
    onSuccess: () => { refetch(); },
  });

  const overrideMutation = useMutation({
    mutationFn: (payload: { id: number; data: Record<string, unknown> }) =>
      auditApi.scoring.setOverride(payload.id, payload.data).then(r => r.data),
    onSuccess: () => { refetch(); closeOverrideModal(); },
  });

  const aiDescriptionMutation = useMutation({
    mutationFn: (data: { entity_name: string; entity_type: string; industry?: string }) =>
      auditApi.universe.generateDescription(data).then(r => r.data),
    onSuccess: (data: any) => {
      setForm(prev => ({ ...prev, description: data.description || '' }));
    },
  });

  const { data: entityDetail } = useQuery({
    queryKey: ['audit-entity-detail', expandedEntity],
    queryFn: () => expandedEntity ? auditApi.universe.getById(expandedEntity).then(r => r.data) : null,
    enabled: !!expandedEntity,
  });

  const { data: scoringConfig } = useQuery({
    queryKey: ['scoring-config'],
    queryFn: () => auditApi.scoring.getConfig().then(r => r.data),
  });
  const manualFactors: any[] = (scoringConfig?.factors || []).filter((f: any) => f.source === 'manual');

  const updateFactorsMutation = useMutation({
    mutationFn: (payload: { id: number; data: Record<string, unknown> }) =>
      auditApi.scoring.updateFactors(payload.id, payload.data).then(r => r.data),
    onSuccess: () => { refetch(); closeFactorEditor(); },
  });

  const previewImportMutation = useMutation({
    mutationFn: ({ file, mapping }: { file: File; mapping?: Record<string, string | null> }) =>
      auditApi.universe.previewImport(file, mapping).then(r => r.data),
    onSuccess: (data: any) => {
      setImportPreview(data);
      setImportMapping(data.mapping || {});
      setImportResult(null);
    },
  });

  const commitImportMutation = useMutation({
    mutationFn: ({ file, mapping }: { file: File; mapping?: Record<string, string | null> }) =>
      auditApi.universe.commitImport(file, mapping).then(r => r.data),
    onSuccess: (data: any) => {
      setImportResult(data);
      setImportPreview(null);
      refetch();
    },
  });

  const narrativeMutation = useMutation({
    mutationFn: (id: number) => auditApi.scoring.getNarrative(id).then(r => ({ id, data: r.data })),
    onSuccess: ({ id, data }: { id: number; data: any }) => {
      setNarrativeEntityId((current) => {
        if (current === id) setNarrative(data);
        return current;
      });
    },
  });

  const assessMutation = useMutation({
    mutationFn: (id: number) => auditApi.scoring.aiAssess(id).then(r => ({ id, data: r.data })),
    onSuccess: ({ id, data }: { id: number; data: any }) => {
      setFactorEntity((current: any) => {
        if (current?.id === id) setAssessSuggestions(data);
        return current;
      });
    },
  });

  function downloadBlob(data: BlobPart, filename: string, type: string) {
    const blob = new Blob([data], { type });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  }

  async function handleDownloadImportTemplate() {
    const res = await auditApi.universe.downloadImportTemplate();
    downloadBlob(
      res.data,
      'risk_factors_template.xlsx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
  }

  function openImportModal() {
    setShowImportModal(true);
    setImportFile(null);
    setImportPreview(null);
    setImportMapping({});
    setImportResult(null);
  }

  function closeImportModal() {
    setShowImportModal(false);
    setImportFile(null);
    setImportPreview(null);
    setImportMapping({});
    setImportResult(null);
  }

  function loadNarrative(id: number) {
    if (narrativeEntityId === id) {
      setNarrativeEntityId(null);
      setNarrative(null);
      return;
    }
    setNarrativeEntityId(id);
    setNarrative(null);
    narrativeMutation.mutate(id);
  }

  function closeModal() {
    setShowModal(false);
    setEditingEntity(null);
    setForm(defaultForm);
    setFormFactors({});
  }

  function openOverrideModal(entity: any) {
    setOverrideEntity(entity);
    setOverrideForm({
      override_score: entity.override_score ?? entity.auto_risk_score ?? entity.risk_score ?? 0,
      override_rating: entity.override_rating || '',
      justification: entity.override_justification || '',
    });
  }

  function closeOverrideModal() {
    setOverrideEntity(null);
    setOverrideForm({ override_score: 0, override_rating: '', justification: '' });
  }

  function openFactorEditor(entity: any) {
    setFactorEntity(entity);
    setAssessSuggestions(null);
    const existing = entity.risk_factors || {};
    const initial: Record<string, number> = {};
    manualFactors.forEach((f: any) => { initial[f.key] = Number(existing[f.key] ?? 0); });
    setFactorForm(initial);
  }

  function closeFactorEditor() {
    setFactorEntity(null);
    setFactorForm({});
    setAssessSuggestions(null);
  }

  function openAddModal() {
    setEditingEntity(null);
    setForm(defaultForm);
    setFormFactors({});
    setShowModal(true);
  }

  function openEditModal(entity: any) {
    setEditingEntity(entity);
    setForm({
      name: entity.name || '',
      entity_type: entity.entity_type || 'Business Unit',
      description: entity.description || '',
      audit_cycle: entity.audit_cycle || 'annual',
      owner_id: entity.owner_id || '',
      status: entity.status || 'active',
      last_audited: entity.last_audited?.split('T')[0] || '',
      next_audit_due: entity.next_audit_due?.split('T')[0] || '',
      industry: entity.industry || '',
      contact_name: entity.contact_name || '',
      contact_email: entity.contact_email || '',
      contact_phone: entity.contact_phone || '',
      contact_designation: entity.contact_designation || '',
    });
    const rf = entity.risk_factors || {};
    const initialFactors: Record<string, number> = {};
    manualFactors.forEach((f: any) => {
      if (rf[f.key] !== undefined && rf[f.key] !== null) initialFactors[f.key] = Number(rf[f.key]);
    });
    setFormFactors(initialFactors);
    setShowModal(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload: Record<string, unknown> = { ...form };
    if (payload.owner_id) payload.owner_id = Number(payload.owner_id);
    else delete payload.owner_id;
    if (!payload.last_audited) delete payload.last_audited;
    if (!payload.next_audit_due) delete payload.next_audit_due;
    if (!payload.industry) payload.industry = null;
    if (!payload.contact_name) payload.contact_name = null;
    if (!payload.contact_email) payload.contact_email = null;
    if (!payload.contact_phone) payload.contact_phone = null;
    if (!payload.contact_designation) payload.contact_designation = null;

    const cleanFactors: Record<string, number> = {};
    Object.entries(formFactors).forEach(([k, v]) => {
      if (v !== undefined && v !== null && !Number.isNaN(Number(v))) {
        cleanFactors[k] = Math.max(0, Math.min(100, Number(v)));
      }
    });
    if (Object.keys(cleanFactors).length > 0) payload.risk_factors = cleanFactors;

    if (editingEntity) {
      updateMutation.mutate({ id: editingEntity.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  function handleDelete(id: number) {
    if (confirm('Are you sure you want to delete this entity?')) {
      deleteMutation.mutate(id);
    }
  }

  const filtered = (entities || []).filter((e: any) => {
    if (focusIds && !focusIds.includes(e.id)) return false;
    if (searchTerm && !e.name?.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    if (filterType && e.entity_type !== filterType) return false;
    if (filterRisk && e.risk_rating !== filterRisk) return false;
    if (filterStatus && e.status !== filterStatus) return false;
    if (filterGap) {
      const t = tlodByEntity[e.id];
      if (!t) return false;
      if (filterGap === 'gap' && !t.has_assurance_gap) return false;
      if (filterGap === 'covered' && t.has_assurance_gap) return false;
      if (['high', 'medium', 'low'].includes(filterGap) && t.gap_severity !== filterGap) return false;
    }
    return true;
  });

  const sorted = sortByScore
    ? [...filtered].sort((a: any, b: any) => {
        const sa = a.risk_score ?? a.auto_risk_score ?? 0;
        const sb = b.risk_score ?? b.auto_risk_score ?? 0;
        return sb - sa;
      })
    : sortByGap
    ? [...filtered].sort((a: any, b: any) => {
        const ra = SEVERITY_RANK[tlodByEntity[a.id]?.gap_severity || 'none'] ?? 0;
        const rb = SEVERITY_RANK[tlodByEntity[b.id]?.gap_severity || 'none'] ?? 0;
        return rb - ra;
      })
    : filtered;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Audit Universe</h1>
          <p className="text-slate-400 mt-1">Manage auditable entities and coverage analysis</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => scoreAllMutation.mutate()}
            disabled={scoreAllMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors disabled:opacity-50"
            title="Recompute risk-based scores for all entities"
          >
            <RefreshCw className={`h-4 w-4 ${scoreAllMutation.isPending ? 'animate-spin' : ''}`} />
            Run Scoring
          </button>
          <button
            onClick={() => window.location.href = '/audit/plans?generate=universe'}
            className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg transition-colors"
          >
            <BarChart3 className="h-4 w-4" />
            Generate Audit Plan
          </button>
          <button
            onClick={openImportModal}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-600 transition-colors"
            title="Bulk import risk factors & materiality from CSV/XLSX"
          >
            <Upload className="h-4 w-4" />
            Import Factors
          </button>
          <button
            onClick={openAddModal}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add Entity
          </button>
        </div>
      </div>

      {focusIds && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-2 text-sm text-blue-200">
          <span>
            Showing {focusIds.length} {focusIds.length === 1 ? 'entity' : 'entities'} from the risk heatmap drill-down.
          </span>
          <button
            onClick={() => router.push('/audit/universe')}
            className="rounded-md border border-blue-500/40 px-2 py-1 text-xs text-blue-200 hover:bg-blue-500/20"
          >
            Clear
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search entities..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-900/60 border border-slate-700/60 text-white rounded-lg text-sm placeholder-slate-400 focus:outline-none focus:border-blue-500"
          />
        </div>
        <select
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
          className="px-3 py-2 bg-slate-900/60 border border-slate-700/60 text-white rounded-lg text-sm focus:outline-none focus:border-blue-500"
        >
          <option value="">All Types</option>
          {ENTITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select
          value={filterRisk}
          onChange={e => setFilterRisk(e.target.value)}
          className="px-3 py-2 bg-slate-900/60 border border-slate-700/60 text-white rounded-lg text-sm focus:outline-none focus:border-blue-500"
        >
          <option value="">All Ratings</option>
          {RISK_RATINGS.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
        </select>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="px-3 py-2 bg-slate-900/60 border border-slate-700/60 text-white rounded-lg text-sm focus:outline-none focus:border-blue-500"
        >
          <option value="">All Statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{formatStatus(s)}</option>)}
        </select>
        <select
          value={filterGap}
          onChange={e => setFilterGap(e.target.value)}
          className="px-3 py-2 bg-white border border-slate-200 text-slate-900 rounded-lg text-sm focus:outline-none focus:border-blue-500"
          title="Filter by 1st/2nd line assurance gap"
        >
          <option value="">All Assurance</option>
          <option value="gap">With Assurance Gap</option>
          <option value="covered">Fully Covered</option>
          <option value="high">Gap: High</option>
          <option value="medium">Gap: Medium</option>
          <option value="low">Gap: Low</option>
        </select>
        <button
          onClick={() => setSortByGap(s => !s)}
          className={`flex items-center gap-1.5 px-3 py-2 border rounded-lg text-sm transition-colors ${
            sortByGap
              ? 'bg-amber-50 border-amber-200 text-amber-700'
              : 'bg-white border-slate-200 text-slate-700 hover:border-blue-500'
          }`}
          title="Sort entities by assurance gap severity"
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          {sortByGap ? 'Sorted by Gap' : 'Sort by Gap'}
        </button>
        <button
          onClick={() => { setSortByScore(s => !s); if (!sortByScore) setSortByGap(false); }}
          className={`flex items-center gap-1.5 px-3 py-2 border rounded-lg text-sm transition-colors ${
            sortByScore
              ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
              : 'bg-white border-slate-200 text-slate-700 hover:border-blue-500'
          }`}
          title="Sort entities by risk score (highest first)"
        >
          <ShieldAlert className="h-3.5 w-3.5" />
          {sortByScore ? 'Sorted by Score' : 'Sort by Score'}
        </button>
        {(filterType || filterRisk || filterStatus || filterGap || searchTerm || sortByGap || sortByScore) && (
          <button
            onClick={() => { setFilterType(''); setFilterRisk(''); setFilterStatus(''); setFilterGap(''); setSearchTerm(''); setSortByGap(false); setSortByScore(false); }}
            className="px-3 py-2 text-sm text-slate-400 hover:text-white transition-colors"
          >
            Clear Filters
          </button>
        )}
      </div>

      {riskEnrichment && (
        <div className="bg-slate-900/60 rounded-xl border border-slate-700/60 p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-amber-400" />
              <h3 className="text-sm font-semibold text-white">Risk Register Summary</h3>
              <span className="text-xs text-slate-400 ml-2">Data from Risk Management module</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => refreshMutation.mutate()}
                disabled={refreshMutation.isPending}
                title="Recompute weighted composite RBA scores for all entities and drop closed linked risks"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white text-xs rounded-lg transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${refreshMutation.isPending ? 'animate-spin' : ''}`} />
                {refreshMutation.isPending ? 'Recomputing...' : 'Recompute RBA Scores'}
              </button>
              <button
                onClick={() => syncMutation.mutate()}
                disabled={syncMutation.isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded-lg transition-colors disabled:opacity-50"
              >
                <Link2 className="h-3.5 w-3.5" />
                {syncMutation.isPending ? 'Syncing...' : 'Sync from Risk Register'}
              </button>
            </div>
          </div>
          {syncResult && (
            <div className="mb-3 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <p className="text-sm text-emerald-400">{syncResult.message}</p>
              <p className="text-xs text-emerald-500 mt-1">Created: {syncResult.created} | Updated: {syncResult.updated}</p>
            </div>
          )}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {(riskEnrichment.risk_summary || []).map((cat: any) => (
              <div key={cat.category} className="bg-slate-900/60 border border-slate-700/60 rounded-lg p-3">
                <p className="text-xs text-slate-400 capitalize">{cat.category}</p>
                <p className="text-lg font-bold text-white">{cat.count}</p>
                <p className="text-xs text-slate-500">Avg Score: {cat.avg_score}</p>
              </div>
            ))}
            {(riskEnrichment.risk_summary || []).length === 0 && (
              <p className="text-sm text-slate-400 col-span-full">No active risks found in Risk Register</p>
            )}
          </div>
          <div className="flex items-center gap-4 mt-3 text-xs text-slate-500">
            <span>Total open risks: {riskEnrichment.total_risks || 0}</span>
            <span>|</span>
            <span className="flex items-center gap-1">
              <Link2 className="h-3 w-3" />
              {riskEnrichment.linked_entities || 0} of {riskEnrichment.total_entities || 0} entities linked to {riskEnrichment.total_linked_risks || 0} risks
            </span>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-slate-700/60 bg-slate-900/60 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/60">
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Name</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Type</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Industry</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Risk Score</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Risk Rating</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Assurance</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Next Due</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Owner</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Linked Risks</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Status</th>
                <th className="text-right px-4 py-3 text-slate-400 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-slate-700/30">
                    {Array.from({ length: 11 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-slate-700/60 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : sorted.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-12 text-center">
                    <Globe className="h-10 w-10 text-slate-400 mx-auto mb-3" />
                    <p className="text-slate-400 font-medium">No entities found</p>
                    <p className="text-slate-500 text-xs mt-1">Add entities to build your audit universe</p>
                  </td>
                </tr>
              ) : (
                sorted.map((entity: any) => {
                  const isExpanded = expandedEntity === entity.id;
                  const riskCount = entity.linked_risk_count || (entity.linked_risk_ids || []).length || 0;
                  const tlod = tlodByEntity[entity.id];
                  return (
                  <React.Fragment key={entity.id}>
                  <tr className="border-b border-slate-700/30 hover:bg-slate-800/20 transition-colors">
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setExpandedEntity(isExpanded ? null : entity.id)}
                        className="text-gray-900 font-medium hover:text-blue-400 transition-colors text-left flex items-center gap-1"
                      >
                        {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                        {entity.name}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-slate-200">{entity.entity_type}</td>
                    <td className="px-4 py-3">
                      {entity.industry ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-500/10 text-indigo-400 border border-indigo-500/30">
                          <Building2 className="h-3 w-3" />
                          {entity.industry}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-200">{entity.risk_score ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${getRiskBadgeClasses(entity.risk_rating)}`}>
                        {entity.risk_rating ? entity.risk_rating.charAt(0).toUpperCase() + entity.risk_rating.slice(1) : '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {tlod ? (
                        tlod.has_assurance_gap ? (
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${GAP_BADGE[tlod.gap_severity] || GAP_BADGE.low}`}
                            title={`1st line: ${tlod.first_line_status} · 2nd line: ${tlod.second_line_status} · 3rd line: ${tlod.third_line_status}`}
                          >
                            <AlertTriangle className="h-3 w-3" />
                            Gap
                            <span className="ml-0.5 inline-flex items-center gap-0.5">
                              <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[tlod.first_line_status] || 'bg-slate-500'}`} />
                              <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[tlod.second_line_status] || 'bg-slate-500'}`} />
                              <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[tlod.third_line_status] || 'bg-slate-500'}`} />
                            </span>
                          </span>
                        ) : (
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                            title={`1st line: ${tlod.first_line_status} · 2nd line: ${tlod.second_line_status} · 3rd line: ${tlod.third_line_status}`}
                          >
                            <ShieldCheck className="h-3 w-3" />
                            Covered
                          </span>
                        )
                      ) : (
                        <span className="text-slate-400 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-200">{formatDate(entity.next_audit_due)}</td>
                    <td className="px-4 py-3 text-slate-200">{entity.owner_name || entity.owner || '—'}</td>
                    <td className="px-4 py-3">
                      {riskCount > 0 ? (
                        <button
                          onClick={() => setExpandedEntity(isExpanded ? null : entity.id)}
                          className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 transition-colors"
                        >
                          <Link2 className="h-3 w-3" />
                          {riskCount}
                          {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                        </button>
                      ) : (
                        <span className="text-slate-500 text-xs">None</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${getStatusBadgeClasses(entity.status)}`}>
                        {formatStatus(entity.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => router.push(`/audit/universe/${entity.id}`)}
                          className="p-1.5 text-slate-400 hover:text-emerald-400 rounded-lg hover:bg-slate-800 transition-colors"
                          title="View details"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => openEditModal(entity)}
                          className="p-1.5 text-slate-400 hover:text-blue-400 rounded-lg hover:bg-slate-800 transition-colors"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(entity.id)}
                          className="p-1.5 text-slate-400 hover:text-red-400 rounded-lg hover:bg-slate-800 transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="border-b border-slate-700/30 bg-slate-900/40">
                      <td colSpan={11} className="px-6 py-4">
                        <div className="space-y-4">
                          {entity.description && (
                            <div>
                              <p className="text-xs font-semibold text-slate-400 mb-1">Description</p>
                              <p className="text-sm text-slate-200">{entity.description}</p>
                            </div>
                          )}
                          {(entity.contact_name || entity.contact_email || entity.contact_phone) && (
                            <div>
                              <p className="text-xs font-semibold text-slate-400 mb-2">Point of Contact</p>
                              <div className="flex flex-wrap items-center gap-4 text-sm">
                                {entity.contact_name && (
                                  <span className="flex items-center gap-1.5 text-slate-200">
                                    <User className="h-3.5 w-3.5 text-slate-400" />
                                    {entity.contact_name}
                                    {entity.contact_designation && (
                                      <span className="text-xs text-slate-500">({entity.contact_designation})</span>
                                    )}
                                  </span>
                                )}
                                {entity.contact_email && (
                                  <a href={`mailto:${entity.contact_email}`} className="flex items-center gap-1.5 text-blue-400 hover:underline">
                                    <Mail className="h-3.5 w-3.5" />
                                    {entity.contact_email}
                                  </a>
                                )}
                                {entity.contact_phone && (
                                  <span className="flex items-center gap-1.5 text-slate-200">
                                    <Phone className="h-3.5 w-3.5 text-slate-400" />
                                    {entity.contact_phone}
                                  </span>
                                )}
                              </div>
                            </div>
                          )}
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-xs font-semibold text-slate-400">Risk Score Breakdown</p>
                              <div className="flex items-center gap-2">
                                {entity.score_override ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-violet-500/10 text-violet-400 border border-violet-500/30" title={entity.override_justification || ''}>
                                    <ShieldAlert className="h-3 w-3" /> Manual Override
                                  </span>
                                ) : null}
                                <button
                                  onClick={() => scoreSingleMutation.mutate(entity.id)}
                                  disabled={scoreSingleMutation.isPending}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs disabled:opacity-50"
                                >
                                  <RefreshCw className={`h-3 w-3 ${scoreSingleMutation.isPending ? 'animate-spin' : ''}`} /> Recompute
                                </button>
                                <button
                                  onClick={() => openFactorEditor(entity)}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs"
                                >
                                  <User className="h-3 w-3" /> Edit Factors
                                </button>
                                <button
                                  onClick={() => openOverrideModal(entity)}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs"
                                >
                                  <Edit2 className="h-3 w-3" /> Override
                                </button>
                                {entity.score_override && (
                                  <button
                                    onClick={() => clearOverrideMutation.mutate(entity.id)}
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-red-400 text-xs"
                                  >
                                    Clear
                                  </button>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-4 mb-3 text-sm">
                              <span className="text-slate-300">Composite (auto): <span className="text-white font-semibold">{entity.auto_risk_score ?? '—'}</span></span>
                              <span className="text-slate-300">Effective: <span className="text-white font-semibold">{entity.risk_score ?? '—'}</span></span>
                              {entity.scored_at && <span className="text-xs text-slate-500">scored {formatDate(entity.scored_at)}</span>}
                            </div>
                            {Array.isArray(entity.factor_contributions) && entity.factor_contributions.length > 0 ? (
                              <div className="space-y-1.5">
                                {entity.factor_contributions.map((c: any) => {
                                  const maxContribution = Math.max(...entity.factor_contributions.map((x: any) => x.contribution || 0), 1);
                                  const widthPct = ((c.contribution || 0) / maxContribution) * 100;
                                  return (
                                    <div key={c.key} className="flex items-center gap-3">
                                      <span className="w-44 text-xs text-slate-300 flex items-center gap-1.5">
                                        {c.source === 'auto' ? <Sparkles className="h-3 w-3 text-sky-400" /> : <User className="h-3 w-3 text-violet-400" />}
                                        {c.label}
                                      </span>
                                      <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                                        <div className="h-full bg-emerald-500/70 rounded-full" style={{ width: `${widthPct}%` }} />
                                      </div>
                                      <span className="w-28 text-right text-xs text-slate-400">
                                        {c.value} × {c.weight} → <span className="text-slate-200">{c.contribution}</span>
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <p className="text-xs text-slate-500">Not yet scored. Click Recompute to generate a breakdown.</p>
                            )}
                          </div>
                          <div className="rounded-lg border border-slate-700/60 bg-slate-900/40 p-3">
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                                <Sparkles className="h-3.5 w-3.5 text-sky-400" /> AI Risk Narrative
                              </p>
                              <button
                                onClick={() => loadNarrative(entity.id)}
                                disabled={narrativeMutation.isPending && narrativeEntityId === entity.id}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs disabled:opacity-50"
                              >
                                {narrativeMutation.isPending && narrativeEntityId === entity.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Sparkles className="h-3 w-3" />
                                )}
                                {narrativeEntityId === entity.id ? 'Hide' : 'Explain Score'}
                              </button>
                            </div>
                            {narrativeEntityId === entity.id && (
                              narrativeMutation.isPending ? (
                                <p className="text-xs text-slate-500">Generating narrative…</p>
                              ) : narrative ? (
                                <div>
                                  <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-line">{narrative.narrative}</p>
                                  <span className={`mt-2 inline-block text-[10px] uppercase tracking-wide ${narrative.source === 'ai' ? 'text-sky-400' : 'text-slate-500'}`}>
                                    {narrative.source === 'ai' ? 'AI-generated' : 'Deterministic summary (AI unavailable)'}
                                  </span>
                                </div>
                              ) : (
                                <p className="text-xs text-slate-500">No narrative available.</p>
                              )
                            )}
                          </div>
                          {entityDetail?.linked_risks && (
                            <div>
                              <p className="text-xs font-semibold text-slate-400 mb-2">Linked Risk Register Entries</p>
                              <div className="space-y-1">
                                {entityDetail.linked_risks.map((risk: any) => (
                                  <div key={risk.id} className="flex items-center justify-between bg-slate-900/60 border border-slate-700/60 rounded-lg px-3 py-2">
                                    <div className="flex items-center gap-3">
                                      <span className="text-sm text-white">{risk.title}</span>
                                      <span className="text-xs text-slate-400 capitalize">{risk.category}</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${getRiskBadgeClasses(risk.risk_rating)}`}>
                                        {risk.risk_rating?.charAt(0).toUpperCase() + risk.risk_rating?.slice(1)}
                                      </span>
                                      <span className="text-xs text-slate-400">Residual: {risk.residual_score ?? '—'}</span>
                                      <span className={`text-xs ${risk.status === 'open' ? 'text-amber-400' : 'text-slate-500'}`}>{risk.status}</span>
                                    </div>
                                  </div>
                                ))}
                                {entityDetail.linked_risks.length === 0 && (
                                  <p className="text-xs text-slate-500">No linked risks found</p>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {!isLoading && sorted.length > 0 && (
          <div className="px-4 py-3 border-t border-slate-700/60 text-sm text-slate-400 flex items-center justify-between">
            <span>Showing {sorted.length} of {(entities || []).length} entities</span>
            {tlodSummary?.items && (
              <span className="text-xs text-slate-500">
                {(tlodSummary.items as TlodSummaryItem[]).filter(i => i.has_assurance_gap).length} with assurance gap
              </span>
            )}
          </div>
        )}
      </div>

      {gaps && (
        <div>
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-blue-400" />
            Coverage Gap Analysis
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-red-500/10">
                  <AlertCircle className="h-5 w-5 text-red-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-white">{gaps.never_audited ?? 0}</p>
                  <p className="text-sm text-slate-400">Never Audited</p>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-orange-500/10">
                  <Clock className="h-5 w-5 text-orange-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-white">{gaps.overdue ?? 0}</p>
                  <p className="text-sm text-slate-400">Overdue Audits</p>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-500/10">
                  <ShieldAlert className="h-5 w-5 text-amber-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-white">{gaps.high_risk_unaudited ?? 0}</p>
                  <p className="text-sm text-slate-400">High Risk Unaudited</p>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-500/10">
                  <Calendar className="h-5 w-5 text-blue-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-white">{gaps.due_within_90_days ?? gaps.upcoming ?? 0}</p>
                  <p className="text-sm text-slate-400">Due Within 90 Days</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-slate-900/60 rounded-xl border border-slate-700/60 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/60">
              <h3 className="text-lg font-semibold text-white">
                {editingEntity ? 'Edit Entity' : 'Add Entity'}
              </h3>
              <button onClick={closeModal} className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-200 mb-1">Name *</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-900/60 border border-slate-700 text-white rounded-lg text-sm focus:outline-none focus:border-blue-500"
                  placeholder="Entity name"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-200 mb-1">Entity Type</label>
                  <select
                    value={form.entity_type}
                    onChange={e => setForm({ ...form, entity_type: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-900/60 border border-slate-700 text-white rounded-lg text-sm focus:outline-none focus:border-blue-500"
                  >
                    {ENTITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-200 mb-1">Industry</label>
                  <select
                    value={form.industry}
                    onChange={e => setForm({ ...form, industry: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-900/60 border border-slate-700 text-white rounded-lg text-sm focus:outline-none focus:border-blue-500"
                  >
                    <option value="">Select industry...</option>
                    {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-medium text-slate-200">Description</label>
                  <button
                    type="button"
                    disabled={!form.name || aiDescriptionMutation.isPending}
                    onClick={() => aiDescriptionMutation.mutate({
                      entity_name: form.name,
                      entity_type: form.entity_type,
                      industry: form.industry || undefined,
                    })}
                    className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Sparkles className={`h-3.5 w-3.5 ${aiDescriptionMutation.isPending ? 'animate-spin' : ''}`} />
                    {aiDescriptionMutation.isPending ? 'Generating...' : 'Generate with AI'}
                  </button>
                </div>
                <textarea
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 bg-slate-900/60 border border-slate-700 text-white rounded-lg text-sm focus:outline-none focus:border-blue-500 resize-none"
                  placeholder="Brief description or use AI to generate..."
                />
              </div>
              <div className="rounded-lg border border-slate-700/60 bg-slate-900/40 px-3 py-2.5 text-xs text-slate-400 flex items-start gap-2">
                <Sparkles className="h-3.5 w-3.5 text-sky-400 mt-0.5 shrink-0" />
                <span>Risk score &amp; rating are computed automatically by the risk-based scoring engine from the manual factor values below plus auto-derived factors. You can also set a justified <span className="text-slate-200">Override</span> from the entity row.</span>
              </div>
              {manualFactors.length > 0 && (
                <div className="border-t border-slate-700/60 pt-4">
                  <p className="text-sm font-medium text-slate-200 mb-1 flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5 text-violet-400" /> Manual Risk Factors
                  </p>
                  <p className="text-xs text-slate-500 mb-3">Financial materiality, external intelligence and other analyst inputs (0–100). Leave blank to skip.</p>
                  <div className="grid grid-cols-2 gap-3">
                    {manualFactors.map((f: any) => (
                      <div key={f.key}>
                        <label className="block text-xs text-slate-400 mb-1" title={f.description}>{f.label}</label>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={formFactors[f.key] ?? ''}
                          onChange={(e) => {
                            const raw = e.target.value;
                            setFormFactors((prev) => {
                              const next = { ...prev };
                              if (raw === '') delete next[f.key];
                              else next[f.key] = Math.max(0, Math.min(100, Number(raw)));
                              return next;
                            });
                          }}
                          className="w-full px-3 py-2 bg-slate-900/60 border border-slate-700 text-white rounded-lg text-sm focus:outline-none focus:border-blue-500"
                          placeholder="—"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-200 mb-1">Audit Cycle</label>
                  <select
                    value={form.audit_cycle}
                    onChange={e => setForm({ ...form, audit_cycle: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-900/60 border border-slate-700 text-white rounded-lg text-sm focus:outline-none focus:border-blue-500"
                  >
                    {AUDIT_CYCLES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1).replace(/-/g, ' ')}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-200 mb-1">Status</label>
                  <select
                    value={form.status}
                    onChange={e => setForm({ ...form, status: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-900/60 border border-slate-700 text-white rounded-lg text-sm focus:outline-none focus:border-blue-500"
                  >
                    {STATUSES.map(s => <option key={s} value={s}>{formatStatus(s)}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-200 mb-1">Owner</label>
                <select
                  value={form.owner_id}
                  onChange={e => setForm({ ...form, owner_id: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-900/60 border border-slate-700 text-white rounded-lg text-sm focus:outline-none focus:border-blue-500"
                >
                  <option value="">Select owner...</option>
                  {(tenantUsers || []).map((tu: any) => (
                    <option key={tu.user?.id || tu.user_id} value={tu.user?.id || tu.user_id}>
                      {tu.user?.display_name || tu.user?.username || tu.user?.email || `User ${tu.user_id}`}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-200 mb-1">Last Audited</label>
                  <input
                    type="date"
                    value={form.last_audited}
                    onChange={e => setForm({ ...form, last_audited: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-900/60 border border-slate-700 text-white rounded-lg text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-200 mb-1">Next Audit Due</label>
                  <input
                    type="date"
                    value={form.next_audit_due}
                    onChange={e => setForm({ ...form, next_audit_due: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-900/60 border border-slate-700 text-white rounded-lg text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
              <div className="border-t border-slate-700/60 pt-4">
                <p className="text-sm font-medium text-slate-200 mb-3">Point of Contact</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Contact Name</label>
                    <input
                      type="text"
                      value={form.contact_name}
                      onChange={e => setForm({ ...form, contact_name: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-900/60 border border-slate-700 text-white rounded-lg text-sm focus:outline-none focus:border-blue-500"
                      placeholder="Full name"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Designation / Title</label>
                    <input
                      type="text"
                      value={form.contact_designation}
                      onChange={e => setForm({ ...form, contact_designation: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-900/60 border border-slate-700 text-white rounded-lg text-sm focus:outline-none focus:border-blue-500"
                      placeholder="e.g. VP of Operations"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Email</label>
                    <input
                      type="email"
                      value={form.contact_email}
                      onChange={e => setForm({ ...form, contact_email: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-900/60 border border-slate-700 text-white rounded-lg text-sm focus:outline-none focus:border-blue-500"
                      placeholder="contact@example.com"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Phone</label>
                    <input
                      type="tel"
                      value={form.contact_phone}
                      onChange={e => setForm({ ...form, contact_phone: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-900/60 border border-slate-700 text-white rounded-lg text-sm focus:outline-none focus:border-blue-500"
                      placeholder="+1 (555) 000-0000"
                    />
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-700/60">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 text-sm text-slate-200 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-500 rounded-lg font-medium transition-colors disabled:opacity-50"
                >
                  {createMutation.isPending || updateMutation.isPending ? 'Saving...' : editingEntity ? 'Update Entity' : 'Add Entity'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {overrideEntity && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-xl border border-slate-700 bg-slate-800">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
              <h2 className="text-lg font-semibold text-white">Manual Score Override</h2>
              <button onClick={closeOverrideModal} className="text-slate-400 hover:text-white"><X className="h-5 w-5" /></button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                overrideMutation.mutate({
                  id: overrideEntity.id,
                  data: {
                    override_score: Number(overrideForm.override_score),
                    override_rating: overrideForm.override_rating || undefined,
                    justification: overrideForm.justification,
                  },
                });
              }}
              className="p-6 space-y-4"
            >
              <p className="text-sm text-slate-400">
                Overriding <span className="text-white font-medium">{overrideEntity.name}</span>. Auto composite is{' '}
                <span className="text-white">{overrideEntity.auto_risk_score ?? '—'}</span>.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-slate-300 mb-1">Override Score (0–100) *</label>
                  <input
                    required
                    type="number"
                    min={0}
                    max={100}
                    value={overrideForm.override_score}
                    onChange={(e) => setOverrideForm({ ...overrideForm, override_score: Number(e.target.value) })}
                    className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-300 mb-1">Rating (optional)</label>
                  <select
                    value={overrideForm.override_rating}
                    onChange={(e) => setOverrideForm({ ...overrideForm, override_rating: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white"
                  >
                    <option value="">Auto from score</option>
                    {RISK_RATINGS.map((r) => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm text-slate-300 mb-1">Justification *</label>
                <textarea
                  required
                  rows={3}
                  value={overrideForm.justification}
                  onChange={(e) => setOverrideForm({ ...overrideForm, justification: e.target.value })}
                  placeholder="Why is a manual override warranted?"
                  className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={closeOverrideModal} className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm border border-slate-600">Cancel</button>
                <button type="submit" disabled={overrideMutation.isPending} className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium disabled:opacity-50">
                  {overrideMutation.isPending ? 'Applying…' : 'Apply Override'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-3xl rounded-xl border border-slate-700 bg-slate-800 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-emerald-400" />
                <h2 className="text-lg font-semibold text-white">Bulk Import Risk Factors</h2>
              </div>
              <button onClick={closeImportModal} className="text-slate-400 hover:text-white"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto">
              {importResult ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-emerald-400">
                    <CheckCircle2 className="h-5 w-5" />
                    <p className="font-medium">Import complete</p>
                  </div>
                  <p className="text-sm text-slate-300">{importResult.message}</p>
                  <div className="grid grid-cols-2 gap-3 text-center">
                    <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-3">
                      <p className="text-2xl font-bold text-emerald-400">{importResult.updated ?? 0}</p>
                      <p className="text-xs text-slate-400">Entities updated &amp; rescored</p>
                    </div>
                    <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-3">
                      <p className="text-2xl font-bold text-amber-400">{importResult.skipped ?? 0}</p>
                      <p className="text-xs text-slate-400">Skipped</p>
                    </div>
                  </div>
                  {importResult.errors?.length > 0 && (
                    <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-xs text-red-300 space-y-1 max-h-40 overflow-y-auto">
                      {importResult.errors.map((er: string, i: number) => <p key={i}>{er}</p>)}
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between rounded-lg border border-slate-700/60 bg-slate-900/40 px-3 py-2.5">
                    <p className="text-xs text-slate-400">Upload a CSV or XLSX. Need the format? Download the template.</p>
                    <button
                      type="button"
                      onClick={handleDownloadImportTemplate}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs border border-slate-600"
                    >
                      <Download className="h-3.5 w-3.5" /> Template
                    </button>
                  </div>
                  <div>
                    <label className="block text-sm text-slate-300 mb-2">File</label>
                    <input
                      type="file"
                      accept=".csv,.xlsx"
                      onChange={(e) => {
                        const f = e.target.files?.[0] || null;
                        setImportFile(f);
                        setImportPreview(null);
                      }}
                      className="block w-full text-sm text-slate-300 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-blue-600 file:text-white hover:file:bg-blue-500"
                    />
                  </div>
                  {importFile && !importPreview && (
                    <button
                      type="button"
                      onClick={() => previewImportMutation.mutate({ file: importFile })}
                      disabled={previewImportMutation.isPending}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm disabled:opacity-50"
                    >
                      {previewImportMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
                      Preview
                    </button>
                  )}
                  {previewImportMutation.isError && (
                    <p className="text-xs text-red-400">Could not parse file. Check the format and try again.</p>
                  )}
                  {importPreview && (
                    <div className="space-y-4">
                      {importPreview.columns?.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-slate-400 mb-2">Column mapping — map each file column to an entity identifier or risk factor</p>
                          <div className="grid grid-cols-2 gap-3">
                            {importPreview.columns.map((col: string) => (
                              <div key={col} className="text-xs">
                                <label className="block text-slate-500 mb-1 truncate" title={col}>{col}</label>
                                <select
                                  value={importMapping[col] ?? ''}
                                  onChange={(e) => setImportMapping({ ...importMapping, [col]: e.target.value || null })}
                                  className="w-full px-2 py-1.5 bg-slate-900/60 border border-slate-700 text-white rounded-lg"
                                >
                                  <option value="">— ignore —</option>
                                  {(importPreview.identity_options || []).map((id: string) => (
                                    <option key={id} value={id}>{id === 'entity_id' ? 'Entity ID' : 'Entity Name'}</option>
                                  ))}
                                  {(importPreview.factor_options || []).map((f: any) => (
                                    <option key={f.key} value={f.key}>{f.label}</option>
                                  ))}
                                </select>
                              </div>
                            ))}
                          </div>
                          <button
                            type="button"
                            onClick={() => importFile && previewImportMutation.mutate({ file: importFile, mapping: importMapping })}
                            disabled={previewImportMutation.isPending}
                            className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs disabled:opacity-50"
                          >
                            {previewImportMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                            Re-validate
                          </button>
                        </div>
                      )}
                      <div>
                        <p className="text-xs font-semibold text-slate-400 mb-2">
                          Preview — {importPreview.summary?.valid_rows ?? 0} valid, {importPreview.summary?.error_rows ?? 0} with issues, {importPreview.summary?.matched_rows ?? 0} matched ({importPreview.summary?.total_rows ?? 0} total)
                        </p>
                        <div className="rounded-lg border border-slate-700 overflow-hidden max-h-72 overflow-y-auto">
                          <table className="w-full text-xs">
                            <thead className="bg-slate-900/60 text-slate-400 sticky top-0">
                              <tr>
                                <th className="text-left px-3 py-2">Row</th>
                                <th className="text-left px-3 py-2">Identifier</th>
                                <th className="text-left px-3 py-2">Matched entity</th>
                                <th className="text-left px-3 py-2">Factors</th>
                                <th className="text-left px-3 py-2">Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(importPreview.rows || []).map((row: any, i: number) => (
                                <tr key={i} className="border-t border-slate-700/50">
                                  <td className="px-3 py-2 text-slate-500">{row.row_number ?? i + 1}</td>
                                  <td className="px-3 py-2 text-slate-200">{row.identifier || '—'}</td>
                                  <td className="px-3 py-2">
                                    {row.matched_entity_id ? (
                                      <span className="text-emerald-400">{row.matched_entity_name || `#${row.matched_entity_id}`}</span>
                                    ) : (
                                      <span className="text-amber-400">no match</span>
                                    )}
                                  </td>
                                  <td className="px-3 py-2 text-slate-400">
                                    {row.values && Object.keys(row.values).length > 0 ? Object.entries(row.values).map(([k, v]) => `${k}=${v}`).join(', ') : '—'}
                                  </td>
                                  <td className="px-3 py-2">
                                    {row.valid ? (
                                      <span className="text-emerald-400">OK</span>
                                    ) : (
                                      <span className="text-red-400" title={(row.errors || []).join('; ')}>{(row.errors || ['invalid']).join('; ')}</span>
                                    )}
                                    {row.warnings?.length > 0 && (
                                      <span className="text-amber-400 ml-1" title={row.warnings.join('; ')}>⚠</span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-700">
              <button onClick={closeImportModal} className="px-4 py-2 text-slate-300 hover:text-white text-sm">
                {importResult ? 'Close' : 'Cancel'}
              </button>
              {!importResult && importPreview && (importPreview.summary?.valid_rows ?? 0) > 0 && (
                <button
                  onClick={() => importFile && commitImportMutation.mutate({ file: importFile, mapping: importMapping })}
                  disabled={commitImportMutation.isPending}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm disabled:opacity-50"
                >
                  {commitImportMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Commit {importPreview.summary.valid_rows} rows
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {factorEntity && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-xl border border-slate-700 bg-slate-800">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
              <h2 className="text-lg font-semibold text-white">Edit Risk Factors</h2>
              <button onClick={closeFactorEditor} className="text-slate-400 hover:text-white"><X className="h-5 w-5" /></button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                updateFactorsMutation.mutate({
                  id: factorEntity.id,
                  data: { risk_factors: factorForm },
                });
              }}
              className="p-6 space-y-4"
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm text-slate-400">
                  Manual factor inputs for <span className="text-white font-medium">{factorEntity.name}</span>. Each value is on a 0–100 scale; auto factors are derived automatically. Saving recomputes the composite score.
                </p>
                <button
                  type="button"
                  onClick={() => assessMutation.mutate(factorEntity.id)}
                  disabled={assessMutation.isPending || manualFactors.length === 0}
                  className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 text-xs font-medium border border-sky-500/30 disabled:opacity-50"
                  title="Suggest factor values you can review and confirm — nothing is saved automatically"
                >
                  {assessMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                  AI Assess
                </button>
              </div>
              {assessSuggestions?.suggestions?.length > 0 && (
                <div className="rounded-lg border border-sky-500/30 bg-sky-500/5 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-sky-300">
                      Suggestions ({assessSuggestions.source === 'ai' ? 'AI' : 'heuristic'}) — review &amp; apply
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        const next = { ...factorForm };
                        assessSuggestions.suggestions.forEach((s: any) => { next[s.key] = Number(s.suggested_value); });
                        setFactorForm(next);
                      }}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-sky-600 hover:bg-sky-500 text-white text-[11px]"
                    >
                      <CheckCircle2 className="h-3 w-3" /> Apply all
                    </button>
                  </div>
                  {assessSuggestions.suggestions.map((s: any) => (
                    <div key={s.key} className="flex items-start justify-between gap-2 text-xs">
                      <div className="min-w-0">
                        <p className="text-slate-200">{s.label}: <span className="text-sky-300 font-semibold">{s.suggested_value}</span>{s.current_value != null && <span className="text-slate-500"> (current {s.current_value})</span>}</p>
                        {s.rationale && <p className="text-slate-500">{s.rationale}</p>}
                      </div>
                      <button
                        type="button"
                        onClick={() => setFactorForm({ ...factorForm, [s.key]: Number(s.suggested_value) })}
                        className="shrink-0 px-2 py-0.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 text-[11px]"
                      >
                        Apply
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {manualFactors.length === 0 ? (
                <p className="text-xs text-slate-500">No manual factors configured.</p>
              ) : (
                <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                  {manualFactors.map((f: any) => (
                    <div key={f.key}>
                      <label className="block text-sm text-slate-300 mb-1 flex items-center gap-1.5">
                        <User className="h-3 w-3 text-violet-400" /> {f.label}
                      </label>
                      {f.description && <p className="text-xs text-slate-500 mb-1">{f.description}</p>}
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={factorForm[f.key] ?? 0}
                        onChange={(e) => setFactorForm({ ...factorForm, [f.key]: Math.max(0, Math.min(100, Number(e.target.value))) })}
                        className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white"
                      />
                    </div>
                  ))}
                </div>
              )}
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={closeFactorEditor} className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm border border-slate-600">Cancel</button>
                <button type="submit" disabled={updateFactorsMutation.isPending || manualFactors.length === 0} className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium disabled:opacity-50">
                  {updateFactorsMutation.isPending ? 'Saving…' : 'Save & Recompute'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AuditUniversePage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-20"><span className="text-slate-400 text-sm">Loading…</span></div>}>
      <AuditUniverseInner />
    </Suspense>
  );
}