'use client';

import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { auditApi } from '@/lib/api';
import { Plus, Search, Edit2, Trash2, X, Loader2, Shield } from 'lucide-react';

const RISK_CATEGORIES = ['strategic', 'operational', 'financial', 'compliance', 'technology', 'third_party', 'project_change'];
const RISK_STATUSES = ['open', 'mitigating', 'closed', 'accepted', 'review'];
const REGISTER_TYPES = ['Internal', 'ISO 27001', 'PCI-DSS', 'SOX', 'NIST', 'GDPR'];

function getRatingBadge(rating: string | null | undefined) {
  switch ((rating || '').toLowerCase()) {
    case 'critical': return 'bg-red-100 text-red-700 border-red-200';
    case 'high': return 'bg-orange-100 text-orange-700 border-orange-200';
    case 'medium': return 'bg-amber-100 text-amber-700 border-amber-200';
    case 'low': return 'bg-green-100 text-green-700 border-green-200';
    default: return 'bg-gray-100 text-gray-600 border-gray-200';
  }
}

function getStatusBadge(status: string | null | undefined) {
  switch ((status || '').toLowerCase()) {
    case 'open': return 'bg-red-50 text-red-600 border-red-200';
    case 'mitigating': return 'bg-amber-50 text-amber-600 border-amber-200';
    case 'closed': return 'bg-green-50 text-green-700 border-green-200';
    case 'accepted': return 'bg-gray-100 text-gray-600 border-gray-200';
    case 'review': return 'bg-blue-50 text-blue-600 border-blue-200';
    default: return 'bg-gray-100 text-gray-600 border-gray-200';
  }
}

const defaultForm = {
  title: '',
  description: '',
  category: 'operational' as string,
  register_type: '' as string,
  owner_id: '' as string | number,
  status: 'open' as string,
  inherent_likelihood: '' as string | number,
  inherent_impact: '' as string | number,
  residual_likelihood: '' as string | number,
  residual_impact: '' as string | number,
  treatment_plan: '',
  due_date: '',
};

