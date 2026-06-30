/**
 * llmLog.ts
 *
 * Request tracker for every REAL outbound LLM call (Claude + OpenAI). Logging is
 * fire-and-forget: it never awaits in the request path and never throws, so a
 * logging failure can't slow or break a user/pipeline request. Cache hits make no
 * call and are not logged here — the log reflects actual API spend only.
 *
 * Writes use the SERVICE-ROLE client (bypasses RLS) so the Railway job pipeline
 * (/internal/*, /jobs/scrape — no user JWT) can log too, attributed to its owner id.
 */
import type OpenAI from 'openai';
import { supabase } from './supabase';

// Per-model USD price per 1,000,000 tokens. Single source of truth — update here
// when prices change. Claude rates per the Anthropic pricing reference
// (claude-sonnet-4-6: $3 in / $15 out); OpenAI rates per OpenAI's pricing page.
const PRICES: Record<string, { inPerMTok: number; outPerMTok: number }> = {
  'claude-sonnet-4-6': { inPerMTok: 3.0, outPerMTok: 15.0 },
  'claude-opus-4-8': { inPerMTok: 5.0, outPerMTok: 25.0 },
  'gpt-4o-mini': { inPerMTok: 0.15, outPerMTok: 0.6 },
  'gpt-4.1-mini': { inPerMTok: 0.4, outPerMTok: 1.6 },
};

/** Estimated USD cost for a call, or null if the model isn't in the price table. */
export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number | null {
  const p = PRICES[model];
  if (!p) return null;
  const cost = (inputTokens / 1e6) * p.inPerMTok + (outputTokens / 1e6) * p.outPerMTok;
  return Math.round(cost * 1e6) / 1e6; // round to 6 decimals (matches numeric(10,6))
}

export interface LlmLogEntry {
  provider: 'anthropic' | 'openai';
  model: string;
  purpose: string;                 // 'tailor' | 'rerank' | 'score-job' | 'autofill' | ...
  userId?: string | null;
  source?: string | null;          // 'user' | 'internal' | 'job-pipeline'
  route?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  latencyMs?: number | null;
  status: 'success' | 'error';
  errorMessage?: string | null;
}

/**
 * Record one LLM call. Fire-and-forget: returns immediately, swallows all errors
 * (mirrors the existing cache-write error handling), and never blocks the caller.
 */
export function logLlmCall(entry: LlmLogEntry): void {
  void (async () => {
    try {
      const input = entry.inputTokens ?? null;
      const output = entry.outputTokens ?? null;
      const hasTokens = input != null || output != null;
      const total = hasTokens ? (input ?? 0) + (output ?? 0) : null;
      const cost = hasTokens ? estimateCostUsd(entry.model, input ?? 0, output ?? 0) : null;

      await supabase.from('llm_api_logs').insert({
        user_id: entry.userId ?? null,
        provider: entry.provider,
        model: entry.model,
        purpose: entry.purpose,
        route: entry.route ?? null,
        source: entry.source ?? null,
        input_tokens: input,
        output_tokens: output,
        total_tokens: total,
        cost_usd: cost,
        latency_ms: entry.latencyMs ?? null,
        status: entry.status,
        error_message: entry.errorMessage ? String(entry.errorMessage).slice(0, 500) : null,
      });
    } catch (err: any) {
      console.warn('[llmLog] failed to record call (continuing):', err?.message ?? err);
    }
  })();
}

export interface LlmCallMeta {
  purpose: string;
  userId?: string | null;
  source?: string | null;
  route?: string | null;
}

/**
 * Wrap an OpenAI chat completion so every call is timed and logged. Returns the
 * SDK response unchanged. The 3 OpenAI routes (/autofill, /summary,
 * /seed-from-text) call this instead of getOpenAI().chat.completions.create.
 */
export async function callOpenAIChat(
  client: OpenAI,
  params: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
  meta: LlmCallMeta,
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  const startedAt = Date.now();
  try {
    const completion = await client.chat.completions.create(params);
    logLlmCall({
      provider: 'openai',
      model: completion.model || String(params.model),
      purpose: meta.purpose,
      userId: meta.userId,
      source: meta.source,
      route: meta.route,
      inputTokens: completion.usage?.prompt_tokens ?? null,
      outputTokens: completion.usage?.completion_tokens ?? null,
      latencyMs: Date.now() - startedAt,
      status: 'success',
    });
    return completion;
  } catch (err: any) {
    logLlmCall({
      provider: 'openai',
      model: String(params.model),
      purpose: meta.purpose,
      userId: meta.userId,
      source: meta.source,
      route: meta.route,
      latencyMs: Date.now() - startedAt,
      status: 'error',
      errorMessage: err?.message ?? String(err),
    });
    throw err;
  }
}
