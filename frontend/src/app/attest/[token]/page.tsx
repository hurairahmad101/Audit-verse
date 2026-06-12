'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Shield, Loader2, CheckCircle2, AlertTriangle, Send } from 'lucide-react';

interface LinkContext {
  link: {
    owner_name?: string | null;
    owner_email?: string | null;
    period_label?: string | null;
    instructions?: string | null;
    expires_at?: string | null;
    max_uses?: number | null;
    use_count: number;
  };
  entity: {
    id: number | null;
    name: string | null;
    entity_type: string | null;
    description?: string | null;
  };
}

const EFFECTIVENESS = [
  { value: 'effective', label: 'Effective' },
  { value: 'partially_effective', label: 'Partially Effective' },
  { value: 'ineffective', label: 'Ineffective' },
  { value: 'not_tested', label: 'Not Tested' },
];

export default function PublicAttestationPage() {
  const params = useParams();
  const token = String(params?.token || '');

  const [loading, setLoading] = useState(true);
  const [ctx, setCtx] = useState<LinkContext | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [submitterName, setSubmitterName] = useState('');
  const [submitterEmail, setSubmitterEmail] = useState('');
  const [controlDescription, setControlDescription] = useState('');
  const [designEffectiveness, setDesignEffectiveness] = useState('effective');
  const [operatingEffectiveness, setOperatingEffectiveness] = useState('effective');
  const [evidenceLink, setEvidenceLink] = useState('');
  const [notes, setNotes] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const res = await fetch(`/api/audit/tlod/attest/${encodeURIComponent(token)}`, {
          cache: 'no-store',
        });
        if (!res.ok) {
          let msg = `Unable to load attestation link (HTTP ${res.status})`;
          try {
            const body = await res.json();
            if (body?.detail) msg = body.detail;
          } catch { /* noop */ }
          if (!cancelled) setLoadError(msg);
          return;
        }
        const data = (await res.json()) as LinkContext;
        if (cancelled) return;
        setCtx(data);
        if (data.link.owner_name) setSubmitterName(data.link.owner_name);
        if (data.link.owner_email) setSubmitterEmail(data.link.owner_email);
      } catch (err: any) {
        if (!cancelled) setLoadError(err?.message || 'Unable to load attestation link');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!controlDescription.trim()) {
      setSubmitError('Please describe the control(s) you are attesting to.');
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`/api/audit/tlod/attest/${encodeURIComponent(token)}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          submitter_name: submitterName || null,
          submitter_email: submitterEmail || null,
          control_description: controlDescription,
          design_effectiveness: designEffectiveness,
          operating_effectiveness: operatingEffectiveness,
          evidence_link: evidenceLink || null,
          notes: notes || null,
        }),
      });
      if (!res.ok) {
        let msg = `Submission failed (HTTP ${res.status})`;
        try {
          const body = await res.json();
          if (body?.detail) msg = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail);
        } catch { /* noop */ }
        setSubmitError(msg);
        return;
      }
      setSubmitted(true);
    } catch (err: any) {
      setSubmitError(err?.message || 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4">
      <div className="mx-auto max-w-2xl">
        <header className="mb-6 flex items-center gap-3">
          <Shield className="h-7 w-7 text-indigo-600" />
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Management Self-Assessment</h1>
            <p className="text-sm text-slate-600">Submit a 1st-line attestation for your area.</p>
          </div>
        </header>

        {loading && (
          <div className="rounded-lg border bg-white p-6 text-sm text-slate-600 flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading attestation request…
          </div>
        )}

        {!loading && loadError && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-800 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 mt-0.5" />
            <div>
              <div className="font-medium">This attestation link is not available</div>
              <div className="mt-1">{loadError}</div>
              <div className="mt-2 text-xs text-red-700">
                If you believe this is a mistake, please contact the person who sent you this link.
              </div>
            </div>
          </div>
        )}

        {!loading && !loadError && ctx && submitted && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-6 text-sm text-green-800 flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 mt-0.5" />
            <div>
              <div className="font-medium">Thank you — your self-assessment was submitted.</div>
              <div className="mt-1">
                Internal Audit will review your response. You may now close this page.
              </div>
            </div>
          </div>
        )}

        {!loading && !loadError && ctx && !submitted && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <section className="rounded-lg border bg-white p-5">
              <div className="text-xs uppercase tracking-wide text-slate-500">Auditable entity</div>
              <div className="mt-1 text-lg font-semibold text-slate-900">
                {ctx.entity.name || `Entity #${ctx.entity.id ?? ''}`}
              </div>
              {ctx.entity.entity_type && (
                <div className="text-xs text-slate-500">{ctx.entity.entity_type}</div>
              )}
              {ctx.link.period_label && (
                <div className="mt-2 text-sm text-slate-700">
                  <span className="font-medium">Period:</span> {ctx.link.period_label}
                </div>
              )}
              {ctx.link.instructions && (
                <div className="mt-3 rounded bg-slate-50 p-3 text-sm text-slate-700 whitespace-pre-line">
                  {ctx.link.instructions}
                </div>
              )}
              {ctx.link.expires_at && (
                <div className="mt-2 text-xs text-slate-500">
                  This link expires on {new Date(ctx.link.expires_at).toLocaleString()}.
                </div>
              )}
            </section>

            <section className="rounded-lg border bg-white p-5 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field label="Your name">
                  <input
                    type="text"
                    value={submitterName}
                    onChange={e => setSubmitterName(e.target.value)}
                    className="input"
                    placeholder="Jane Smith"
                  />
                </Field>
                <Field label="Your email">
                  <input
                    type="email"
                    value={submitterEmail}
                    onChange={e => setSubmitterEmail(e.target.value)}
                    className="input"
                    placeholder="jane@company.com"
                  />
                </Field>
              </div>

              <Field label="Controls in place" required>
                <textarea
                  value={controlDescription}
                  onChange={e => setControlDescription(e.target.value)}
                  rows={4}
                  className="input"
                  placeholder="Describe the key controls you operate over this entity / process…"
                />
              </Field>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field label="Design effectiveness">
                  <select
                    value={designEffectiveness}
                    onChange={e => setDesignEffectiveness(e.target.value)}
                    className="input"
                  >
                    {EFFECTIVENESS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </Field>
                <Field label="Operating effectiveness">
                  <select
                    value={operatingEffectiveness}
                    onChange={e => setOperatingEffectiveness(e.target.value)}
                    className="input"
                  >
                    {EFFECTIVENESS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </Field>
              </div>

              <Field label="Evidence link (optional)">
                <input
                  type="url"
                  value={evidenceLink}
                  onChange={e => setEvidenceLink(e.target.value)}
                  className="input"
                  placeholder="https://…"
                />
              </Field>

              <Field label="Additional notes (optional)">
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={3}
                  className="input"
                  placeholder="Anything Internal Audit should know…"
                />
              </Field>

              {submitError && (
                <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {submitError}
                </div>
              )}

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Submit self-assessment
                </button>
              </div>
            </section>

            <p className="text-xs text-slate-500 text-center">
              This is a scoped intake form — you do not have access to other audit data.
            </p>
          </form>
        )}
      </div>

      <style jsx>{`
        .input {
          width: 100%;
          border: 1px solid rgb(203 213 225);
          border-radius: 0.375rem;
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
          background: white;
        }
        .input:focus {
          outline: none;
          border-color: rgb(99 102 241);
          box-shadow: 0 0 0 1px rgb(99 102 241);
        }
      `}</style>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-700">
        {label}{required && <span className="text-red-500"> *</span>}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
