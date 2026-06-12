'use client';

import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { auditApi } from '@/lib/api';
import {
  FolderOpen, Plus, Search, Upload, Trash2, X, Save, Loader2,
  FileText, Shield, Eye, Filter, File, Lock,
} from 'lucide-react';

const TYPE_OPTIONS = [
  { value: 'evidence', label: 'Evidence', color: 'text-blue-400' },
  { value: 'working_paper', label: 'Working Paper', color: 'text-purple-400' },
  { value: 'report', label: 'Report', color: 'text-emerald-400' },
  { value: 'correspondence', label: 'Correspondence', color: 'text-amber-400' },
  { value: 'charter', label: 'Charter', color: 'text-cyan-400' },
  { value: 'other', label: 'Other', color: 'text-slate-400' },
];

function formatSize(bytes: number | null): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DocumentsPage() {
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({
    title: '', description: '', document_type: 'evidence',
    engagement_id: '', is_confidential: false,
  });

  const { data: statsData } = useQuery({
    queryKey: ['doc-stats'],
    queryFn: () => auditApi.documents.getStats().then(r => r.data),
  });

  const { data: docsData, isLoading } = useQuery({
    queryKey: ['audit-docs', searchTerm, filterType],
    queryFn: () => auditApi.documents.getAll({
      search: searchTerm || undefined,
      document_type: filterType || undefined,
    }).then(r => r.data?.documents || []),
  });

  const { data: engagementsData } = useQuery({
    queryKey: ['engagements-simple'],
    queryFn: () => auditApi.engagements.getAll().then(r => r.data?.engagements || []),
  });

  const createMut = useMutation({
    mutationFn: (data: any) => auditApi.documents.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['audit-docs'] }); qc.invalidateQueries({ queryKey: ['doc-stats'] }); setShowCreate(false); },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => auditApi.documents.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['audit-docs'] }); qc.invalidateQueries({ queryKey: ['doc-stats'] }); },
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('title', file.name.replace(/\.[^/.]+$/, ''));
      fd.append('document_type', 'evidence');
      await auditApi.documents.upload(fd);
      qc.invalidateQueries({ queryKey: ['audit-docs'] });
      qc.invalidateQueries({ queryKey: ['doc-stats'] });
    } catch (err) { console.error(err); }
    finally { setUploading(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
  };

  const docs = docsData || [];
  const engagements = engagementsData || [];
  const stats = statsData || {};

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Document Repository</h1>
          <p className="text-slate-400 mt-1">Centralised storage for audit evidence, working papers and reports</p>
        </div>
        <div className="flex gap-2">
          <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileUpload} />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-700 text-slate-300 hover:text-white hover:border-slate-500 text-sm transition-all"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Upload File
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm transition-all"
          >
            <Plus className="h-4 w-4" />
            Add Document
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Documents', value: stats.total || 0, icon: FolderOpen, color: 'text-blue-400' },
          { label: 'Confidential', value: stats.confidential_count || 0, icon: Lock, color: 'text-red-400' },
          { label: 'Storage Used', value: `${stats.total_size_mb || 0} MB`, icon: File, color: 'text-purple-400' },
          { label: 'Document Types', value: Object.keys(stats.by_type || {}).length, icon: FileText, color: 'text-emerald-400' },
        ].map((s, i) => (
          <div key={i} className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-4">
            <s.icon className={`h-5 w-5 ${s.color} mb-2`} />
            <p className="text-2xl font-bold text-white">{s.value}</p>
            <p className="text-xs text-slate-400">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-700 bg-slate-900/60 text-white text-sm focus:outline-none focus:border-blue-500"
            placeholder="Search documents..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
        <select
          className="px-3 py-2 rounded-lg border border-slate-700 bg-slate-900/60 text-slate-300 text-sm focus:outline-none"
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
        >
          <option value="">All Types</option>
          {TYPE_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>

      {/* Documents Table */}
      {isLoading ? (
        <div className="flex items-center justify-center h-40"><Loader2 className="h-8 w-8 animate-spin text-blue-400" /></div>
      ) : docs.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 rounded-xl border border-slate-700/60 bg-slate-900/60">
          <FolderOpen className="h-10 w-10 text-slate-400 mb-3" />
          <p className="text-slate-400">No documents found</p>
          <p className="text-slate-500 text-sm mt-1">Upload files or add document records</p>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-700/60 bg-slate-900/60 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-700">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">Document</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">Type</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">Engagement</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">Size</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">Uploaded</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {docs.map((doc: any) => {
                const typeInfo = TYPE_OPTIONS.find(t => t.value === doc.document_type);
                return (
                  <tr key={doc.id} className="hover:bg-slate-700/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <FileText className="h-4 w-4 text-slate-500 flex-shrink-0" />
                        <div>
                          <p className="font-medium text-white">{doc.title}</p>
                          {doc.file_name && <p className="text-xs text-slate-500">{doc.file_name}</p>}
                        </div>
                        {doc.is_confidential && (
                          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-red-500/10 text-red-400 border border-red-500/20">
                            <Lock className="h-2.5 w-2.5" /> Confidential
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium ${typeInfo?.color || 'text-slate-400'}`}>{typeInfo?.label || doc.document_type}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs">{doc.engagement_title || '—'}</td>
                    <td className="px-4 py-3 text-slate-400 text-xs">{formatSize(doc.file_size)}</td>
                    <td className="px-4 py-3 text-slate-400 text-xs">
                      {doc.created_at ? new Date(doc.created_at).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => { if (confirm('Delete this document?')) deleteMut.mutate(doc.id); }}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-all"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-slate-700">
              <h2 className="text-lg font-semibold text-white">Add Document</h2>
              <button onClick={() => setShowCreate(false)} className="text-slate-400 hover:text-white"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Title *</label>
                <input className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-900/60 text-white text-sm focus:outline-none focus:border-blue-500" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Document title" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Type</label>
                  <select className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-900/60 text-white text-sm focus:outline-none focus:border-blue-500" value={form.document_type} onChange={e => setForm(f => ({ ...f, document_type: e.target.value }))}>
                    {TYPE_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Engagement</label>
                  <select className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-900/60 text-white text-sm focus:outline-none focus:border-blue-500" value={form.engagement_id} onChange={e => setForm(f => ({ ...f, engagement_id: e.target.value }))}>
                    <option value="">None</option>
                    {engagements.map((e: any) => <option key={e.id} value={e.id}>{e.title}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Description</label>
                <textarea className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-900/60 text-white text-sm focus:outline-none focus:border-blue-500 resize-none" rows={3} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.is_confidential} onChange={e => setForm(f => ({ ...f, is_confidential: e.target.checked }))} className="rounded" />
                <span className="text-sm text-slate-300">Mark as Confidential</span>
              </label>
            </div>
            <div className="flex justify-end gap-3 p-6 border-t border-slate-700">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 rounded-lg border border-slate-700 text-slate-400 hover:text-white text-sm">Cancel</button>
              <button
                onClick={() => createMut.mutate({ title: form.title, description: form.description, document_type: form.document_type, engagement_id: form.engagement_id ? Number(form.engagement_id) : undefined, is_confidential: form.is_confidential })}
                disabled={!form.title || createMut.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-sm"
              >
                {createMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Add Document
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