export default function RiskRegisterPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingRisk, setEditingRisk] = useState<any>(null);
  const [form, setForm] = useState(defaultForm);

  const { data: risksData, isLoading, refetch } = useQuery({
    queryKey: ['risk-register'],
    queryFn: () => auditApi.riskRegister.getAll().then(r => r.data?.risks || r.data || []),
  });

  const risks = Array.isArray(risksData) ? risksData : [];

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => auditApi.riskRegister.create(data),
    onSuccess: () => { refetch(); closeModal(); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Record<string, unknown> }) => auditApi.riskRegister.update(id, data),
    onSuccess: () => { refetch(); closeModal(); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => auditApi.riskRegister.delete(id),
    onSuccess: () => refetch(),
  });

  function closeModal() {
    setShowModal(false);
    setEditingRisk(null);
    setForm(defaultForm);
  }

  function openEdit(risk: any) {
    setEditingRisk(risk);
    setForm({
      title: risk.title || '',
      description: risk.description || '',
      category: risk.category || 'operational',
      register_type: risk.register_type || '',
      owner_id: risk.owner_id || '',
      status: risk.status || 'open',
      inherent_likelihood: risk.inherent_likelihood ?? '',
      inherent_impact: risk.inherent_impact ?? '',
      residual_likelihood: risk.residual_likelihood ?? '',
      residual_impact: risk.residual_impact ?? '',
      treatment_plan: risk.treatment_plan || '',
      due_date: risk.due_date ? risk.due_date.split('T')[0] : '',
    });
    setShowModal(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload: Record<string, unknown> = {
      title: form.title,
      description: form.description || undefined,
      category: form.category,
      register_type: form.register_type || undefined,
      owner_id: form.owner_id ? Number(form.owner_id) : undefined,
      status: form.status,
      inherent_likelihood: form.inherent_likelihood ? Number(form.inherent_likelihood) : undefined,
      inherent_impact: form.inherent_impact ? Number(form.inherent_impact) : undefined,
      residual_likelihood: form.residual_likelihood ? Number(form.residual_likelihood) : undefined,
      residual_impact: form.residual_impact ? Number(form.residual_impact) : undefined,
      treatment_plan: form.treatment_plan || undefined,
      due_date: form.due_date || undefined,
    };
    if (editingRisk) {
      updateMutation.mutate({ id: editingRisk.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  function handleDelete(id: number) {
    if (window.confirm('Delete this risk entry?')) {
      deleteMutation.mutate(id);
    }
  }

  const filtered = risks.filter((r: any) => {
    if (searchTerm && !r.title?.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    if (filterCategory && r.category !== filterCategory) return false;
    if (filterStatus && r.status !== filterStatus) return false;
    return true;
  });

  // Summary stats
  const openRisks = risks.filter((r: any) => r.status === 'open');
  const categoryStats: Record<string, { count: number; totalResidual: number }> = {};
  for (const r of risks) {
    const cat = r.category || 'unknown';
    if (!categoryStats[cat]) categoryStats[cat] = { count: 0, totalResidual: 0 };
    categoryStats[cat].count += 1;
    categoryStats[cat].totalResidual += r.residual_score || 0;
  }
  const topCategory = Object.entries(categoryStats).sort((a, b) => b[1].count - a[1].count)[0];

  const inputCls = 'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-[var(--color-primary)]" />
            <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Risk Register</h1>
          </div>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">
            Enterprise risks that feed the risk-based audit scoring engine. Link these to auditable entities to drive composite scores.
          </p>
        </div>
        <button
          onClick={() => { setEditingRisk(null); setForm(defaultForm); setShowModal(true); }}
          className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 transition-colors"
        >
          <Plus className="w-4 h-4" /> New Risk
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4 max-w-lg">
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
          <p className="text-sm text-[var(--color-text-secondary)]">Total Open</p>
          <p className="text-3xl font-bold text-[var(--color-text-primary)] mt-1">{openRisks.length}</p>
        </div>
        {topCategory && (
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
            <p className="text-sm text-[var(--color-text-secondary)] capitalize">
              {topCategory[0].replace(/_/g, ' ')}
            </p>
            <p className="text-3xl font-bold text-[var(--color-text-primary)] mt-1">{topCategory[1].count}</p>
            <p className="text-xs text-[var(--color-text-secondary)] mt-1">
              avg {topCategory[1].count > 0 ? Math.round(topCategory[1].totalResidual / topCategory[1].count) : 0}
            </p>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 max-w-lg">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-tertiary)]" />
          <input
            type="text"
            placeholder="Search risks..."
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] py-2 pl-10 pr-4 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
        <select
          value={filterCategory}
          onChange={e => setFilterCategory(e.target.value)}
          className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
        >
          <option value="">All Categories</option>
          {RISK_CATEGORIES.map(c => (
            <option key={c} value={c}>{c.replace(/_/g, ' ').replace(/\b\w/g, s => s.toUpperCase())}</option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
        >
          <option value="">All Statuses</option>
          {RISK_STATUSES.map(s => (
            <option key={s} value={s}>{s.replace(/\b\w/g, c => c.toUpperCase())}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-[var(--color-primary)]" />
        </div>
      ) : (
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
                <th className="text-left px-4 py-3 text-xs font-medium text-[var(--color-text-tertiary)] uppercase tracking-wider">Risk</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-[var(--color-text-tertiary)] uppercase tracking-wider">Category</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-[var(--color-text-tertiary)] uppercase tracking-wider">Inherent</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-[var(--color-text-tertiary)] uppercase tracking-wider">Residual</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-[var(--color-text-tertiary)] uppercase tracking-wider">Rating</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-[var(--color-text-tertiary)] uppercase tracking-wider">Status</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-[var(--color-text-tertiary)] uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center text-[var(--color-text-secondary)]">
                    <Shield className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p className="font-medium">No risks found</p>
                    <p className="text-xs mt-1">Add your first risk to get started</p>
                  </td>
                </tr>
              ) : (
                filtered.map((risk: any) => (
                  <tr key={risk.id} className="border-b border-[var(--color-border)] hover:bg-[var(--color-hover-bg)] transition-colors last:border-0">
                    <td className="px-4 py-3 font-medium text-[var(--color-text-primary)]">{risk.title}</td>
                    <td className="px-4 py-3 text-[var(--color-text-secondary)] capitalize">
                      {(risk.category || '').replace(/_/g, ' ')}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-text-primary)]">{risk.inherent_score ?? '—'}</td>
                    <td className="px-4 py-3 text-[var(--color-text-primary)]">{risk.residual_score ?? '—'}</td>
                    <td className="px-4 py-3">
                      {risk.risk_rating ? (
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium border ${getRatingBadge(risk.risk_rating)}`}>
                          {risk.risk_rating.charAt(0).toUpperCase() + risk.risk_rating.slice(1)}
                        </span>
                      ) : <span className="text-[var(--color-text-tertiary)]">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium border ${getStatusBadge(risk.status)}`}>
                        {risk.status ? risk.status.charAt(0).toUpperCase() + risk.status.slice(1) : '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEdit(risk)}
                          className="p-1.5 rounded-md hover:bg-[var(--color-hover-bg)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(risk.id)}
                          className="p-1.5 rounded-md hover:bg-red-50 text-[var(--color-text-secondary)] hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-2xl rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
                {editingRisk ? 'Edit Risk' : 'New Risk'}
              </h2>
              <button onClick={closeModal} className="p-1 rounded-md hover:bg-[var(--color-hover-bg)] text-[var(--color-text-secondary)]">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">Title *</label>
                <input required value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">Description</label>
                <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={3} className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">Category</label>
                  <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className={inputCls}>
                    {RISK_CATEGORIES.map(c => (
                      <option key={c} value={c}>{c.replace(/_/g, ' ').replace(/\b\w/g, s => s.toUpperCase())}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">Register Type</label>
                  <select value={form.register_type} onChange={e => setForm({ ...form, register_type: e.target.value })} className={inputCls}>
                    <option value="">None</option>
                    {REGISTER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">Status</label>
                  <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} className={inputCls}>
                    {RISK_STATUSES.map(s => (
                      <option key={s} value={s}>{s.replace(/\b\w/g, c => c.toUpperCase())}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">Due Date</label>
                  <input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} className={inputCls} />
                </div>
              </div>
              <div className="border-t border-[var(--color-border)] pt-4">
                <p className="text-sm font-medium text-[var(--color-text-secondary)] mb-3">Risk Scoring</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">Inherent Likelihood (1-5)</label>
                    <input type="number" min={1} max={5} value={form.inherent_likelihood}
                      onChange={e => setForm({ ...form, inherent_likelihood: e.target.value })} className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">Inherent Impact (1-5)</label>
                    <input type="number" min={1} max={5} value={form.inherent_impact}
                      onChange={e => setForm({ ...form, inherent_impact: e.target.value })} className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">Residual Likelihood (1-5)</label>
                    <input type="number" min={1} max={5} value={form.residual_likelihood}
                      onChange={e => setForm({ ...form, residual_likelihood: e.target.value })} className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">Residual Impact (1-5)</label>
                    <input type="number" min={1} max={5} value={form.residual_impact}
                      onChange={e => setForm({ ...form, residual_impact: e.target.value })} className={inputCls} />
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">Treatment Plan</label>
                <textarea value={form.treatment_plan} onChange={e => setForm({ ...form, treatment_plan: e.target.value })} rows={2} className={inputCls} />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={closeModal}
                  className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-hover-bg)] transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={createMutation.isPending || updateMutation.isPending}
                  className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 transition-colors disabled:opacity-50">
                  {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="w-4 h-4 animate-spin" />}
                  {editingRisk ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
