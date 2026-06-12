'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  LayoutDashboard, Globe, Calendar, ClipboardList,
  FileText, AlertTriangle, BarChart3, BookOpen,
  ArrowRight, ArrowLeft, X, Play, CheckCircle,
  Presentation,
} from 'lucide-react';

const steps = [
  {
    number: 1,
    module: 'Audit Overview',
    href: '/audit',
    icon: LayoutDashboard,
    headline: 'Your command center.',
    description:
      'The Audit Overview gives you instant visibility into what matters most. Track your findings closure rate, overdue findings, active engagements, plan completion, and budget utilization — all on one screen. Real-time KPIs so you never miss a signal.',
    highlight:
      'Five live KPI cards. An engagement pipeline across all stages. Coverage gap analysis. Risk heat map. Everything leadership needs at a glance.',
    color: '#2563EB',
  },
  {
    number: 2,
    module: 'Audit Universe',
    href: '/audit/universe',
    icon: Globe,
    headline: 'Map every entity worth auditing.',
    description:
      'The Audit Universe is your living catalog of everything that needs attention — business units, IT systems, processes, third-party vendors, and more. Each entity gets a risk score. AI helps you generate descriptions and rank priorities automatically.',
    highlight:
      'Add, score, and prioritize auditable entities. Sync from your risk register. AI-powered ranking shows you where to focus first.',
    color: '#7C3AED',
  },
  {
    number: 3,
    module: 'Audit Plans',
    href: '/audit/plans',
    icon: Calendar,
    headline: 'From a blank year to a full plan in minutes.',
    description:
      'Audit Plans lets you map out your annual coverage by quarter. Submit plans for board approval, track status across Draft, Submitted, and Approved states, and let AI generate a complete plan based on your risk profile and team capacity.',
    highlight:
      'AI generates a full audit plan in seconds based on your risk universe and headcount. One-click submission triggers the approval workflow.',
    color: '#059669',
  },
  {
    number: 4,
    module: 'Engagements',
    href: '/audit/engagements',
    icon: ClipboardList,
    headline: 'Run every audit from start to finish.',
    description:
      'Engagements guide your team through every phase — Planning, Fieldwork, Reporting, Review, and Close. Track budget vs. actual hours, get AI-generated fieldwork guides, and manage the full lifecycle without switching tools.',
    highlight:
      'AI writes the fieldwork guide. Your team executes. Every step tracked, every hour logged, every sign-off captured.',
    color: '#D97706',
  },
  {
    number: 5,
    module: 'Workpapers',
    href: '/audit/workpapers',
    icon: FileText,
    headline: 'Document everything. Lose nothing.',
    description:
      'Workpapers is where audit evidence lives. Manage test procedures, attach supporting files, and run through the three-level sign-off workflow: Prepare, Review, Lead Sign-off. Every workpaper is linked to its engagement and finding.',
    highlight:
      'Three-level sign-off ensures quality at every stage. Every piece of evidence is linked, versioned, and searchable — no more email chains.',
    color: '#0891B2',
  },
  {
    number: 6,
    module: 'Findings',
    href: '/audit/findings',
    icon: AlertTriangle,
    headline: 'Surface risk. Drive action.',
    description:
      'The Findings module is your central repository for every issue identified. Document findings with CCCE methodology — Condition, Criteria, Cause, Effect — calibrate severity with AI, detect recurring patterns, and escalate issues automatically.',
    highlight:
      'AI-assisted finding drafts. Severity calibration. Recurring issue detection. Multi-level escalation with configurable thresholds.',
    color: '#DC2626',
  },
  {
    number: 7,
    module: 'Analytics',
    href: '/audit/analytics',
    icon: BarChart3,
    headline: 'See the full picture.',
    description:
      'The Analytics module transforms your audit data into strategic insight. Visualize performance trends, coverage gaps, finding distribution by severity, and engagement outcomes over time. The charts your board actually wants to see.',
    highlight:
      'Board-ready charts. Coverage analysis. Performance benchmarks across teams and departments. Export-ready for board packs.',
    color: '#7C3AED',
  },
  {
    number: 8,
    module: 'Compliance Frameworks',
    href: '/audit',
    icon: BookOpen,
    headline: '60+ frameworks, ready to go.',
    description:
      'AuditVerse.AI ships with over 60 built-in compliance frameworks across every major category — financial audit, IT audit, ESG, operational quality, sector-specific regulations, and more. Switch industries without losing your library.',
    highlight:
      'GDPR, HIPAA, SOX, ISO 27001, DORA, NIS2, NERC-CIP, Basel III, GRI, TCFD, FedRAMP, FISMA and 50+ more — all built in.',
    color: '#2563EB',
  },
];

