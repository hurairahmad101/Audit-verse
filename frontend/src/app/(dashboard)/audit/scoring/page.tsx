'use client';

import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { auditApi } from '@/lib/api';
import {
  Gauge,
  Sparkles,
  RotateCcw,
  Save,
  Play,
  Info,
  Layers,
  User,
} from 'lucide-react';

interface FactorDef {
  key: string;
  label: string;
  default_weight: number;
  source: 'auto' | 'manual';
  description: string;
}

interface ConfigResponse {
  weights: Record<string, number>;
  factors: FactorDef[];
  default_weights: Record<string, number>;
  updated_at: string | null;
}

function sourceBadge(source: string) {
  return source === 'auto'
    ? 'bg-sky-500/10 text-sky-400 border-sky-500/20'
    : 'bg-violet-500/10 text-violet-400 border-violet-500/20';
}

export default function RiskScoringPage() {
  const queryClient = useQueryClient();
  const [weights, setWeights] = useState<Record<string, number>>({});
  const [runResult, setRunResult] = useState<string | null>(null);

  const { data, isLoading } = useQuery<ConfigResponse>({
    queryKey: ['scoring-config'],
    queryFn: async () => (await auditApi.scoring.getConfig()).data,
  });

  const seeded = React.useRef(false);
  useEffect(() => {
    if (data?.weights && !seeded.current) {
      seeded.current = true;
      setWeights({ ...data.weights });
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async (w: Record<string, number>) =>
      (await auditApi.scoring.updateConfig({ weights: w })).data,
    onSuccess: (_res, savedWeights) => {
      // Patch the cache with the values we just saved so the useEffect
      // does not reset sliders to whatever the API returns (which may be
      // fractional/normalised values that map to near-zero on max=40).
      queryClient.setQueryData(['scoring-config'], (old: ConfigResponse | undefined) =>
        old ? { ...old, weights: savedWeights } : old
      );
      setRunResult('Weights saved.');
    },
  });

  const runMutation = useMutation({
    mutationFn: async () => (await auditApi.scoring.run()).data,
    onSuccess: (res: any) => {
      setRunResult(res?.message || 'Scoring complete.');
      queryClient.invalidateQueries({ queryKey: ['audit-entities'] });
    },
  });

  const factors = data?.factors || [];
  const totalWeight = Object.values(weights).reduce((s, v) => s + (Number(v) || 0), 0);

  const setWeight = (key: string, value: number) =>
    setWeights((prev) => ({ ...prev, [key]: value }));

  const resetDefaults = () => {
    if (data?.default_weights) setWeights({ ...data.default_weights });
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Gauge className="w-6 h-6 text-emerald-400" /> Risk Scoring Model
          </h1>
          <p className="text-slate-400 mt-1 text-sm">
            Configure factor weights for the risk-based audit scoring engine, then recompute
            composite scores across the audit universe.
          </p>
        </div>
        <button
          onClick={() => runMutation.mutate()}
          disabled={runMutation.isPending}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium disabled:opacity-50"
        >
          <Play className="w-4 h-4" />
          {runMutation.isPending ? 'Scoring…' : 'Run Scoring'}
        </button>
      </div>

      {runResult && (
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-black px-4 py-3 text-sm flex items-center gap-2">
          <Sparkles className="w-4 h-4" /> {runResult}
        </div>
      )}

      <div className="rounded-xl border border-slate-700/60 bg-slate-800/40 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Layers className="w-5 h-5 text-slate-400" /> Factor Weights
          </h2>
          <div className="flex items-center gap-3">
            <span
              className={`text-sm font-medium ${
                Math.round(totalWeight) === 100 ? 'text-emerald-400' : 'text-amber-400'
              }`}
            >
              Total: {totalWeight.toFixed(0)} (normalized at runtime)
            </span>
            <button
              onClick={resetDefaults}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-700/50 text-xs"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Reset
            </button>
            <button
              onClick={() => saveMutation.mutate(weights)}
              disabled={saveMutation.isPending}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-xs disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" /> Save Weights
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="text-slate-400 text-sm py-8 text-center">Loading model…</div>
        ) : (
          <div className="space-y-4">
            {factors.map((f) => {
              const w = Number(weights[f.key] ?? f.default_weight);
              const pct = totalWeight > 0 ? (w / totalWeight) * 100 : 0;
              return (
                <div key={f.key} className="rounded-lg border border-slate-700/50 bg-slate-900/40 p-4">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-white font-medium">{f.label}</span>
                      <span className={`text-[10px] uppercase px-1.5 py-0.5 rounded border ${sourceBadge(f.source)}`}>
                        {f.source === 'auto' ? (
                          <span className="inline-flex items-center gap-1">
                            <Sparkles className="w-3 h-3" /> Auto
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1">
                            <User className="w-3 h-3" /> Manual
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        value={w}
                        onChange={(e) => setWeight(f.key, Number(e.target.value))}
                        className="w-20 bg-slate-800 border border-slate-600 rounded px-2 py-1 text-sm text-white text-right"
                      />
                      <span className="text-xs text-slate-400 w-12 text-right">{pct.toFixed(0)}%</span>
                    </div>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={40}
                    value={w}
                    onChange={(e) => setWeight(f.key, Number(e.target.value))}
                    className="w-full accent-emerald-500"
                  />
                  <p className="text-xs text-slate-500 mt-1.5 flex items-start gap-1.5">
                    <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" /> {f.description}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <p className="text-xs text-slate-500">
        Auto factors are derived from linked risks, findings history, 3LoD assurance gaps, and audit
        recency. Manual factors are analyst inputs set per entity. After saving weights, run scoring
        to update composite scores and ratings across the audit universe.
      </p>
    </div>
  );
}
