'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { auditApi } from '@/lib/api';
import {
  ExternalLink, Plus, Copy, Shield, Clock, Users, X, Save, Loader2,
  CheckCircle, AlertTriangle, Trash2, Link, Mail, Building2, Eye,
} from 'lucide-react';

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  expired: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
  revoked: 'bg-red-500/20 text-red-400 border-red-500/30',
};

const AUDIT_TYPES = [
  { value: 'external_audit', label: 'External Audit' },
  { value: 'regulatory', label: 'Regulatory Inspection' },
  { value: 'certification', label: 'Certification Audit' },
];

export default function ExternalPortalPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [selectedSession, setSelectedSession] = useState<any>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [form, setForm] = useState({
    auditor_name: '', auditor_email: '', auditor_firm: '',
    audit_type: 'external_audit', engagement_id: '',
    expires_days: 30, notes: '',
  });
  const [pbcItems, setPbcItems] = useState<any[]>([]);
  const [newPbcItem, setNewPbcItem] = useState('');

  const { data: sessionsData, isLoading } = useQuery({
    queryKey: ['ext-portal-sessions'],
    queryFn: () => auditApi.externalPortal.getAll().then(r => r.data?.sessions || []),
  });

  const { data: engagementsData } = useQuery({
    queryKey: ['engagements-simple'],
    queryFn: () => auditApi.engagements.getAll().then(r => r.data?.engagements || []),
  });

  const createMut = useMutation({
    mutationFn: (data: any) => auditApi.externalPortal.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ext-portal-sessions'] }); setShowCreate(false); resetForm(); },
  });

  const revokeMut = useMutation({
    mutationFn: (id: number) => auditApi.externalPortal.revoke(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ext-portal-sessions'] }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => auditApi.externalPortal.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ext-portal-sessions'] }); setSelectedSession(null); },
  });

  const resetForm = () => {
    setForm({ auditor_name: '', auditor_email: '', auditor_firm: '', audit_type: 'external_audit', engagement_id: '', expires_days: 30, notes: '' });
    setPbcItems([]);
    setNewPbcItem('');
  };

  const copyPortalLink = (token: string) => {
    const url = `${window.location.origin}/audit/portal/access/${token}`;
    navigator.clipboard.writeText(url);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  const addPbcItem = () => {
    if (!newPbcItem.trim()) return;
    setPbcItems(items => [...items, { id: `pbc-${Date.now()}`, description: newPbcItem.trim(), status: 'pending', required_by: '' }]);
    setNewPbcItem('');
  };

  const sessions = sessionsData || [];
  const engagements = engagementsData || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">External Auditor Portal</h1>
          <p className="text-slate-400 mt-1">Create secure access portals for external auditors to submit PBC items and view shared documents</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm transition-all">
          <Plus className="h-4 w-4" />
          New Portal Access
        </button>
      </div>

      {/* Summary Stats */}
      {sessions.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Active Portals', value: sessions.filter((s: any) => s.status === 'active').length, color: 'text-emerald-400' },
            { label: 'Total Auditors', value: sessions.length, color: 'text-blue-400' },
            { label: 'PBC Items Pending', value: sessions.reduce((acc: number, s: any) => acc + (s.pbc_stats?.pending || 0), 0), color: 'text-amber-400' },
          ].map((stat, i) => (
            <div key={i} className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-4 text-center">
              <p className={`text-3xl font-bold ${stat.color}`}>{stat.value}</p>
              <p className="text-xs text-slate-400 mt-1">{stat.label}</p>
            </div>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center h-40"><Loader2 className="h-8 w-8 animate-spin text-blue-400" /></div>
      ) : sessions.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 rounded-xl border border-slate-700/60 bg-slate-900/60">
          <ExternalLink className="h-10 w-10 text-slate-400 mb-3" />
          <p className="text-slate-400">No external auditor portals yet</p>
          <p className="text-slate-500 text-sm mt-1">Create a portal to share documents and track PBC requests</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {sessions.map((s: any) => (
            <div key={s.id} className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-5 hover:border-slate-600 transition-all">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`px-2 py-0.5 rounded-full text-xs border ${STATUS_COLORS[s.status] || STATUS_COLORS.active}`}>{s.status}</span>
                    <span className="text-xs text-slate-500">{AUDIT_TYPES.find(t => t.value === s.audit_type)?.label || s.audit_type}</span>
                  </div>
                  <h3 className="font-semibold text-white">{s.auditor_name}</h3>
                  {s.auditor_firm && <p className="text-xs text-slate-500"><Building2 className="h-3 w-3 inline mr-1" />{s.auditor_firm}</p>}
                  <p className="text-xs text-slate-500 mt-0.5"><Mail className="h-3 w-3 inline mr-1" />{s.auditor_email}</p>
                </div>
                <div className="flex gap-1">
                  {s.status === 'active' && (
                    <button
                      onClick={() => copyPortalLink(s.access_token)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600/20 border border-blue-500/30 text-blue-400 hover:bg-blue-600/30 text-xs transition-all"
                      title="Copy portal link"
                    >
                      {copiedToken === s.access_token ? <CheckCircle className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      {copiedToken === s.access_token ? 'Copied!' : 'Copy Link'}
                    </button>
                  )}
                </div>
              </div>

              {s.engagement_title && (
                <p className="text-xs text-slate-500 mb-3">Engagement: <span className="text-slate-300">{s.engagement_title}</span></p>
              )}

              <div className="grid grid-cols-3 gap-2 mb-4">
                <div className="bg-slate-900/60 rounded-lg p-2 text-center border border-slate-700/30">
                  <p className="text-lg font-bold text-white">{s.pbc_stats?.total || 0}</p>
                  <p className="text-xs text-slate-500">PBC Items</p>
                </div>
                <div className="bg-slate-900/60 rounded-lg p-2 text-center border border-slate-700/30">
                  <p className="text-lg font-bold text-emerald-400">{s.pbc_stats?.submitted || 0}</p>
                  <p className="text-xs text-slate-500">Submitted</p>
                </div>
                <div className="bg-slate-900/60 rounded-lg p-2 text-center border border-slate-700/30">
                  <p className="text-lg font-bold text-amber-400">{s.shared_document_ids?.length || 0}</p>
                  <p className="text-xs text-slate-500">Documents</p>
                </div>
              </div>

              {s.expires_at && (
                <p className="text-xs text-slate-500 mb-4 flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Expires: {new Date(s.expires_at).toLocaleDateString()}
                </p>
              )}

              <div className="flex gap-2">
                {s.status === 'active' && (
                  <button onClick={() => revokeMut.mutate(s.id)} className="flex-1 px-3 py-2 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 text-xs transition-all">
                    Revoke Access
                  </button>
                )}
                <button onClick={() => { if (confirm('Delete this portal?')) deleteMut.mutate(s.id); }} className="p-2 rounded-lg border border-slate-700 text-slate-400 hover:text-red-400 hover:border-red-500/50 transition-all">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-xl max-h-[90vh] flex flex-col rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-slate-700 flex-shrink-0">
              <h2 className="text-lg font-semibold text-white">New External Auditor Portal</h2>
              <button onClick={() => { setShowCreate(false); resetForm(); }} className="text-slate-400 hover:text-white"><X className="h-5 w-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Auditor Name *</label>
                  <input className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-900/60 text-white text-sm focus:outline-none focus:border-blue-500" value={form.auditor_name} onChange={e => setForm(f => ({ ...f, auditor_name: e.target.value }))} placeholder="Full name" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Email *</label>
                  <input type="email" className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-900/60 text-white text-sm focus:outline-none focus:border-blue-500" value={form.auditor_email} onChange={e => setForm(f => ({ ...f, auditor_email: e.target.value }))} placeholder="auditor@firm.com" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Firm</label>
                  <input className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-900/60 text-white text-sm focus:outline-none focus:border-blue-500" value={form.auditor_firm} onChange={e => setForm(f => ({ ...f, auditor_firm: e.target.value }))} placeholder="Audit firm name" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Audit Type</label>
                  <select className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-900/60 text-white text-sm focus:outline-none focus:border-blue-500" value={form.audit_type} onChange={e => setForm(f => ({ ...f, audit_type: e.target.value }))}>
                    {AUDIT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Engagement</label>
                  <select className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-900/60 text-white text-sm focus:outline-none focus:border-blue-500" value={form.engagement_id} onChange={e => setForm(f => ({ ...f, engagement_id: e.target.value }))}>
                    <option value="">None</option>
                    {engagements.map((e: any) => <option key={e.id} value={e.id}>{e.title}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Access Expires (days)</label>
                  <input type="number" min={1} max={365} className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-900/60 text-white text-sm focus:outline-none focus:border-blue-500" value={form.expires_days} onChange={e => setForm(f => ({ ...f, expires_days: Number(e.target.value) }))} />
                </div>
              </div>
              {/* PBC Items */}
              <div>
                <label className="text-sm font-medium text-white mb-2 block">PBC Request List</label>
                <div className="flex gap-2 mb-3">
                  <input className="flex-1 px-3 py-2 rounded-lg border border-slate-700 bg-slate-900/60 text-white text-sm focus:outline-none focus:border-blue-500" value={newPbcItem} onChange={e => setNewPbcItem(e.target.value)} placeholder="e.g. Trial balance Q4 2024..." onKeyDown={e => e.key === 'Enter' && addPbcItem()} />
                  <button onClick={addPbcItem} className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm"><Plus className="h-4 w-4" /></button>
                </div>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {pbcItems.map((item, i) => (
                    <div key={item.id} className="flex items-center justify-between bg-slate-900/60 rounded-lg px-3 py-2 border border-slate-700/60">
                      <span className="text-sm text-slate-300">{item.description}</span>
                      <button onClick={() => setPbcItems(items => items.filter((_, idx) => idx !== i))} className="text-slate-500 hover:text-red-400"><X className="h-4 w-4" /></button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 p-6 border-t border-slate-700 flex-shrink-0">
              <button onClick={() => { setShowCreate(false); resetForm(); }} className="px-4 py-2 rounded-lg border border-slate-700 text-slate-400 hover:text-white text-sm">Cancel</button>
              <button
                onClick={() => createMut.mutate({ ...form, engagement_id: form.engagement_id ? Number(form.engagement_id) : undefined, pbc_items: pbcItems })}
                disabled={!form.auditor_name || !form.auditor_email || createMut.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-sm"
              >
                {createMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link className="h-4 w-4" />}
                Create Portal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
