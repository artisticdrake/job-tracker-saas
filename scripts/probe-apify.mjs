/**
 * probe-apify.mjs — THROWAWAY actor-shape probe (not part of the app).
 *
 * Captures the real input schema and output shape of candidate Apify job
 * scrapers so we can map their fields onto Zenith's scraped_jobs columns
 * (jd_text/title/company/url/posted_at) before building any integration.
 *
 * Token: read from api/.env as APIFY_API_KEY and sent as an Authorization
 * Bearer header — never placed in a URL/query string, never printed.
 *
 * Usage:
 *   node scripts/probe-apify.mjs schema            # fetch input schema for all actors (free)
 *   node scripts/probe-apify.mjs run <actorKey>    # run ONE actor, max 5 results (cheap)
 *     e.g. node scripts/probe-apify.mjs run wellfound
 */
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
dotenv.config({ path: path.resolve(root, 'api/.env') });

const TOKEN = process.env.APIFY_API_KEY;
if (!TOKEN) {
  console.error('APIFY_API_KEY not found in api/.env — aborting.');
  process.exit(1);
}
const authHeaders = { Authorization: `Bearer ${TOKEN}` };

// actorKey -> "owner/name" (the "/" is encoded to "~" for the API path)
const ACTORS = {
  linkedin: 'curious_coder/linkedin-jobs-scraper',
  wellfound: 'crawlerbros/wellfound-scraper',
  builtin: 'solidcode/builtin-scraper',
  indeed: 'cheap_scraper/indeed-job-scraper',
};
const enc = (id) => id.replace('/', '~');

// Small, capped test inputs. Field names are GUESSES until step 1 shows the real
// schema — we fix these per actor after seeing each schema. All keep results tiny.
const TEST_INPUTS = {
  wellfound: { sort: 'newest', maxItems: 5 }, // filters relaxed — capturing output shape, not matching a role
  linkedin: {},
  builtin: { searchQueries: ['software engineer'], fetchDescription: true, maxResultsPerQuery: 5 },
  indeed: {},
};

function printSchema(schema) {
  const props = schema.properties || {};
  console.log(`schemaTitle: ${schema.title || '(none)'}`);
  console.log(`required: ${JSON.stringify(schema.required || [])}`);
  console.log('fields:');
  for (const [field, spec] of Object.entries(props)) {
    const bits = [spec.type, spec.editor && `editor=${spec.editor}`, spec.default !== undefined && `default=${JSON.stringify(spec.default)}`]
      .filter(Boolean).join(' ');
    console.log(`  - ${field}: ${bits}  — ${spec.title || ''}`);
    if (spec.enum) console.log(`      enum: ${JSON.stringify(spec.enum).slice(0, 240)}`);
  }
}

async function fetchSchema(key) {
  const id = ACTORS[key];
  console.log(`\n========== ${key}  (${id}) ==========`);
  try {
    // 1) Actor object — confirms it exists and points at the default/latest build.
    const ar = await fetch(`https://api.apify.com/v2/acts/${enc(id)}`, { headers: authHeaders });
    const atext = await ar.text();
    if (!ar.ok) {
      console.log(`ACTOR LOOKUP HTTP ${ar.status} ${ar.statusText}`);
      console.log(atext.slice(0, 400));
      return;
    }
    const actor = JSON.parse(atext).data ?? {};
    console.log(`actor: ${actor.username}/${actor.name}  | title: ${actor.title || '(none)'}`);
    console.log(`runs(stats): ${actor.stats?.totalRuns ?? '?'}  | public: ${actor.isPublic}`);
    const buildId = actor.taggedBuilds?.latest?.buildId || actor.defaultRunOptions?.build;
    if (!buildId) {
      console.log('No default/latest buildId on the actor — cannot locate input schema.');
      return;
    }
    // 2) Build object — its inputSchema field holds the JSON schema (as a string).
    const br = await fetch(`https://api.apify.com/v2/acts/${enc(id)}/builds/${buildId}`, { headers: authHeaders });
    const btext = await br.text();
    if (!br.ok) {
      console.log(`BUILD LOOKUP HTTP ${br.status} ${br.statusText}`);
      console.log(btext.slice(0, 400));
      return;
    }
    const build = JSON.parse(btext).data ?? {};
    const raw = build.inputSchema;
    if (!raw) {
      console.log('Build has no inputSchema field.');
      return;
    }
    printSchema(typeof raw === 'string' ? JSON.parse(raw) : raw);
  } catch (e) {
    console.log(`ERROR: ${e.message}`);
  }
}

async function diagnoseLastRun(id) {
  try {
    const r = await fetch(`https://api.apify.com/v2/acts/${enc(id)}/runs/last`, { headers: authHeaders });
    if (!r.ok) { console.log(`  (last-run lookup HTTP ${r.status})`); return; }
    const run = JSON.parse(await r.text()).data ?? {};
    console.log(`  status: ${run.status}  | exitCode: ${run.exitCode}  | statusMessage: ${run.statusMessage || '(none)'}`);
    console.log(`  datasetItems: ${run.stats?.datasetItemCount ?? '?'}  | computeUnits: ${run.stats?.computeUnits ?? '?'}  | runtime: ${run.stats?.runTimeSecs ?? '?'}s`);
    const logUrl = `https://api.apify.com/v2/logs/${run.id}`;
    const lr = await fetch(logUrl, { headers: authHeaders });
    if (lr.ok) {
      const log = await lr.text();
      const tail = log.split('\n').filter(Boolean).slice(-15).join('\n');
      console.log('  --- last 15 log lines ---');
      console.log(tail.replace(/^/gm, '  '));
    }
  } catch (e) {
    console.log(`  diagnosis ERROR: ${e.message}`);
  }
}

async function runActor(key) {
  const id = ACTORS[key];
  const input = TEST_INPUTS[key];
  if (!input || Object.keys(input).length === 0) {
    console.log(`No test input defined yet for "${key}" — read its schema first.`);
    return;
  }
  console.log(`\n========== RUN ${key}  (${id}) ==========`);
  try {
    const r = await fetch(
      `https://api.apify.com/v2/acts/${enc(id)}/run-sync-get-dataset-items?limit=5`,
      { method: 'POST', headers: { ...authHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify(input) },
    );
    const text = await r.text();
    if (!r.ok) {
      console.log(`HTTP ${r.status} ${r.statusText}`);
      console.log(text.slice(0, 800));
      return;
    }
    const items = JSON.parse(text);
    if (!Array.isArray(items) || items.length === 0) {
      console.log('Run returned 0 items — fetching last run for diagnosis...');
      await diagnoseLastRun(id);
      return;
    }
    console.log(`Returned ${items.length} item(s). First object:\n`);
    console.log(JSON.stringify(items[0], null, 2));
    console.log(`\nTop-level field names (${Object.keys(items[0]).length}):`);
    console.log(Object.keys(items[0]).join(', '));
  } catch (e) {
    console.log(`ERROR: ${e.message}`);
  }
}

const [mode, actorKey] = process.argv.slice(2);
if (mode === 'schema') {
  for (const key of Object.keys(ACTORS)) await fetchSchema(key);
} else if (mode === 'run' && actorKey) {
  await runActor(actorKey);
} else {
  console.error('Usage: node scripts/probe-apify.mjs schema | run <actorKey>');
  process.exit(1);
}