export default function DemoTourPage() {
  const [current, setCurrent] = useState(0);
  const step = steps[current];
  const Icon = step.icon;
  const progress = ((current + 1) / steps.length) * 100;

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between pb-6 border-b border-slate-700/50">
        <div>
          <h1 className="text-2xl font-bold text-black flex items-center gap-2.5">
            <Play className="h-6 w-6 text-blue-400" />
            Product Demo Tour
          </h1>
          <p className="text-slate-400 mt-1 text-sm">Walk through AuditVerse.AI — one module at a time.</p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/pitch"
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-blue-500/30 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-all text-sm font-medium"
          >
            <Presentation className="h-4 w-4" />
            Full Pitch Deck
          </Link>
          <Link
            href="/audit"
            className="flex items-center gap-2 text-slate-400 hover:text-black text-sm transition-colors"
          >
            <X className="h-4 w-4" />
            Exit Tour
          </Link>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-slate-500 uppercase tracking-widest font-semibold">Tour Progress</span>
          <span className="text-xs text-slate-400">{current + 1} of {steps.length} modules</span>
        </div>
        <div className="h-1 bg-slate-700/60 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${progress}%`, background: step.color }}
          />
        </div>
        <div className="flex gap-1.5 mt-2.5">
          {steps.map((s, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              title={s.module}
              className="flex-1 h-1 rounded-full transition-all duration-200 cursor-pointer"
              style={{
                background: i < current ? '#22c55e' : i === current ? step.color : '#334155',
                opacity: i === current ? 1 : i < current ? 0.7 : 0.4,
              }}
            />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 pt-2">
        <div className="lg:col-span-3 space-y-5">
          <div className="flex items-center gap-3">
            <div
              className="h-12 w-12 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: `${step.color}20` }}
            >
              <Icon className="h-6 w-6" style={{ color: step.color }} />
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-widest" style={{ color: step.color }}>
                Step {step.number} of {steps.length}
              </div>
              <div className="text-lg font-bold text-black">{step.module}</div>
            </div>
          </div>

          <h2 className="text-4xl font-black text-black leading-tight tracking-tight">
            {step.headline}
          </h2>

          <p className="text-slate-300 text-base leading-relaxed">
            {step.description}
          </p>

          <div
            className="rounded-xl p-5 border"
            style={{ background: `${step.color}10`, borderColor: `${step.color}30` }}
          >
            <div className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: step.color }}>
              What you'll see
            </div>
            <p className="text-slate-300 text-sm leading-relaxed">{step.highlight}</p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href={step.href}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-white font-semibold text-sm transition-all hover:opacity-90"
              style={{ background: step.color }}
            >
              Open {step.module}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-4 sticky top-4">
            <div className="text-xs font-bold text-white uppercase tracking-widest mb-3">All Modules</div>
            <div className="space-y-0.5">
              {steps.map((s, i) => {
                const StepIcon = s.icon;
                const isActive = i === current;
                const isDone = i < current;
                return (
                  <button
                    key={i}
                    onClick={() => setCurrent(i)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all text-sm ${
                      isActive
                        ? 'bg-slate-700 text-black'
                        : isDone
                        ? 'text-white hover:bg-slate-700/40 hover:text-slate-900'
                        : 'text-white hover:bg-slate-700/40 hover:text-slate-900'
                    }`}
                  >
                    <div
                      className="h-6 w-6 rounded-md flex items-center justify-center flex-shrink-0"
                      style={{ background: isActive ? `${s.color}25` : 'transparent' }}
                    >
                      {isDone ? (
                        <CheckCircle className="h-4 w-4 text-emerald-400" />
                      ) : (
                        <StepIcon
                          className="h-4 w-4"
                          style={{ color: isActive ? s.color : undefined }}
                        />
                      )}
                    </div>
                    <span className="truncate flex-1">{s.module}</span>
                    {isActive && (
                      <div
                        className="h-1.5 w-1.5 rounded-full flex-shrink-0"
                        style={{ background: s.color }}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between pt-6 border-t border-slate-700/50 mt-4">
        <button
          onClick={() => setCurrent(c => Math.max(c - 1, 0))}
          disabled={current === 0}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium border border-gray-400 text-gray-700 hover:bg-gray-100 hover:text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          <ArrowLeft className="h-4 w-4" />
          Previous
        </button>

        {current < steps.length - 1 ? (
          <button
            onClick={() => setCurrent(c => c + 1)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white transition-all hover:opacity-90"
            style={{ background: step.color }}
          >
            Next: {steps[current + 1].module}
            <ArrowRight className="h-4 w-4" />
          </button>
        ) : (
          <Link
            href="/audit"
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-500 transition-all"
          >
            Start using AuditVerse.AI
            <ArrowRight className="h-4 w-4" />
          </Link>
        )}
      </div>
    </div>
  );
}
