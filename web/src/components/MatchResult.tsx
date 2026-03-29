/**
 * MatchResult.tsx
 * Drop into your application detail modal.
 *
 * Usage:
 *   <MatchResult
 *     applicationId={app.id}
 *     existingJD={app.job_description}
 *     session={session}
 *   />
 */

import { useState, useEffect } from 'react';

const API_URL = import.meta.env.VITE_API_URL as string;

interface MatchResultProps {
  applicationId: string;
  existingJD?: string;
  session: any;
}

export default function MatchResult({ applicationId, existingJD = '', session }: MatchResultProps) {
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [jdText, setJdText] = useState(existingJD);
  const [error, setError] = useState('');
  const [fromCache, setFromCache] = useState(false);
  const [resumes, setResumes] = useState<any[]>([]);
  const [selectedResumeId, setSelectedResumeId] = useState<string>('');
  const token = session?.access_token;

  useEffect(() => { loadExisting(); loadResumes(); }, [applicationId]);

  async function loadExisting() {
    try {
      const res = await fetch(`${API_URL}/match/${applicationId}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) { const d = await res.json(); if (d.success) { setResult(d.data); setFromCache(true); } }
    } catch {}
  }

  async function loadResumes() {
    try {
      const res = await fetch(`${API_URL}/resumes`, { headers: { Authorization: `Bearer ${token}` } });
      const d = await res.json();
      if (d.success) {
        setResumes(d.data || []);
        const active = d.data?.find((r: any) => r.is_active);
        if (active) setSelectedResumeId(active.id);
        else if (d.data?.length > 0) setSelectedResumeId(d.data[0].id);
      }
    } catch {}
  }

  async function runMatch() {
    if (jdText.trim().length < 50) { setError('Paste the full job description (min 50 chars).'); return; }
    setLoading(true); setError('');
    try {
      const body: any = { applicationId, jdText };
      if (selectedResumeId) body.resumeId = selectedResumeId;
      const res = await fetch(`${API_URL}/match`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!d.success) throw new Error(d.error || 'Match failed');
      setResult(d.data); setFromCache(d.fromCache);
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  }

  const scoreColor = (s: number) => s >= 75 ? '#34d399' : s >= 50 ? '#f59e0b' : '#f87171';
  const scoreLabel = (s: number) => s >= 75 ? 'Strong Match' : s >= 50 ? 'Partial Match' : 'Weak Match';
  const parsedResumes = resumes.filter((r: any) => r.resume_hash);

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <style>{`@keyframes jt-spin { to { transform: rotate(360deg); } }`}</style>

      {!result && (
        <div style={{ display: 'grid', gap: 12 }}>
          {parsedResumes.length > 0 ? (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--jt-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>Resume</div>
              <select value={selectedResumeId} onChange={e => setSelectedResumeId(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', background: 'var(--jt-panel)', border: '1px solid var(--jt-border)', borderRadius: 'var(--jt-radius)', color: 'var(--jt-text)', fontSize: 14, outline: 'none' }}>
                {parsedResumes.map((r: any) => (
                  <option key={r.id} value={r.id}>{r.file_name}{r.is_active ? ' (active)' : ''}</option>
                ))}
              </select>
            </div>
          ) : (
            <div style={{ padding: '12px 16px', borderRadius: 'var(--jt-radius)', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', color: '#f59e0b', fontSize: 13 }}>
              {resumes.length === 0 ? 'No resumes uploaded. Go to the Files tab first.' : 'Resume not parsed yet. Try re-uploading your resume in the Files tab.'}
            </div>
          )}

          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--jt-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>Job Description</div>
            <textarea value={jdText} onChange={e => setJdText(e.target.value)}
              placeholder="Paste the full job description here..." rows={7}
              style={{ width: '100%', background: 'var(--jt-panel)', border: '1px solid var(--jt-border)', borderRadius: 'var(--jt-radius)', color: 'var(--jt-text)', padding: '12px 14px', fontSize: 14, resize: 'vertical', outline: 'none', boxSizing: 'border-box' }} />
          </div>

          {error && <div style={{ color: '#f87171', fontSize: 13 }}>{error}</div>}

          <button onClick={runMatch} disabled={loading || parsedResumes.length === 0}
            style={{ padding: '11px 24px', background: (loading || parsedResumes.length === 0) ? 'var(--jt-panel)' : 'var(--jt-accent)', border: 'none', borderRadius: 'var(--jt-radius)', color: '#fff', fontWeight: 700, fontSize: 14, cursor: (loading || parsedResumes.length === 0) ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 8, width: 'fit-content' }}>
            {loading
              ? <><span style={{ width: 14, height: 14, border: '2px solid #ffffff40', borderTop: '2px solid #fff', borderRadius: '50%', display: 'inline-block', animation: 'jt-spin 0.8s linear infinite' }} /> Analyzing...</>
              : 'Run Match'}
          </button>
        </div>
      )}

      {result && (
        <div style={{ display: 'grid', gap: 14 }}>
          {/* Score */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, padding: '18px 20px', background: 'var(--jt-panel)', borderRadius: 'var(--jt-radius)', border: `1px solid ${scoreColor(result.score)}40` }}>
            <div>
              <div style={{ fontSize: 12, color: 'var(--jt-muted)', marginBottom: 4 }}>Match Score{fromCache ? ' (cached)' : ''}</div>
              <div style={{ fontSize: 42, fontWeight: 800, color: scoreColor(result.score), lineHeight: 1 }}>{result.score}<span style={{ fontSize: 20, opacity: 0.5 }}>/100</span></div>
              <div style={{ marginTop: 6, fontSize: 12, fontWeight: 700, color: scoreColor(result.score) }}>{scoreLabel(result.score)}</div>
            </div>
            {result.score_breakdown && (
              <div style={{ display: 'grid', gap: 7, minWidth: 210 }}>
                {([['Required', result.score_breakdown.requiredScore, 45], ['Depth', result.score_breakdown.depthScore, 20], ['Preferred', result.score_breakdown.preferredScore, 15], ['Experience', result.score_breakdown.experienceScore, 12], ['Education', result.score_breakdown.educationScore, 8]] as [string,number,number][]).map(([label, val, max]) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ fontSize: 11, color: 'var(--jt-muted)', width: 84, flexShrink: 0 }}>{label}</div>
                    <div style={{ flex: 1, height: 5, background: 'var(--jt-bg)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ width: `${Math.max(0, (val / max) * 100)}%`, height: '100%', background: scoreColor(result.score), borderRadius: 3, transition: 'width 0.5s ease' }} />
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--jt-muted)', width: 32, textAlign: 'right' }}>{val}/{max}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Summary */}
          {result.explanation?.summary && (
            <div style={{ padding: '12px 16px', background: 'var(--jt-panel)', borderRadius: 'var(--jt-radius)', fontSize: 14, lineHeight: 1.7, borderLeft: `3px solid ${scoreColor(result.score)}` }}>
              {result.explanation.summary}
            </div>
          )}

          {/* Skills grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ padding: '12px 14px', background: 'var(--jt-panel)', borderRadius: 'var(--jt-radius)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#34d399', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: '#34d399', display: 'inline-block', flexShrink: 0 }} />Matched ({result.matched_skills?.length || 0})</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {(result.matched_skills || []).slice(0, 12).map((s: string) => (
                  <span key={s} style={{ padding: '3px 8px', borderRadius: 999, fontSize: 11, background: 'rgba(52,211,153,0.1)', color: '#34d399', border: '1px solid rgba(52,211,153,0.25)' }}>{s}</span>
                ))}
                {!result.matched_skills?.length && <span style={{ color: 'var(--jt-muted)', fontSize: 12 }}>None detected</span>}
              </div>
            </div>
            <div style={{ padding: '12px 14px', background: 'var(--jt-panel)', borderRadius: 'var(--jt-radius)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#f87171', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: '#f87171', display: 'inline-block', flexShrink: 0 }} />Missing ({result.missing_skills?.length || 0})</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {(result.missing_skills || []).slice(0, 12).map((s: string) => (
                  <span key={s} style={{ padding: '3px 8px', borderRadius: 999, fontSize: 11, background: 'rgba(248,113,113,0.1)', color: '#f87171', border: '1px solid rgba(248,113,113,0.25)' }}>{s}</span>
                ))}
                {!result.missing_skills?.length && <span style={{ color: 'var(--jt-muted)', fontSize: 12 }}>None</span>}
              </div>
            </div>
          </div>

          {/* Observations */}
          {result.explanation?.bulletPoints?.length > 0 && (
            <div style={{ padding: '12px 16px', background: 'var(--jt-panel)', borderRadius: 'var(--jt-radius)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--jt-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>Observations</div>
              {result.explanation.bulletPoints.map((b: string, i: number) => (
                <div key={i} style={{ fontSize: 13, lineHeight: 1.6, marginBottom: 5, paddingLeft: 14, position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 0, color: 'var(--jt-accent)' }}>•</span>{b}
                </div>
              ))}
            </div>
          )}

          {/* Rewrites */}
          {result.explanation?.resumeRewrites?.length > 0 && (
            <div style={{ padding: '12px 16px', background: 'var(--jt-panel)', borderRadius: 'var(--jt-radius)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--jt-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12 }}>Suggested Rewrites</div>
              {result.explanation.resumeRewrites.map((rw: any, i: number) => (
                <div key={i} style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, color: '#f87171', textDecoration: 'line-through', marginBottom: 4, opacity: 0.8 }}>{rw.original}</div>
                  <div style={{ fontSize: 13, color: '#34d399', paddingLeft: 10, borderLeft: '2px solid #34d39940' }}>{rw.rewritten}</div>
                </div>
              ))}
            </div>
          )}

          {/* Action steps */}
          {result.explanation?.actionSteps?.length > 0 && (
            <div style={{ padding: '12px 16px', background: 'var(--jt-panel)', borderRadius: 'var(--jt-radius)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--jt-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>Action Steps</div>
              {result.explanation.actionSteps.map((step: string, i: number) => (
                <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 8, fontSize: 13, lineHeight: 1.5 }}>
                  <span style={{ flexShrink: 0, width: 20, height: 20, borderRadius: '50%', background: 'var(--jt-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff' }}>{i + 1}</span>
                  {step}
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button onClick={() => { setResult(null); setFromCache(false); }}
              style={{ padding: '8px 16px', background: 'transparent', border: '1px solid var(--jt-border)', borderRadius: 'var(--jt-radius)', color: 'var(--jt-muted)', fontSize: 13, cursor: 'pointer' }}>
              ← Update JD & Re-run
            </button>
            {fromCache && <span style={{ fontSize: 12, color: 'var(--jt-muted)' }}>Cached — update JD to recompute</span>}
          </div>
        </div>
      )}
    </div>
  );
}