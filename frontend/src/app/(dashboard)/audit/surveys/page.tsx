'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { auditApi } from '@/lib/api';
import {
  MessageSquare, Plus, Search, Send, X, Save, Loader2, Sparkles,
  CheckCircle, Clock, Mail, Users, Eye, Trash2, ChevronDown, ChevronRight,
} from 'lucide-react';

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
  sent: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  in_progress: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  completed: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  closed: 'bg-slate-600/20 text-slate-500 border-slate-600/30',
};

const SURVEY_TYPES = [
  { value: 'pre_audit', label: 'Pre-Audit Questionnaire' },
  { value: 'post_audit', label: 'Post-Audit Satisfaction' },
  { value: 'control_self_assessment', label: 'Control Self-Assessment' },
];

const QUESTION_TYPES = [
  { value: 'text', label: 'Short Text' },
  { value: 'textarea', label: 'Long Text' },
  { value: 'yesno', label: 'Yes / No' },
  { value: 'rating', label: 'Rating (1-5)' },
  { value: 'multiple_choice', label: 'Multiple Choice' },
];

export default function SurveysPage() {
  const qc = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [selectedSurvey, setSelectedSurvey] = useState<any>(null);
  const [generatingAI, setGeneratingAI] = useState(false);
  const [form, setForm] = useState({
    title: '', description: '', survey_type: 'pre_audit', engagement_id: '',
    due_date: '', recipient_emails_text: '',
  });
  const [questions, setQuestions] = useState<any[]>([]);

  const { data: surveysData, isLoading } = useQuery({
    queryKey: ['surveys'],
    queryFn: () => auditApi.surveys.getAll().then(r => r.data?.surveys || []),
  });

  const { data: engagementsData } = useQuery({
    queryKey: ['engagements-simple'],
    queryFn: () => auditApi.engagements.getAll().then(r => r.data?.engagements || []),
  });

  const createMut = useMutation({
    mutationFn: (data: any) => auditApi.surveys.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['surveys'] }); setShowCreate(false); resetForm(); },
  });

  const sendMut = useMutation({
    mutationFn: (id: number) => auditApi.surveys.send(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['surveys'] }),
  });

  const closeMut = useMutation({
    mutationFn: (id: number) => auditApi.surveys.close(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['surveys'] }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => auditApi.surveys.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['surveys'] }),
  });

  const resetForm = () => {
    setForm({ title: '', description: '', survey_type: 'pre_audit', engagement_id: '', due_date: '', recipient_emails_text: '' });
    setQuestions([]);
  };

  const handleAIGenerate = async () => {
    setGeneratingAI(true);
    try {
      const eng = engagementsData?.find((e: any) => e.id === Number(form.engagement_id));
      const res = await auditApi.surveys.aiGenerateQuestions({
        engagement_title: eng?.title || form.title,
        engagement_scope: eng?.scope,
        survey_type: form.survey_type,
      });
      setQuestions(res.data?.questions || []);
    } catch (e) { console.error(e); }
    finally { setGeneratingAI(false); }
  };

  const addQuestion = () => {
    const id = `q${questions.length + 1}`;
    setQuestions(qs => [...qs, { id, text: '', type: 'text', required: true }]);
  };

  const updateQuestion = (idx: number, updates: any) => {
    setQuestions(qs => qs.map((q, i) => i === idx ? { ...q, ...updates } : q));
  };

  const removeQuestion = (idx: number) => setQuestions(qs => qs.filter((_, i) => i !== idx));

  const surveys = (surveysData || []).filter((s: any) =>
    !searchTerm || s.title?.toLowerCase().includes(searchTerm.toLowerCase())
  );
  const engagements = engagementsData || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Surveys & Questionnaires</h1>
          <p className="text-slate-400 mt-1">Send pre-audit questionnaires and control self-assessments to auditees</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm transition-all"
        >
          <Plus className="h-4 w-4" />
          New Survey
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <input
          className="w-full max-w-sm pl-9 pr-3 py-2 rounded-lg border border-slate-700 bg-slate-900/60 text-white text-sm focus:outline-none focus:border-blue-500"
          placeholder="Search surveys..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40"><Loader2 className="h-8 w-8 animate-spin text-blue-400" /></div>
      ) : surveys.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 rounded-xl border border-slate-700/60 bg-slate-900/60">
          <MessageSquare className="h-10 w-10 text-slate-400 mb-3" />
          <p className="text-slate-400">No surveys yet</p>
          <button onClick={() => setShowCreate(true)} className="mt-3 text-blue-400 hover:text-blue-300 text-sm">Create your first survey</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {surveys.map((s: any) => (
            <div key={s.id} className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-5 hover:border-slate-600 transition-all flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <span className={`px-2 py-0.5 rounded-full text-xs border mb-2 inline-block ${STATUS_COLORS[s.status] || STATUS_COLORS.draft}`}>
                    {(s.status || 'draft').replace('_', ' ')}
                  </span>
                  <h3 className="font-semibold text-white truncate">{s.title}</h3>
                  <p className="text-xs text-slate-500 mt-0.5">{SURVEY_TYPES.find(t => t.value === s.survey_type)?.label || s.survey_type}</p>
                </div>
              </div>
              {s.engagement_title && (
                <p className="text-xs text-slate-500">Engagement: {s.engagement_title}</p>
              )}
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-slate-900/60 rounded-lg p-2">
                  <p className="text-lg font-bold text-white">{s.questions?.length || 0}</p>
                  <p className="text-xs text-slate-500">Questions</p>
                </div>
                <div className="bg-slate-900/60 rounded-lg p-2">
                  <p className="text-lg font-bold text-emerald-400">{s.responses_summary?.submitted || 0}</p>
                  <p className="text-xs text-slate-500">Submitted</p>
                </div>
                <div className="bg-slate-900/60 rounded-lg p-2">
                  <p className="text-lg font-bold text-amber-400">{s.responses_summary?.pending || 0}</p>
                  <p className="text-xs text-slate-500">Pending</p>
                </div>
              </div>
              {s.due_date && (
                <p className="text-xs text-slate-500 flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Due: {new Date(s.due_date).toLocaleDateString()}
                </p>
              )}
              <div className="flex gap-2 mt-auto">
                {s.status === 'draft' && (
                  <button
                    onClick={() => sendMut.mutate(s.id)}
                    disabled={sendMut.isPending}
                    className="flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs transition-all"
                  >
                    <Send className="h-3 w-3" />
                    Send
                  </button>
                )}
                {s.status === 'sent' || s.status === 'in_progress' ? (
                  <button
                    onClick={() => closeMut.mutate(s.id)}
                    className="flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-lg border border-slate-700 text-slate-400 hover:text-white text-xs"
                  >
                    <CheckCircle className="h-3 w-3" />
                    Close
                  </button>
                ) : null}
                <button
                  onClick={() => { if (confirm('Delete this survey?')) deleteMut.mutate(s.id); }}
                  className="p-2 rounded-lg border border-slate-700 text-slate-400 hover:text-red-400 hover:border-red-500/50 transition-all"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Survey Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-slate-700 flex-shrink-0">
              <h2 className="text-lg font-semibold text-white">New Survey</h2>
              <button onClick={() => { setShowCreate(false); resetForm(); }} className="text-slate-400 hover:text-white"><X className="h-5 w-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="text-xs text-slate-400 mb-1 block">Survey Title *</label>
                  <input
                    className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-900/60 text-white text-sm focus:outline-none focus:border-blue-500"
                    value={form.title}
                    onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                    placeholder="e.g. Pre-Audit Questionnaire - IT Controls"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Type</label>
                  <select
                    className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-900/60 text-white text-sm focus:outline-none focus:border-blue-500"
                    value={form.survey_type}
                    onChange={e => setForm(f => ({ ...f, survey_type: e.target.value }))}
                  >
                    {SURVEY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Engagement (optional)</label>
                  <select
                    className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-900/60 text-white text-sm focus:outline-none focus:border-blue-500"
                    value={form.engagement_id}
                    onChange={e => setForm(f => ({ ...f, engagement_id: e.target.value }))}
                  >
                    <option value="">None</option>
                    {engagements.map((e: any) => <option key={e.id} value={e.id}>{e.title}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Due Date</label>
                  <input
                    type="date"
                    className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-900/60 text-white text-sm focus:outline-none focus:border-blue-500"
                    value={form.due_date}
                    onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Recipient Emails (comma-separated)</label>
                  <input
                    className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-900/60 text-white text-sm focus:outline-none focus:border-blue-500"
                    placeholder="e.g. manager@co.com, owner@co.com"
                    value={form.recipient_emails_text}
                    onChange={e => setForm(f => ({ ...f, recipient_emails_text: e.target.value }))}
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-medium text-white">Questions ({questions.length})</label>
                  <div className="flex gap-2">
                    <button
                      onClick={handleAIGenerate}
                      disabled={generatingAI}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-purple-600/20 border border-purple-500/30 text-purple-400 hover:bg-purple-600/30 text-xs transition-all"
                    >
                      {generatingAI ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                      AI Generate
                    </button>
                    <button
                      onClick={addQuestion}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-700 text-slate-400 hover:text-white text-xs transition-all"
                    >
                      <Plus className="h-3 w-3" />
                      Add Question
                    </button>
                  </div>
                </div>
                <div className="space-y-3">
                  {questions.map((q, idx) => (
                    <div key={idx} className="bg-slate-900/60 rounded-lg p-4 border border-slate-700/60">
                      <div className="flex gap-3 items-start">
                        <span className="text-xs text-slate-500 mt-2 w-6 flex-shrink-0">Q{idx + 1}</span>
                        <div className="flex-1 space-y-2">
                          <input
                            className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-900 text-white text-sm focus:outline-none focus:border-blue-500"
                            value={q.text}
                            onChange={e => updateQuestion(idx, { text: e.target.value })}
                            placeholder="Question text..."
                          />
                          <div className="flex gap-2">
                            <select
                              className="px-2 py-1.5 rounded-lg border border-slate-700 bg-slate-900 text-slate-300 text-xs focus:outline-none"
                              value={q.type}
                              onChange={e => updateQuestion(idx, { type: e.target.value })}
                            >
                              {QUESTION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                            </select>
                            <label className="flex items-center gap-1 text-xs text-slate-400 cursor-pointer">
                              <input type="checkbox" checked={q.required} onChange={e => updateQuestion(idx, { required: e.target.checked })} className="rounded" />
                              Required
                            </label>
                          </div>
                        </div>
                        <button onClick={() => removeQuestion(idx)} className="text-slate-500 hover:text-red-400 p-1">
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 p-6 border-t border-slate-700 flex-shrink-0">
              <button onClick={() => { setShowCreate(false); resetForm(); }} className="px-4 py-2 rounded-lg border border-slate-700 text-slate-400 hover:text-white text-sm">Cancel</button>
              <button
                onClick={() => createMut.mutate({
                  title: form.title,
                  description: form.description,
                  survey_type: form.survey_type,
                  engagement_id: form.engagement_id ? Number(form.engagement_id) : undefined,
                  due_date: form.due_date || undefined,
                  questions,
                  recipient_emails: form.recipient_emails_text.split(',').map(e => e.trim()).filter(Boolean),
                })}
                disabled={!form.title || createMut.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-sm"
              >
                {createMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Create Survey
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
