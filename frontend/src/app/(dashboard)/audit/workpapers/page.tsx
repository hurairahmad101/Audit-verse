'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { auditApi } from '@/lib/api';
import {
  FileText, Plus, Search, Filter, CheckCircle, Clock, AlertCircle,
  ChevronDown, ChevronRight, Eye, Pencil, Trash2, X, Save, UserCheck,
  ClipboardList, Loader2,
} from 'lucide-react';

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
  in_review: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  reviewed: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  approved: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  signed_off: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
};

const TYPE_LABELS: Record<string, string> = {
  test: 'Test',
  planning: 'Planning',
  analytical: 'Analytical',
  interview: 'Interview',
  observation: 'Observation',
  walkthrough: 'Walkthrough',
};

export default function WorkpapersPage() {
  const qc = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedEngagement, setSelectedEngagement] = useState<number | undefined>();
  const [showCreate, setShowCreate] = useState(false);
  const [selectedWp, setSelectedWp] = useState<any>(null);
  const [showSignoff, setShowSignoff] = useState<any>(null);
  const [form, setForm] = useState({
    title: '', description: '', engagement_id: '', workpaper_type: 'test', reference_number: '',
  });

  const { data: engagementsData } = useQuery({
    queryKey: ['engagements-list'],
    queryFn: () => auditApi.engagements.getAll().then(r => r.data?.engagements || []),
  });

  const { data: wpData, isLoading } = useQuery({
    queryKey: ['workpapers', selectedEngagement],
    queryFn: () => auditApi.workpapers.getAll(
      selectedEngagement ? { engagement_id: selectedEngagement } : {}
    ).then(r => r.data?.workpapers || r.data || []),
  });

  const createMut = useMutation({
    mutationFn: (data: any) => auditApi.workpapers.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['workpapers'] }); setShowCreate(false); resetForm(); },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => auditApi.workpapers.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['workpapers'] }); setSelectedWp(null); },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => auditApi.workpapers.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workpapers'] }),
  });

  const signoffMut = useMutation({
    mutationFn: ({ id, action, notes }: { id: number; action: string; notes?: string }) =>
      auditApi.workpapers.signoff(id, { action, notes }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['workpapers'] }); setShowSignoff(null); },
  });

  const resetForm = () => setForm({ title: '', description: '', engagement_id: '', workpaper_type: 'test', reference_number: '' });

  const engagements = engagementsData || [];
  const workpapers: any[] = (wpData || []).filter((wp: any) =>
    !searchTerm || wp.title?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Workpapers</h1>
          <p className="text-slate-400 mt-1">Manage audit workpapers, test procedures, and sign-off workflows</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm transition-all"
        >
          <Plus className="h-4 w-4" />
          New Workpaper
        </button>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-700 bg-slate-900/60 text-white text-sm focus:outline-none focus:border-blue-500"
            placeholder="Search workpapers..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
        <select
          className="px-3 py-2 rounded-lg border border-slate-700 bg-slate-900/60 text-slate-300 text-sm focus:outline-none focus:border-blue-500"
          value={selectedEngagement || ''}
          onChange={e => setSelectedEngagement(e.target.value ? Number(e.target.value) : undefined)}
        >
          <option value="">All Engagements</option>
          {engagements.map((e: any) => <option key={e.id} value={e.id}>{e.title}</option>)}
        </select>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
        </div>
      ) : workpapers.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 rounded-xl border border-slate-700/60 bg-slate-900/60">
          <FileText className="h-10 w-10 text-slate-400 mb-3" />
          <p className="text-slate-400">No workpapers found</p>
          <button onClick={() => setShowCreate(true)} className="mt-3 text-blue-400 hover:text-blue-300 text-sm">
            Create your first workpaper
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {workpapers.map((wp: any) => (
            <div key={wp.id} className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-5 hover:border-slate-600 transition-all">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 flex-wrap mb-1">
                    {wp.reference_number && (
                      <span className="text-xs font-mono text-slate-500">{wp.reference_number}</span>
                    )}
                    <span className={`px-2 py-0.5 rounded-full text-xs border ${STATUS_COLORS[wp.status] || STATUS_COLORS.draft}`}>
                      {(wp.status || 'draft').replace('_', ' ')}
                    </span>
                    <span className="px-2 py-0.5 rounded text-xs bg-slate-700 text-slate-300">
                      {TYPE_LABELS[wp.workpaper_type] || wp.workpaper_type}
                    </span>
                  </div>
                  <h3 className="font-semibold text-white truncate">{wp.title}</h3>
                  {wp.engagement_title && (
                    <p className="text-xs text-slate-500 mt-0.5">{wp.engagement_title}</p>
                  )}
                  {wp.conclusion && (
                    <p className="text-sm text-slate-400 mt-2 line-clamp-2">{wp.conclusion}</p>
                  )}
                  <div className="flex gap-4 mt-2 text-xs text-slate-500">
                    {wp.preparer_name && <span>Prepared by: <span className="text-slate-400">{wp.preparer_name}</span></span>}
                    {wp.reviewer_name && <span>Reviewed by: <span className="text-slate-400">{wp.reviewer_name}</span></span>}
                    {wp.procedure_count !== undefined && <span>{wp.procedure_count} procedure(s)</span>}
                  </div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={() => setShowSignoff(wp)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600/20 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-600/30 text-xs transition-all"
                    title="Sign Off"
                  >
                    <UserCheck className="h-3.5 w-3.5" />
                    Sign Off
                  </button>
                  <button
                    onClick={() => setSelectedWp(wp)}
                    className="p-2 rounded-lg border border-slate-700 text-slate-400 hover:text-white hover:border-slate-500 transition-all"
                    title="Edit"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => { if (confirm('Delete this workpaper?')) deleteMut.mutate(wp.id); }}
                    className="p-2 rounded-lg border border-slate-700 text-slate-400 hover:text-red-400 hover:border-red-500/50 transition-all"
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-slate-700">
              <h2 className="text-lg font-semibold text-white">New Workpaper</h2>
              <button onClick={() => { setShowCreate(false); resetForm(); }} className="text-slate-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Title *</label>
                <input
                  className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-900/60 text-white text-sm focus:outline-none focus:border-blue-500"
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="Workpaper title"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Engagement *</label>
                <select
                  className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-900/60 text-white text-sm focus:outline-none focus:border-blue-500"
                  value={form.engagement_id}
                  onChange={e => setForm(f => ({ ...f, engagement_id: e.target.value }))}
                >
                  <option value="">Select engagement...</option>
                  {engagements.map((e: any) => <option key={e.id} value={e.id}>{e.title}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Type</label>
                  <select
                    className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-900/60 text-white text-sm focus:outline-none focus:border-blue-500"
                    value={form.workpaper_type}
                    onChange={e => setForm(f => ({ ...f, workpaper_type: e.target.value }))}
                  >
                    {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Reference #</label>
                  <input
                    className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-900/60 text-white text-sm focus:outline-none focus:border-blue-500"
                    value={form.reference_number}
                    onChange={e => setForm(f => ({ ...f, reference_number: e.target.value }))}
                    placeholder="e.g. WP-001"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Description</label>
                <textarea
                  className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-900/60 text-white text-sm focus:outline-none focus:border-blue-500 resize-none"
                  rows={3}
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Describe the workpaper objective..."
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 p-6 border-t border-slate-700">
              <button onClick={() => { setShowCreate(false); resetForm(); }} className="px-4 py-2 rounded-lg border border-slate-700 text-slate-400 hover:text-white text-sm">
                Cancel
              </button>
              <button
                onClick={() => createMut.mutate({
                  title: form.title,
                  description: form.description,
                  engagement_id: Number(form.engagement_id),
                  workpaper_type: form.workpaper_type,
                  reference_number: form.reference_number || undefined,
                })}
                disabled={!form.title || !form.engagement_id || createMut.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-sm"
              >
                {createMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sign-off Modal */}
      {showSignoff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-slate-700">
              <h2 className="text-lg font-semibold text-white">Sign Off: {showSignoff.title}</h2>
              <button onClick={() => setShowSignoff(null)} className="text-slate-400 hover:text-white"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-400">Select the sign-off action to perform on this workpaper.</p>
              <div className="grid grid-cols-1 gap-2">
                {['prepare', 'review', 'lead_signoff', 'reject'].map(action => (
                  <button
                    key={action}
                    onClick={() => signoffMut.mutate({ id: showSignoff.id, action })}
                    disabled={signoffMut.isPending}
                    className={`px-4 py-3 rounded-lg text-sm font-medium border transition-all text-left ${
                      action === 'reject'
                        ? 'border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20'
                        : action === 'lead_signoff'
                          ? 'border-purple-500/30 bg-purple-500/10 text-purple-400 hover:bg-purple-500/20'
                          : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                    }`}
                  >
                    {action === 'prepare' ? 'Mark as Prepared' :
                     action === 'review' ? 'Mark as Reviewed' :
                     action === 'lead_signoff' ? 'Lead Sign-Off (Final Approval)' :
                     'Reject & Return for Revision'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
