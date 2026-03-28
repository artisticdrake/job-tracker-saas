/**
 * trace-pipeline-v3.ts  (v3.6)
 *
 * Self-contained resume ↔ JD matching pipeline.
 * Zero LLM calls for parsing or scoring.
 * GPT-4o-mini used ONLY for narrative explanation (optional, after score is locked).
 *
 * Everything is inline — no imports from custom files.
 *
 * Fixes vs v3.0:
 *   1. REQUIRED_HEADINGS expanded — catches "Knowledge And Experience" and similar
 *   2. extractYearsExperience now runs on experience section only (not full resume)
 *      → prevents education date ranges from inflating work years
 *   3. extractJobTitle skips known structural headings like "Principal Accountabilities"
 *
 * Run from api/ folder:
 *   npx tsx src/trace-pipeline-v3.ts
 *
 * Output: api/src/pipeline-trace-v3.txt
 */

import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const USER_ID = '78ce5c4d-82ec-4d5e-9f72-27b2b3673ac1';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const openai = new OpenAI({
  apiKey: (process.env.OPENAI_API_KEY2 || process.env.OPENAI_API_KEY || '').trim(),
});

// ═══════════════════════════════════════════════════════════════════════════════
// SKILL DICTIONARY
// Each entry: canonical name, aliases (word-boundary matched), implied-by rules,
// domains, and weight (core=3, standard=2, niche=1)
// ═══════════════════════════════════════════════════════════════════════════════

interface SkillEntry {
  canonical: string;
  aliases: string[];
  impliedBy?: string[][];   // OR of ANDs — any one full group being present credits this skill
  weight: 1 | 2 | 3;       // 3=core, 2=standard, 1=niche
}

const SKILL_DICTIONARY: SkillEntry[] = [
  // ── Languages ──────────────────────────────────────────────────────────────
  { canonical: 'python',      aliases: ['python', 'python3'],                                                       weight: 3 },
  { canonical: 'r',           aliases: ['r language', 'r programming', 'rstudio', 'r studio'],                      weight: 3 },
  { canonical: 'sql',         aliases: ['sql', 'structured query language'],                                        weight: 3 },
  { canonical: 'java',        aliases: ['java'],                                                                     weight: 2 },
  { canonical: 'javascript',  aliases: ['javascript', 'js', 'node.js', 'nodejs', 'es6'],                           weight: 2 },
  { canonical: 'typescript',  aliases: ['typescript'],                                                              weight: 2 },
  { canonical: 'c++',         aliases: ['c\\+\\+', 'cpp'],                                                         weight: 2 },
  { canonical: 'scala',       aliases: ['scala'],                                                                   weight: 1 },
  { canonical: 'go',          aliases: ['golang'],                                                                  weight: 2 },
  { canonical: 'matlab',      aliases: ['matlab'],                                                                  weight: 1 },
  { canonical: 'stata',       aliases: ['stata'],                                                                   weight: 1 },
  { canonical: 'sas',         aliases: ['\\bsas\\b'],                                                              weight: 1 },
  { canonical: 'julia',       aliases: ['julia'],                                                                   weight: 1 },

  // ── ML / AI Frameworks ─────────────────────────────────────────────────────
  { canonical: 'pytorch',      aliases: ['pytorch', 'torch'],                                                       weight: 3 },
  { canonical: 'tensorflow',   aliases: ['tensorflow', 'tf2'],                                                      weight: 3 },
  { canonical: 'keras',        aliases: ['keras'],                                                                  weight: 2 },
  { canonical: 'scikit-learn', aliases: ['scikit-learn', 'sklearn', 'scikit learn'],                                weight: 3 },
  { canonical: 'xgboost',      aliases: ['xgboost', 'xgb'],                                                        weight: 2 },
  { canonical: 'lightgbm',     aliases: ['lightgbm', 'lgbm'],                                                      weight: 2 },
  { canonical: 'random forest',aliases: ['random forest', 'random forests'],                                        weight: 2 },
  { canonical: 'neural networks',aliases:['neural network', 'neural networks', 'ann'],                              weight: 2 },

  // ── ML Domains (implied by tools) ──────────────────────────────────────────
  {
    canonical: 'machine learning',
    aliases: ['machine learning', 'predictive modeling', 'predictive modelling', 'supervised learning', 'unsupervised learning'],
    impliedBy: [['pytorch'],['tensorflow'],['scikit-learn'],['xgboost'],['lightgbm'],['random forest'],['keras']],
    weight: 3,
  },
  {
    canonical: 'deep learning',
    aliases: ['deep learning'],
    impliedBy: [['pytorch'],['tensorflow'],['keras'],['neural networks']],
    weight: 3,
  },
  {
    canonical: 'data science',
    aliases: ['data science', 'data scientist'],
    impliedBy: [['machine learning','python'],['scikit-learn','pandas']],
    weight: 3,
  },
  {
    canonical: 'statistical modeling',
    aliases: ['statistical modeling', 'statistical modelling', 'statistical models', 'generalized linear models', 'glm', 'linear regression', 'logistic regression', 'regression modeling'],
    impliedBy: [['scikit-learn'],['statsmodels'],['r','python']],
    weight: 3,
  },
  {
    canonical: 'statistical analysis',
    aliases: ['statistical analysis', 'statistics', 'statistical methods', 'descriptive statistics', 'inferential statistics', 'hypothesis testing'],
    impliedBy: [['r'],['stata'],['scipy'],['statsmodels']],
    weight: 3,
  },
  {
    canonical: 'advanced analytics',
    aliases: ['advanced analytics', 'advanced analysis'],
    impliedBy: [['machine learning','data analysis'],['statistical modeling','python']],
    weight: 2,
  },
  { canonical: 'econometrics',        aliases: ['econometrics', 'econometric', 'basic econometrics', 'time series analysis', 'causal inference'], weight: 2 },
  { canonical: 'clustering',          aliases: ['clustering', 'k-means', 'kmeans', 'dbscan'],                       weight: 2 },
  { canonical: 'regression',          aliases: ['regression', 'ridge regression', 'lasso'],                         weight: 2 },
  { canonical: 'feature engineering', aliases: ['feature engineering', 'feature extraction', 'feature selection'],  weight: 2 },
  { canonical: 'reinforcement learning',aliases:['reinforcement learning', 'deep rl'],                              weight: 1 },

  // ── NLP ────────────────────────────────────────────────────────────────────
  {
    canonical: 'natural language processing',
    aliases: ['natural language processing', 'nlp', 'text processing', 'text analysis', 'text mining'],
    impliedBy: [['spacy'],['nltk'],['hugging face'],['langchain'],['transformers']],
    weight: 3,
  },
  {
    canonical: 'large language models',
    aliases: ['large language models', 'llms', 'llm', 'openai api', 'chatgpt'],
    impliedBy: [['langchain'],['hugging face','transformers']],
    weight: 3,
  },
  {
    canonical: 'transformers',
    aliases: ['transformers', 'transformer architecture', 'bert', 'roberta', 'gpt', 't5'],
    impliedBy: [['hugging face']],
    weight: 3,
  },
  { canonical: 'hugging face',  aliases: ['hugging face', 'huggingface', 'hf transformers'],                        weight: 2 },
  { canonical: 'rag',           aliases: ['rag', 'retrieval augmented generation', 'retrieval-augmented generation'],weight: 2 },
  { canonical: 'fine-tuning',   aliases: ['fine-tuning', 'fine tuning', 'finetuning', 'peft', 'lora', 'qlora', 'parameter efficient fine-tuning', 'instruction tuning'], weight: 2 },
  { canonical: 'spacy',         aliases: ['spacy'],                                                                 weight: 2 },
  { canonical: 'nltk',          aliases: ['nltk', 'natural language toolkit'],                                      weight: 2 },
  { canonical: 'langchain',     aliases: ['langchain', 'lang chain'],                                               weight: 2 },
  { canonical: 'vector databases',aliases:['faiss', 'pinecone', 'weaviate', 'chroma', 'qdrant', 'vector database', 'vector store'], weight: 2 },
  { canonical: 'named entity recognition',aliases:['named entity recognition', 'ner', 'entity extraction'],         weight: 1 },

  // ── Computer Vision ─────────────────────────────────────────────────────────
  {
    canonical: 'computer vision',
    aliases: ['computer vision', 'image recognition', 'object detection', 'image classification', 'image segmentation'],
    impliedBy: [['opencv'],['yolo']],
    weight: 3,
  },
  { canonical: 'opencv', aliases: ['opencv', 'open cv', 'cv2'],                                                     weight: 2 },
  { canonical: 'yolo',   aliases: ['yolo', 'yolov5', 'yolov8'],                                                     weight: 2 },
  { canonical: 'ocr',    aliases: ['ocr', 'optical character recognition', 'tesseract', 'pytesseract'],              weight: 2 },

  // ── Data Tools ──────────────────────────────────────────────────────────────
  { canonical: 'pandas',     aliases: ['pandas'],                                                                    weight: 3 },
  { canonical: 'numpy',      aliases: ['numpy'],                                                                     weight: 2 },
  { canonical: 'matplotlib', aliases: ['matplotlib'],                                                               weight: 2 },
  {
    canonical: 'data visualization',
    aliases: ['data visualization', 'data visualisation', 'dashboards', 'data reporting'],
    impliedBy: [['matplotlib'],['tableau'],['power bi'],['plotly'],['seaborn']],
    weight: 3,
  },
  {
    canonical: 'data analysis',
    aliases: ['data analysis', 'data analytics', 'exploratory data analysis', 'eda'],
    impliedBy: [['pandas','python'],['r','python'],['sql','python']],
    weight: 3,
  },
  {
    canonical: 'data engineering',
    aliases: ['data engineering', 'data pipelines', 'etl', 'elt', 'data pipeline'],
    impliedBy: [['apache airflow'],['apache spark','python']],
    weight: 3,
  },
  { canonical: 'tableau',        aliases: ['tableau'],                                                              weight: 2 },
  { canonical: 'power bi',       aliases: ['power bi', 'powerbi'],                                                  weight: 2 },
  { canonical: 'plotly',         aliases: ['plotly', 'dash'],                                                       weight: 2 },
  { canonical: 'seaborn',        aliases: ['seaborn'],                                                              weight: 2 },
  { canonical: 'scipy',          aliases: ['scipy'],                                                                weight: 2 },
  { canonical: 'statsmodels',    aliases: ['statsmodels'],                                                          weight: 2 },
  { canonical: 'apache spark',   aliases: ['apache spark', 'pyspark', 'spark sql'],                                 weight: 2 },
  { canonical: 'apache airflow', aliases: ['apache airflow', 'airflow'],                                            weight: 2 },
  { canonical: 'dbt',            aliases: ['dbt', 'data build tool'],                                              weight: 2 },
  { canonical: 'kafka',          aliases: ['kafka', 'apache kafka'],                                                weight: 2 },
  { canonical: 'snowflake',      aliases: ['snowflake'],                                                            weight: 2 },
  { canonical: 'bigquery',       aliases: ['bigquery', 'big query'],                                                weight: 2 },

  // ── Databases ───────────────────────────────────────────────────────────────
  { canonical: 'postgresql',    aliases: ['postgresql', 'postgres'],                                                weight: 2 },
  { canonical: 'mysql',         aliases: ['mysql'],                                                                 weight: 2 },
  { canonical: 'mongodb',       aliases: ['mongodb', 'mongo'],                                                      weight: 2 },
  { canonical: 'redis',         aliases: ['redis'],                                                                 weight: 2 },
  { canonical: 'elasticsearch', aliases: ['elasticsearch', 'opensearch'],                                           weight: 2 },

  // ── Cloud / DevOps ──────────────────────────────────────────────────────────
  { canonical: 'aws',        aliases: ['aws', 'amazon web services', 'ec2', 's3', 'sagemaker'],                     weight: 3 },
  { canonical: 'gcp',        aliases: ['gcp', 'google cloud', 'google cloud platform'],                             weight: 2 },
  { canonical: 'azure',      aliases: ['azure', 'microsoft azure'],                                                 weight: 2 },
  { canonical: 'docker',     aliases: ['docker', 'containerization'],                                               weight: 2 },
  { canonical: 'kubernetes', aliases: ['kubernetes', 'k8s'],                                                        weight: 2 },
  { canonical: 'git',        aliases: ['git', 'github', 'version control', 'source control'],                       weight: 3 },
  { canonical: 'gitlab',     aliases: ['gitlab'],                                                                   weight: 2 },
  { canonical: 'ci/cd',      aliases: ['ci/cd', 'cicd', 'continuous integration', 'continuous deployment', 'jenkins', 'github actions'], weight: 2 },
  { canonical: 'linux',      aliases: ['linux', 'unix', 'bash', 'shell scripting'],                                 weight: 2 },

  // ── Web / Backend ───────────────────────────────────────────────────────────
  { canonical: 'fastapi',  aliases: ['fastapi', 'fast api'],                                                        weight: 2 },
  { canonical: 'flask',    aliases: ['flask'],                                                                      weight: 2 },
  { canonical: 'django',   aliases: ['django'],                                                                     weight: 2 },
  { canonical: 'react',    aliases: ['react', 'reactjs', 'react.js'],                                               weight: 2 },
  { canonical: 'rest api', aliases: ['rest api', 'restful api', 'api development'],                                 weight: 2 },

  // ── Finance / Quant ─────────────────────────────────────────────────────────
  { canonical: 'financial modeling',    aliases: ['financial modeling', 'financial modelling', 'dcf', 'valuation'],  weight: 3 },
  { canonical: 'excel',                 aliases: ['excel', 'microsoft excel', 'vba', 'pivot tables'],               weight: 3 },
  { canonical: 'bloomberg',             aliases: ['bloomberg', 'bloomberg terminal'],                               weight: 2 },
  { canonical: 'quantitative analysis', aliases: ['quantitative analysis', 'quant', 'quantitative research'],       weight: 3 },
  { canonical: 'risk analysis',         aliases: ['risk analysis', 'risk management', 'credit risk', 'market risk'],weight: 2 },

  // ── Business ────────────────────────────────────────────────────────────────
  { canonical: 'project management', aliases: ['project management', 'agile', 'scrum', 'kanban'],                   weight: 2 },
  { canonical: 'product management', aliases: ['product management', 'product roadmap'],                            weight: 2 },
  { canonical: 'salesforce',         aliases: ['salesforce', 'crm'],                                               weight: 2 },

  // ── Design ──────────────────────────────────────────────────────────────────
  { canonical: 'figma',    aliases: ['figma'],                                                                      weight: 3 },
  { canonical: 'ux design',aliases: ['ux design', 'user experience', 'user research', 'wireframing', 'prototyping'],weight: 3 },

  // ── Writing / Comms ─────────────────────────────────────────────────────────
  { canonical: 'technical writing', aliases: ['technical writing', 'documentation', 'technical documentation'],     weight: 2 },
  { canonical: 'public relations',  aliases: ['public relations', 'media relations', 'press releases'],             weight: 3 },
  { canonical: 'content writing',   aliases: ['content writing', 'copywriting', 'content creation'],               weight: 2 },

  // ── Research ────────────────────────────────────────────────────────────────
  { canonical: 'research methodology', aliases: ['research methodology', 'research design', 'qualitative research', 'quantitative research'], weight: 3 },
  { canonical: 'spss',                 aliases: ['spss', 'ibm spss'],                                              weight: 2 },

  // ════════════════════════════════════════════════════════════════════════════
  // DOMAIN EXPANSION — Finance, Marketing, Product, Law, Medicine, Design, HW
  // ════════════════════════════════════════════════════════════════════════════

  // ── Finance / Quant ──────────────────────────────────────────────────────────
  { canonical: 'financial modeling',    aliases: ['financial modeling', 'financial modelling', 'financial models', 'dcf', 'discounted cash flow', 'lbo', 'leveraged buyout', 'merger model', 'accretion dilution'], weight: 3 },
  { canonical: 'excel',                 aliases: ['excel', 'microsoft excel', 'vba', 'pivot tables', 'vlookup', 'spreadsheet modeling'], weight: 3 },
  { canonical: 'bloomberg',             aliases: ['bloomberg', 'bloomberg terminal', 'bloomberg api'],             weight: 3 },
  { canonical: 'factset',              aliases: ['factset', 'fact set'],                                           weight: 2 },
  { canonical: 'morningstar',          aliases: ['morningstar'],                                                   weight: 2 },
  { canonical: 'capital iq',           aliases: ['capital iq', 'capitaliq', 's&p capital iq'],                    weight: 2 },
  { canonical: 'quantitative analysis', aliases: ['quantitative analysis', 'quant', 'quantitative research', 'quantitative modeling', 'quantitative finance'], weight: 3 },
  { canonical: 'risk management',      aliases: ['risk management', 'risk analysis', 'credit risk', 'market risk', 'operational risk', 'var', 'value at risk', 'stress testing'], weight: 3 },
  { canonical: 'derivatives',          aliases: ['derivatives', 'options', 'futures', 'swaps', 'fixed income', 'bonds', 'equities', 'securities'], weight: 2 },
  { canonical: 'portfolio management', aliases: ['portfolio management', 'asset management', 'portfolio optimization', 'asset allocation'], weight: 3 },
  { canonical: 'valuation',            aliases: ['valuation', 'business valuation', 'equity research', 'comparable company analysis', 'comps', 'precedent transactions'], weight: 3 },
  { canonical: 'accounting',           aliases: ['accounting', 'gaap', 'ifrs', 'financial accounting', 'financial statements', 'balance sheet', 'income statement', 'cash flow statement'], weight: 3 },
  { canonical: 'cfa',                  aliases: ['cfa', 'chartered financial analyst', 'cfa level'],              weight: 2 },
  { canonical: 'series 7',             aliases: ['series 7', 'series 63', 'series 65', 'finra', 'nasd'],          weight: 2 },
  { canonical: 'python for finance',   aliases: ['quantlib', 'pyfolio', 'zipline', 'backtrader'],                 weight: 2 },
  { canonical: 'black-scholes',        aliases: ['black-scholes', 'black scholes', 'options pricing', 'monte carlo simulation'], weight: 2 },
  { canonical: 'financial reporting',  aliases: ['financial reporting', 'sec filings', '10-k', '10-q', 'investor relations'], weight: 2 },
  { canonical: 'banking',              aliases: ['investment banking', 'commercial banking', 'retail banking', 'corporate finance', 'mergers and acquisitions', 'm&a'], weight: 2 },
  { canonical: 'hedge fund',           aliases: ['hedge fund', 'long short', 'algorithmic trading', 'systematic trading', 'high frequency trading', 'hft'], weight: 2 },
  { canonical: 'alteryx',              aliases: ['alteryx'],                                                       weight: 2 },

  // ── Marketing / Growth ───────────────────────────────────────────────────────
  { canonical: 'google analytics',     aliases: ['google analytics', 'ga4', 'universal analytics', 'adobe analytics'], weight: 3 },
  { canonical: 'seo',                  aliases: ['seo', 'search engine optimization', 'technical seo', 'on-page seo', 'keyword research', 'semrush', 'ahrefs', 'moz'], weight: 3 },
  { canonical: 'sem',                  aliases: ['sem', 'search engine marketing', 'google ads', 'google adwords', 'ppc', 'pay per click', 'paid search'], weight: 3 },
  { canonical: 'social media marketing',aliases: ['social media marketing', 'instagram', 'facebook ads', 'meta ads', 'tiktok ads', 'twitter ads', 'linkedin ads', 'paid social'], weight: 3 },
  { canonical: 'email marketing',      aliases: ['email marketing', 'mailchimp', 'klaviyo', 'hubspot email', 'drip', 'email automation', 'email campaigns'], weight: 3 },
  { canonical: 'hubspot',              aliases: ['hubspot', 'hub spot'],                                           weight: 3 },
  { canonical: 'marketo',              aliases: ['marketo', 'marketing automation', 'pardot', 'eloqua'],           weight: 2 },
  { canonical: 'content marketing',    aliases: ['content marketing', 'content strategy', 'blog writing', 'editorial calendar', 'thought leadership'], weight: 3 },
  { canonical: 'brand strategy',       aliases: ['brand strategy', 'brand management', 'brand identity', 'brand positioning', 'brand guidelines'], weight: 3 },
  { canonical: 'conversion rate optimization', aliases: ['cro', 'conversion rate optimization', 'landing page optimization', 'a/b testing'], weight: 2 },
  { canonical: 'growth hacking',       aliases: ['growth hacking', 'growth marketing', 'viral marketing', 'referral marketing', 'growth loops'], weight: 2 },
  { canonical: 'campaign management',  aliases: ['campaign management', 'marketing campaigns', 'integrated marketing', 'omnichannel marketing'], weight: 3 },
  { canonical: 'market research',      aliases: ['market research', 'consumer insights', 'competitive analysis', 'market analysis', 'focus groups', 'surveys'], weight: 3 },
  { canonical: 'google tag manager',   aliases: ['google tag manager', 'gtm', 'tag management'],                  weight: 2 },
  { canonical: 'crm marketing',        aliases: ['crm', 'customer relationship management', 'salesforce marketing cloud', 'customer segmentation', 'lifecycle marketing'], weight: 2 },
  { canonical: 'influencer marketing', aliases: ['influencer marketing', 'influencer partnerships', 'creator economy'], weight: 2 },
  { canonical: 'programmatic advertising', aliases: ['programmatic', 'dsp', 'demand side platform', 'dv360', 'trade desk'], weight: 2 },
  { canonical: 'marketing analytics',  aliases: ['marketing analytics', 'attribution modeling', 'marketing mix modeling', 'mmm', 'roi analysis', 'ltv', 'customer lifetime value'], weight: 3 },
  { canonical: 'adobe experience cloud', aliases: ['adobe experience cloud', 'adobe campaign', 'adobe target', 'adobe audience manager'], weight: 2 },

  // ── Product Management ───────────────────────────────────────────────────────
  { canonical: 'product strategy',     aliases: ['product strategy', 'product vision', 'product direction', 'go-to-market', 'gtm strategy'], weight: 3 },
  { canonical: 'product roadmap',      aliases: ['product roadmap', 'roadmapping', 'feature prioritization', 'product backlog'], weight: 3 },
  { canonical: 'user stories',         aliases: ['user stories', 'product requirements', 'prd', 'product requirements document', 'feature specs', 'functional requirements'], weight: 3 },
  { canonical: 'agile',                aliases: ['agile', 'scrum', 'kanban', 'sprint planning', 'retrospectives', 'daily standup'], weight: 3 },
  { canonical: 'jira',                 aliases: ['jira', 'confluence', 'atlassian', 'asana', 'trello', 'notion'], weight: 3 },
  { canonical: 'product analytics',    aliases: ['product analytics', 'amplitude', 'mixpanel', 'heap', 'pendo', 'fullstory', 'hotjar', 'user analytics'], weight: 3 },
  { canonical: 'okrs',                 aliases: ['okrs', 'objectives and key results', 'kpis', 'north star metric', 'product metrics'], weight: 2 },
  { canonical: 'stakeholder management',aliases: ['stakeholder management', 'cross-functional collaboration', 'executive communication', 'alignment'], weight: 3 },
  { canonical: 'user research',        aliases: ['user research', 'user interviews', 'usability studies', 'customer discovery', 'jobs to be done', 'jtbd'], weight: 3 },
  { canonical: 'a/b testing',          aliases: ['a/b testing', 'experimentation', 'feature flags', 'split testing', 'multivariate testing'], weight: 3 },
  { canonical: 'product launch',       aliases: ['product launch', 'go-to-market execution', 'release management', 'launch planning'], weight: 2 },
  { canonical: 'pricing strategy',     aliases: ['pricing strategy', 'monetization', 'subscription model', 'freemium', 'pricing models'], weight: 2 },
  { canonical: 'competitive intelligence', aliases: ['competitive intelligence', 'competitive research', 'market positioning', 'win-loss analysis'], weight: 2 },
  { canonical: 'sql for product',      aliases: ['mode analytics', 'looker', 'metabase', 'redash'],               weight: 2 },

  // ── Law ──────────────────────────────────────────────────────────────────────
  { canonical: 'legal research',       aliases: ['legal research', 'westlaw', 'lexisnexis', 'fastcase', 'case law', 'statutory research'], weight: 3 },
  { canonical: 'contract drafting',    aliases: ['contract drafting', 'contract review', 'contract negotiation', 'agreement drafting', 'nda', 'msa', 'sow drafting'], weight: 3 },
  { canonical: 'litigation',           aliases: ['litigation', 'trial preparation', 'discovery', 'depositions', 'motion practice', 'brief writing', 'legal brief'], weight: 3 },
  { canonical: 'corporate law',        aliases: ['corporate law', 'corporate governance', 'm&a law', 'mergers acquisitions', 'securities law', 'capital markets law'], weight: 3 },
  { canonical: 'intellectual property',aliases: ['intellectual property', 'ip law', 'patent law', 'trademark', 'copyright', 'trade secret', 'patent prosecution'], weight: 3 },
  { canonical: 'employment law',       aliases: ['employment law', 'labor law', 'hr compliance', 'erisa', 'title vii', 'ada compliance'], weight: 2 },
  { canonical: 'regulatory law',       aliases: ['regulatory law', 'regulatory compliance', 'administrative law', 'fda law', 'sec compliance', 'finra compliance'], weight: 3 },
  { canonical: 'real estate law',      aliases: ['real estate law', 'property law', 'title review', 'commercial real estate', 'zoning'], weight: 2 },
  { canonical: 'bar admission',        aliases: ['bar admission', 'bar exam', 'licensed attorney', 'admitted to practice', 'juris doctor', 'j.d.', 'jd degree'], weight: 3 },
  { canonical: 'e-discovery',          aliases: ['e-discovery', 'ediscovery', 'relativity', 'logikcull', 'ipro', 'document review', 'document production'], weight: 2 },
  { canonical: 'due diligence',        aliases: ['due diligence', 'legal due diligence', 'transactional due diligence', 'regulatory due diligence'], weight: 2 },
  { canonical: 'legal writing',        aliases: ['legal writing', 'legal drafting', 'memoranda', 'legal memorandum', 'opinion letters'], weight: 3 },
  { canonical: 'privacy law',          aliases: ['privacy law', 'data privacy', 'gdpr compliance', 'ccpa', 'privacy policy', 'data protection law'], weight: 2 },

  // ── Medicine / Clinical ──────────────────────────────────────────────────────
  { canonical: 'clinical trials',      aliases: ['clinical trials', 'clinical research', 'clinical study', 'phase i', 'phase ii', 'phase iii', 'randomized controlled trial', 'rct'], weight: 3 },
  { canonical: 'ehr systems',          aliases: ['ehr', 'emr', 'epic', 'cerner', 'allscripts', 'athenahealth', 'electronic health records', 'electronic medical records'], weight: 3 },
  { canonical: 'irb',                  aliases: ['irb', 'institutional review board', 'ethics review', 'research ethics', 'informed consent'], weight: 2 },
  { canonical: 'gcp',                  aliases: ['gcp clinical', 'good clinical practice', 'ich gcp', 'gcp certification'],               weight: 2 },
  { canonical: 'medical coding',       aliases: ['medical coding', 'icd-10', 'cpt codes', 'hcpcs', 'medical billing', 'revenue cycle'], weight: 2 },
  { canonical: 'pharmacovigilance',    aliases: ['pharmacovigilance', 'adverse event reporting', 'drug safety', 'medwatch', 'faers'],     weight: 2 },
  { canonical: 'fda regulations',      aliases: ['fda regulations', 'fda submission', '510k', 'pma', 'ind', 'nda', 'fda approval', 'regulatory affairs'], weight: 3 },
  { canonical: 'clinical data management', aliases: ['clinical data management', 'cdm', 'medidata', 'rave', 'oracle clinical', 'veeva vault', 'edc systems'], weight: 2 },
  { canonical: 'biostatistics',        aliases: ['biostatistics', 'survival analysis', 'kaplan meier', 'cox regression', 'clinical statistics'], weight: 3 },
  { canonical: 'patient care',         aliases: ['patient care', 'bedside manner', 'patient management', 'patient assessment', 'direct patient care'], weight: 3 },
  { canonical: 'medical writing',      aliases: ['medical writing', 'clinical writing', 'regulatory writing', 'protocol writing', 'csr', 'clinical study report'], weight: 3 },
  { canonical: 'hipaa',                aliases: ['hipaa', 'hipaa compliance', 'phi', 'protected health information', 'health information privacy'], weight: 2 },
  { canonical: 'nursing',              aliases: ['nursing', 'registered nurse', 'rn', 'bsn', 'msn', 'np', 'nurse practitioner', 'clinical nursing'], weight: 3 },
  { canonical: 'public health',        aliases: ['public health', 'epidemiology', 'health policy', 'population health', 'community health', 'mph'], weight: 3 },

  // ── Design / UX ──────────────────────────────────────────────────────────────
  { canonical: 'figma',                aliases: ['figma'],                                                         weight: 3 },
  { canonical: 'sketch',               aliases: ['sketch', 'sketch app'],                                         weight: 2 },
  { canonical: 'invision',             aliases: ['invision', 'invision studio', 'zeplin', 'abstract'],             weight: 2 },
  { canonical: 'ux design',            aliases: ['ux design', 'user experience design', 'interaction design', 'ixd', 'experience design'], weight: 3 },
  { canonical: 'ui design',            aliases: ['ui design', 'user interface design', 'visual design', 'interface design', 'gui design'], weight: 3 },
  { canonical: 'design systems',       aliases: ['design systems', 'component library', 'design tokens', 'storybook', 'atomic design'], weight: 3 },
  { canonical: 'wireframing',          aliases: ['wireframing', 'wireframes', 'low fidelity', 'lo-fi', 'mockups', 'prototyping', 'high fidelity prototype'], weight: 3 },
  { canonical: 'user research',        aliases: ['user research', 'usability testing', 'user interviews', 'contextual inquiry', 'card sorting', 'tree testing'], weight: 3 },
  { canonical: 'accessibility',        aliases: ['accessibility', 'wcag', 'ada compliance', 'aria', 'screen reader', 'inclusive design'], weight: 2 },
  { canonical: 'adobe creative suite', aliases: ['adobe', 'photoshop', 'illustrator', 'indesign', 'after effects', 'premiere', 'xd', 'adobe xd'], weight: 3 },
  { canonical: 'motion design',        aliases: ['motion design', 'motion graphics', 'animation', 'lottie', 'principle', 'protopie'],    weight: 2 },
  { canonical: 'brand identity',       aliases: ['brand identity', 'visual identity', 'logo design', 'typography', 'color theory', 'brand guidelines'], weight: 3 },
  { canonical: 'css',                  aliases: ['css', 'css3', 'sass', 'scss', 'tailwind', 'styled components', 'css modules'],        weight: 2 },
  { canonical: 'html',                 aliases: ['html', 'html5'],                                                 weight: 2 },
  { canonical: 'information architecture', aliases: ['information architecture', 'ia', 'navigation design', 'sitemap', 'content hierarchy'], weight: 2 },
  { canonical: 'user testing',         aliases: ['user testing', 'usertesting', 'maze', 'lookback', 'moderated testing', 'unmoderated testing'], weight: 2 },

  // ── Hardware / Embedded ──────────────────────────────────────────────────────
  { canonical: 'embedded c',           aliases: ['embedded c', 'embedded c++', 'bare metal', 'firmware development', 'embedded systems programming'], weight: 3 },
  { canonical: 'rtos',                 aliases: ['rtos', 'real-time operating system', 'freertos', 'vxworks', 'qnx', 'zephyr', 'real time os'], weight: 3 },
  { canonical: 'fpga',                 aliases: ['fpga', 'field programmable gate array', 'xilinx', 'altera', 'intel fpga'],             weight: 3 },
  { canonical: 'verilog',              aliases: ['verilog', 'systemverilog', 'hdl'],                               weight: 3 },
  { canonical: 'vhdl',                 aliases: ['vhdl', 'vhsic hardware description language'],                   weight: 2 },
  { canonical: 'pcb design',           aliases: ['pcb design', 'pcb layout', 'altium', 'kicad', 'eagle', 'pcb', 'printed circuit board'], weight: 3 },
  { canonical: 'microcontrollers',     aliases: ['microcontroller', 'microcontrollers', 'arduino', 'stm32', 'esp32', 'pic', 'avr', 'arm cortex'], weight: 3 },
  { canonical: 'raspberry pi',         aliases: ['raspberry pi', 'rpi'],                                           weight: 2 },
  { canonical: 'signal processing',    aliases: ['signal processing', 'dsp', 'digital signal processing', 'fft', 'filters', 'signal filtering'], weight: 3 },
  { canonical: 'communication protocols', aliases: ['i2c', 'spi', 'uart', 'can bus', 'modbus', 'rs-485', 'ethernet', 'usb protocol', 'ble', 'bluetooth low energy', 'lorawan', 'zigbee'], weight: 3 },
  { canonical: 'iot',                  aliases: ['iot', 'internet of things', 'edge computing', 'sensor integration', 'smart devices'],  weight: 3 },
  { canonical: 'circuit design',       aliases: ['circuit design', 'analog design', 'digital design', 'power electronics', 'schematic design', 'ltspice'], weight: 3 },
  { canonical: 'oscilloscope',         aliases: ['oscilloscope', 'logic analyzer', 'multimeter', 'jtag', 'hardware debugging', 'in circuit emulator'], weight: 2 },
  { canonical: 'linux kernel',         aliases: ['linux kernel', 'device drivers', 'kernel module', 'u-boot', 'buildroot', 'yocto'],     weight: 3 },
  { canonical: 'robotics',             aliases: ['robotics', 'ros', 'robot operating system', 'servo control', 'motor control', 'kinematics', 'path planning'], weight: 3 },
  { canonical: 'antenna design',       aliases: ['antenna design', 'rf design', 'rf engineering', 'wireless design', 'spectrum analysis'], weight: 2 },
  { canonical: 'functional safety',    aliases: ['functional safety', 'iso 26262', 'iec 61508', 'misra', 'autosar', 'safety critical systems'], weight: 2 },
];


// ═══════════════════════════════════════════════════════════════════════════════
// SKILL SCANNING
// ═══════════════════════════════════════════════════════════════════════════════

function scanText(text: string): Set<string> {
  const found = new Set<string>();
  // Normalize line breaks — PDF extraction sometimes splits multi-word skills
  // across lines (e.g. 'Random\nForest', 'Neural\nNetworks'). Collapse to space.
  const lower = text.replace(/\n/g, ' ').toLowerCase();

  for (const entry of SKILL_DICTIONARY) {
    if (found.has(entry.canonical)) continue;
    const allAliases = [entry.canonical, ...entry.aliases];
    for (const alias of allAliases) {
      try {
        const pattern = new RegExp(`(?<![a-z0-9\\-])${alias}(?![a-z0-9\\-])`, 'i');
        if (pattern.test(lower)) {
          found.add(entry.canonical);
          break;
        }
      } catch {
        if (lower.includes(alias.toLowerCase())) {
          found.add(entry.canonical);
          break;
        }
      }
    }
  }
  return found;
}

function applyImpliedSkills(found: Set<string>): Set<string> {
  const expanded = new Set(found);
  let changed = true;
  while (changed) {
    changed = false;
    for (const entry of SKILL_DICTIONARY) {
      if (expanded.has(entry.canonical)) continue;
      if (!entry.impliedBy?.length) continue;
      for (const group of entry.impliedBy) {
        if (group.every(s => expanded.has(s))) {
          expanded.add(entry.canonical);
          changed = true;
          break;
        }
      }
    }
  }
  return expanded;
}

// After implied expansion, remove generic skills that are implied by a specific
// skill already in the set — prevents double-counting in required lists.
// e.g. if 'pytorch' is required AND 'machine learning' is required (because pytorch implies it),
// drop 'machine learning' — it's redundant.
function deduplicateImplied(skills: Set<string>): Set<string> {
  const result = new Set(skills);
  for (const entry of SKILL_DICTIONARY) {
    if (!result.has(entry.canonical)) continue;
    if (!entry.impliedBy?.length) continue;
    // If any implication group is fully present in result, the generic is redundant
    for (const group of entry.impliedBy) {
      if (group.every(s => result.has(s))) {
        result.delete(entry.canonical);
        break;
      }
    }
  }
  return result;
}

function getWeight(canonical: string): number {
  return SKILL_DICTIONARY.find(e => e.canonical === canonical)?.weight ?? 1;
}

// ═══════════════════════════════════════════════════════════════════════════════
// JD PARSER
// ═══════════════════════════════════════════════════════════════════════════════

const REQUIRED_HEADINGS = [
  /\brequired\s*(qualifications?|skills?|experience|knowledge)?\s*[:\-]?\s*$/i,
  /\bmust[\s-]have\b/i,
  /\bminimum\s*(qualifications?|requirements?|experience)\b/i,
  /\bbasic\s*qualifications?\b/i,
  /\bwhat\s+you('ll)?\s+(need|bring|have)\b/i,
  /\byou\s+(must|will)\s+(have|need)\b/i,
  /\bqualifications?\s*[:\-]\s*$/i,
  /^knowledge\s+and\s+experience\s*[:\-]?\s*$/i,  // "Knowledge And Experience" — NOT "Additional Knowledge..."
  /\btechnical\s+skills?\s*[:\-]\s*$/i,
  /\bcore\s+requirements?\s*[:\-]?\s*$/i,
  /\bposition\s+requirements?\s*[:\-]?\s*$/i,
  /\byour\s+(background|qualifications?|skills?|experience)\s*[:\-]?\s*$/i,
  /\bwho\s+you\s+are\b/i,
  /\bwhat\s+we('re|\s+are)\s+looking\s+for\b/i,
  /\bjob\s+requirements?\s*[:\-]?\s*$/i,
];

const PREFERRED_HEADINGS = [
  /\bpreferred\b/i,
  /\bnice[\s-]to[\s-]have\b/i,
  /\bbonus\s*(points?)?\b/i,
  /\bdesired\b/i,
  /\bideal\s*(candidate|qualifications?)?\b/i,
  /\badditional\s*(knowledge|experience|qualifications?|skills?)\b/i,
  /\bwould\s+be\s+(a\s+)?(plus|great|nice|bonus)\b/i,
];

const GATEKEEPER_PATTERNS = [
  { pattern: /citizenship|authorized to work|work authorization|eligible to work|right to work/i, label: 'Work authorization / citizenship required' },
  { pattern: /security clearance|secret clearance|top secret|ts\/sci/i,                           label: 'Security clearance required' },
  { pattern: /must be.{0,30}(us|u\.s\.)\s*(citizen|national|resident)/i,                         label: 'US citizenship required' },
  { pattern: /drug (test|screen|screening)/i,                                                      label: 'Drug screening required' },
  { pattern: /background check|criminal (history|background)/i,                                   label: 'Background check required' },
  { pattern: /on[\s-]?site|in[\s-]?office|in[\s-]person/i,                                       label: 'On-site / location requirement' },
  { pattern: /years?\s+(of\s+)?(us|u\.s\.)\s+residen/i,                                          label: 'US residency requirement' },
];

interface ParsedJD {
  jobTitle: string;
  requiredSkills: string[];   // deduplicated, sorted by weight desc
  preferredSkills: string[];
  yearsRequired: number | null;
  educationRequired: 'high_school' | 'bachelors' | 'masters' | 'phd' | null;
  gatekeepers: string[];
  sectionSplitWorked: boolean;
  _sections: { required: string; preferred: string };
}

function splitJDSections(text: string): { required: string; preferred: string; worked: boolean } {
  const lines = text.split('\n');
  const sections: { type: 'required' | 'preferred' | 'other'; lines: string[] }[] = [];
  let currentType: 'required' | 'preferred' | 'other' = 'other';
  let currentLines: string[] = [];
  let foundAny = false;

  for (const line of lines) {
    const trimmed = line.trim();
    const isReq  = REQUIRED_HEADINGS.some(p => p.test(trimmed))  && trimmed.length < 80;
    const isPref = PREFERRED_HEADINGS.some(p => p.test(trimmed)) && trimmed.length < 80;

    if (isReq) {
      if (currentLines.length) sections.push({ type: currentType, lines: currentLines });
      currentType = 'required'; currentLines = []; foundAny = true;
    } else if (isPref) {
      if (currentLines.length) sections.push({ type: currentType, lines: currentLines });
      currentType = 'preferred'; currentLines = []; foundAny = true;
    } else {
      currentLines.push(line);
    }
  }
  if (currentLines.length) sections.push({ type: currentType, lines: currentLines });

  return {
    required: sections.filter(s => s.type === 'required').map(s => s.lines.join('\n')).join('\n').trim(),
    preferred: sections.filter(s => s.type === 'preferred').map(s => s.lines.join('\n')).join('\n').trim(),
    worked: foundAny,
  };
}

function extractYearsRequired(text: string): number | null {
  const patterns = [
    /(\d+)\+?\s*(?:or more\s+)?years?\s+of\s+(?:relevant\s+|related\s+|professional\s+)?experience/gi,
    /(\d+)\+?\s*years?\s+experience/gi,
    /minimum\s+(?:of\s+)?(\d+)\s*years?/gi,
    /at\s+least\s+(\d+)\s*years?/gi,
  ];
  let min: number | null = null;
  for (const p of patterns) {
    p.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = p.exec(text)) !== null) {
      const v = parseInt(m[1], 10);
      if (!isNaN(v) && v <= 20 && (min === null || v < min)) min = v;
    }
  }
  return min;
}

function extractEducationRequired(text: string): ParsedJD['educationRequired'] {
  const lower = text.toLowerCase();
  if (/\bph\.?d\b|\bdoctorate\b|\bdoctoral\b/.test(lower)) return 'phd';
  if (/\bmaster'?s?\b|\bm\.s\.?\b|\bm\.eng\b|\bmba\b/.test(lower)) return 'masters';
  if (/\bbachelor'?s?\b|\bb\.s\.?\b|\bb\.a\.?\b|\bundergraduate\b/.test(lower)) return 'bachelors';
  if (/\bhigh school\b|\bged\b/.test(lower)) return 'high_school';
  return null;
}

// Known structural headings that appear before the real job title — skip these
const SKIP_TITLE_PATTERNS = [
  /^(principal|key|core)\s+accountabilit/i,
  /^(knowledge|experience|education|supervision|overview|about|summary|responsibilities|requirements)/i,
  /^(job\s+)?description$/i,
  /^position\s+(overview|summary|details)$/i,
];

function extractJobTitle(text: string): string {
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (
      t.length > 3 &&
      t.length < 80 &&
      !t.includes('.') &&
      !/^(as a|we are|about|our|the company)/i.test(t) &&
      !SKIP_TITLE_PATTERNS.some(p => p.test(t))
    ) return t;
  }
  return '';
}

const MAX_REQUIRED_FALLBACK = 12; // cap when no section split found

function parseJD(jdText: string): ParsedJD {
  const { required: reqSection, preferred: prefSection, worked } = splitJDSections(jdText);

  let requiredRaw: Set<string>;
  let preferredRaw: Set<string>;

  if (worked) {
    requiredRaw  = applyImpliedSkills(scanText(reqSection || jdText));
    preferredRaw = applyImpliedSkills(scanText(prefSection));
  } else {
    // No headings found — scan full text, cap at top-weighted skills
    const allFound = applyImpliedSkills(scanText(jdText));
    const ranked   = [...allFound].sort((a, b) => getWeight(b) - getWeight(a));
    requiredRaw    = new Set(ranked.slice(0, MAX_REQUIRED_FALLBACK));
    preferredRaw   = new Set(ranked.slice(MAX_REQUIRED_FALLBACK));
  }

  // Deduplicate implied — remove generic if specific is already present
  const requiredDeduped  = deduplicateImplied(requiredRaw);
  const preferredDeduped = deduplicateImplied(preferredRaw);


  // ── Core-skill promotion rule ────────────────────────────────────────────────
  // Some JDs write the required section as abstract prose ("proficiency in
  // statistical programming languages") and list concrete tools (Python, SQL, R)
  // only under the preferred/tools section.
  // Rule: if required has < 8 skills AND preferred has weight=3 skills,
  // promote those core skills to required — they are gate skills regardless
  // of where the JD author placed them.
  if (requiredDeduped.size < 8 && preferredDeduped.size > 0) {
    for (const skill of [...preferredDeduped]) {
      if (getWeight(skill) === 3) {
        requiredDeduped.add(skill);
        preferredDeduped.delete(skill);
      }
    }
  }

  // Remove anything in required from preferred
  const preferredFinal = new Set([...preferredDeduped].filter(s => !requiredDeduped.has(s)));

  // Sort by weight descending (most important first)
  const sortByWeight = (a: string, b: string) => getWeight(b) - getWeight(a);

  return {
    jobTitle:           extractJobTitle(jdText),
    requiredSkills:     [...requiredDeduped].sort(sortByWeight),
    preferredSkills:    [...preferredFinal].sort(sortByWeight),
    yearsRequired:      extractYearsRequired(jdText),
    educationRequired:  extractEducationRequired(jdText),
    gatekeepers:        GATEKEEPER_PATTERNS.filter(g => g.pattern.test(jdText)).map(g => g.label),
    sectionSplitWorked: worked,
    _sections: {
      required:  reqSection.slice(0, 600),
      preferred: prefSection.slice(0, 600),
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// RESUME PARSER
// ═══════════════════════════════════════════════════════════════════════════════

const EXPERIENCE_HEADINGS = [
  /^\s*(work\s+)?experience\s*[:\-]?\s*$/i,
  /^\s*employment(\s+history)?\s*[:\-]?\s*$/i,
  /^\s*professional\s+(experience|background)\s*[:\-]?\s*$/i,
  /^\s*(relevant\s+)?projects?\s*[:\-]?\s*$/i,
  /^\s*research\s+(experience|projects?)\s*[:\-]?\s*$/i,
];

const SKILLS_SECTION_HEADINGS = [
  /^\s*(technical\s+)?skills?\s*[:\-]?\s*$/i,
  /^\s*core\s+competencies\s*[:\-]?\s*$/i,
  /^\s*technologies?\s*[:\-]?\s*$/i,
  /^\s*tools?\s+(&\s+technologies?)?\s*[:\-]?\s*$/i,
];

const EDUCATION_HEADINGS = [
  /^\s*education(\s+&\s+training)?\s*[:\-]?\s*$/i,
  /^\s*academic\s+background\s*[:\-]?\s*$/i,
];

interface ParsedResume {
  skills: string[];             // all skills found (after implied expansion)
  skillsInContext: string[];    // skills found in experience/project bullets
  skillsListOnly: string[];     // skills ONLY in skills section (weaker evidence)
  yearsExperience: number | null;
  educationLevel: 'high_school' | 'bachelors' | 'masters' | 'phd' | null;
  _sections: { experience: string; skills: string; education: string };
}

function splitResumeSections(text: string): { experience: string; skills: string; education: string } {
  type T = 'experience' | 'skills' | 'education' | 'other';
  const sections: { type: T; lines: string[] }[] = [];
  let currentType: T = 'other';
  let currentLines: string[] = [];

  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    const isExp   = EXPERIENCE_HEADINGS.some(p => p.test(trimmed))        && trimmed.length < 60;
    const isSkill = SKILLS_SECTION_HEADINGS.some(p => p.test(trimmed))    && trimmed.length < 60;
    const isEdu   = EDUCATION_HEADINGS.some(p => p.test(trimmed))         && trimmed.length < 60;

    if      (isExp)   { if (currentLines.length) sections.push({ type: currentType, lines: currentLines }); currentType = 'experience'; currentLines = []; }
    else if (isSkill) { if (currentLines.length) sections.push({ type: currentType, lines: currentLines }); currentType = 'skills';     currentLines = []; }
    else if (isEdu)   { if (currentLines.length) sections.push({ type: currentType, lines: currentLines }); currentType = 'education';  currentLines = []; }
    else { currentLines.push(line); }
  }
  if (currentLines.length) sections.push({ type: currentType, lines: currentLines });

  return {
    experience: sections.filter(s => s.type === 'experience').map(s => s.lines.join('\n')).join('\n').trim(),
    skills:     sections.filter(s => s.type === 'skills').map(s => s.lines.join('\n')).join('\n').trim(),
    education:  sections.filter(s => s.type === 'education').map(s => s.lines.join('\n')).join('\n').trim(),
  };
}

function extractYearsExperience(text: string): number | null {
  const rangePattern = /(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+)?(\d{4})\s*[-–—]\s*(present|current|now|(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+)?(\d{4}))/gi;
  const currentYear = new Date().getFullYear();
  let earliest: number | null = null;
  let latest: number | null = null;
  let m: RegExpExecArray | null;

  while ((m = rangePattern.exec(text)) !== null) {
    const start = parseInt(m[1], 10);
    const endStr = m[2].toLowerCase();
    const end = /present|current|now/.test(endStr) ? currentYear : parseInt(m[3] || m[2], 10);
    if (!isNaN(start) && start >= 1990 && start <= currentYear) {
      if (earliest === null || start < earliest) earliest = start;
    }
    if (!isNaN(end) && end >= 1990 && end <= currentYear + 1) {
      if (latest === null || end > latest) latest = end;
    }
  }

  if (earliest !== null && latest !== null) return Math.max(0, latest - earliest);

  const stated = /(\d+)\+?\s+years?\s+of\s+(?:professional\s+)?experience/i.exec(text);
  if (stated) return parseInt(stated[1], 10);

  return null;
}

function extractEducationLevel(text: string): ParsedResume['educationLevel'] {
  const lower = text.toLowerCase();
  if (/\bph\.?d\b|\bdoctorate\b|\bdoctoral\b/.test(lower)) return 'phd';
  if (/\bmaster'?s?\b|\bm\.s\.?\b|\bm\.eng\b|\bmba\b/.test(lower)) return 'masters';
  if (/\bbachelor'?s?\b|\bb\.s\.?\b|\bb\.a\.?\b|\bundergraduate\b/.test(lower)) return 'bachelors';
  if (/\bhigh school\b|\bged\b/.test(lower)) return 'high_school';
  return null;
}

function parseResume(resumeText: string): ParsedResume {
  const sections = splitResumeSections(resumeText);
  const expText    = sections.experience || resumeText;
  const skillsText = sections.skills     || '';

  const inContextExpanded = applyImpliedSkills(scanText(expText));
  const listedExpanded    = applyImpliedSkills(scanText(skillsText));
  const allExpanded       = applyImpliedSkills(scanText(resumeText));

  const allSkills       = [...allExpanded].sort();
  const skillsInContext = allSkills.filter(s => inContextExpanded.has(s));
  const skillsListOnly  = allSkills.filter(s => listedExpanded.has(s) && !inContextExpanded.has(s));

  // Use only experience section for date math — prevents education dates
  // (e.g. "Aug 2020 - Jul 2024" BTech) from inflating years of work experience.
  // Fall back to full text only if no experience section was detected.
  const dateSourceText = sections.experience || resumeText;

  return {
    skills: allSkills,
    skillsInContext,
    skillsListOnly,
    yearsExperience: extractYearsExperience(dateSourceText),
    educationLevel:  extractEducationLevel(resumeText),
    _sections: {
      experience: expText.slice(0, 800),
      skills:     skillsText.slice(0, 400),
      education:  sections.education.slice(0, 300),
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCORER — weighted, depth-aware, exponential experience decay
// ═══════════════════════════════════════════════════════════════════════════════

// Weights: required(45) + depth(20) + preferred(15) + experience(12) + education(8) = 100

interface ScoreBreakdown {
  requiredScore:   number;   // 0–45  weighted skill coverage
  depthScore:      number;   // 0–20  skills proven in bullets vs just listed
  preferredScore:  number;   // 0–15  preferred skill coverage
  experienceScore: number;   // 0–12  exponential decay on years gap
  educationScore:  number;   // 0–8   degree level match
  finalScore:      number;   // 0–100
}

interface MatchScore {
  score:            number;
  label:            'Excellent' | 'Strong' | 'Good' | 'Partial' | 'Weak';
  breakdown:        ScoreBreakdown;
  matchedRequired:  string[];
  missingRequired:  string[];
  matchedPreferred: string[];
  missingPreferred: string[];
  gatekeepers:      string[];
}

const EDU_RANK: Record<string, number> = { high_school: 1, bachelors: 2, masters: 3, phd: 4 };

function computeScore(resume: ParsedResume, jd: ParsedJD): MatchScore {
  const resumeSet    = new Set(resume.skills);
  const inContextSet = new Set(resume.skillsInContext);

  // ── Dynamic weight rebalancing ───────────────────────────────────────────────
  // When a JD has many preferred skills (concrete tools list), they carry real
  // signal. If preferred_count >= 60% of required_count, we shift 7pts from
  // required into preferred to reflect the JD's actual emphasis.
  // Fixed total always = 45 + 20 + 15 + 12 + 8 = 100
  const prefRatio = jd.requiredSkills.length === 0 ? 0
    : jd.preferredSkills.length / jd.requiredSkills.length;
  const W_REQ  = prefRatio >= 0.6 ? 32 : 45;  // 32 or 45
  const W_PREF = prefRatio >= 0.6 ? 28 : 15;  // 28 or 15

  // ── 1. Required skills — weighted ───────────────────────────────────────────
  const matchedRequired = jd.requiredSkills.filter(s => resumeSet.has(s));
  const missingRequired = jd.requiredSkills.filter(s => !resumeSet.has(s));

  let weightedPossible = 0;
  let weightedMatched  = 0;
  for (const s of jd.requiredSkills) {
    const w = getWeight(s);
    weightedPossible += w;
    if (resumeSet.has(s)) weightedMatched += w;
  }

  const requiredScore = jd.requiredSkills.length === 0
    ? Math.round(W_REQ * 0.8)   // no required skills — neutral
    : Math.round((weightedMatched / weightedPossible) * W_REQ);

  // ── 2. Depth of evidence (0–20) ─────────────────────────────────────────────
  // For each matched required skill: 1.0 if in bullets, 0.4 if listed only
  let depthSum = 0;
  for (const s of matchedRequired) {
    depthSum += inContextSet.has(s) ? 1.0 : 0.4;
  }
  const depthScore = matchedRequired.length === 0
    ? 0
    : Math.round((depthSum / matchedRequired.length) * 20);

  // ── 3. Preferred skills — dynamic weight ────────────────────────────────────
  const matchedPreferred = jd.preferredSkills.filter(s => resumeSet.has(s));
  const missingPreferred = jd.preferredSkills.filter(s => !resumeSet.has(s));

  const preferredScore = jd.preferredSkills.length === 0
    ? Math.round(W_PREF * 0.67)   // no preferred section — neutral
    : Math.round((matchedPreferred.length / jd.preferredSkills.length) * W_PREF);

  // ── 4. Experience — exponential decay (0–12) ────────────────────────────────
  // score = 12 × e^(−0.6 × gap), clamped [0–12]
  let experienceScore = 10; // neutral when data missing
  if (jd.yearsRequired !== null && resume.yearsExperience !== null) {
    const gap = Math.max(0, jd.yearsRequired - resume.yearsExperience);
    experienceScore = Math.round(12 * Math.exp(-0.6 * gap));
  } else if (jd.yearsRequired === null) {
    experienceScore = 12; // no requirement — full credit
  }

  // ── 5. Education (0–8) ──────────────────────────────────────────────────────
  let educationScore = 5; // neutral when data missing
  if (jd.educationRequired && resume.educationLevel) {
    const rr = EDU_RANK[resume.educationLevel]  ?? 0;
    const jr = EDU_RANK[jd.educationRequired]   ?? 0;
    if      (rr >= jr + 1) educationScore = 8;  // over-qualified
    else if (rr === jr)    educationScore = 8;  // exact match
    else if (rr === jr -1) educationScore = 4;  // one level below
    else                   educationScore = 0;  // significantly below
  } else if (!jd.educationRequired) {
    educationScore = 8;
  }

  // ── Final ────────────────────────────────────────────────────────────────────
  const raw        = requiredScore + depthScore + preferredScore + experienceScore + educationScore;
  const finalScore = Math.max(0, Math.min(100, Math.round(raw)));

  const label: MatchScore['label'] =
    finalScore >= 80 ? 'Excellent' :
    finalScore >= 65 ? 'Strong'    :
    finalScore >= 50 ? 'Good'      :
    finalScore >= 35 ? 'Partial'   : 'Weak';

  return {
    score: finalScore,
    label,
    breakdown: { requiredScore, depthScore, preferredScore, experienceScore, educationScore, finalScore },
    matchedRequired,
    missingRequired,
    matchedPreferred,
    missingPreferred,
    gatekeepers: jd.gatekeepers,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// GPT EXPLANATION — narrative only, score is locked before this runs
// ═══════════════════════════════════════════════════════════════════════════════

async function generateExplanation(score: MatchScore, resumeText: string, jdText: string): Promise<string> {
  const label = score.label;
  const prompt = `You are a career coach reviewing a resume against a job description.

SCORE: ${score.score}/100 — ${label} match. This is final. Do not mention a different number.

MATCHED required skills: ${score.matchedRequired.slice(0, 10).join(', ') || 'none'}
MISSING required skills: ${score.missingRequired.slice(0, 8).join(', ')  || 'none'}
MATCHED preferred: ${score.matchedPreferred.slice(0, 6).join(', ') || 'none'}
MISSING preferred: ${score.missingPreferred.slice(0, 6).join(', ') || 'none'}

RESUME (first 1200 chars):
${resumeText.slice(0, 1200)}

JD (first 1200 chars):
${jdText.slice(0, 1200)}

Write a 4–6 sentence honest, warm assessment covering: overall fit, key strengths, critical gaps, and one concrete action step.
Plain text only. No bullet points. No JSON.`;

  try {
    const res = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 400,
      temperature: 0.3,
      messages: [{ role: 'user', content: prompt }],
    });
    return res.choices[0].message.content?.trim() || '';
  } catch (err: any) {
    return `[Explanation unavailable: ${err.message}]`;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN TRACE
// ═══════════════════════════════════════════════════════════════════════════════

async function main() {
  const lines: string[] = [];
  const log  = (s = '')    => { console.log(s); lines.push(s); };
  const sep  = (t = '')    => log(`\n${'═'.repeat(74)}\n  ${t}\n${'═'.repeat(74)}`);
  const sub  = (t = '')    => log(`\n  ── ${t} ──────────────────────────────────`);
  const ok   = (s: string) => log(`  ✅  ${s}`);
  const fail = (s: string) => log(`  ❌  ${s}`);
  const warn = (s: string) => log(`  ⚠️   ${s}`);
  const info = (s: string) => log(`  ℹ️   ${s}`);

  sep('PIPELINE TRACE V3.6 — hardcoded + weighted scorer');
  log(`  User  : ${USER_ID}`);
  log(`  Time  : ${new Date().toISOString()}`);
  log(`  Dict  : ${SKILL_DICTIONARY.length} skills`);

  // ── Step 1: Fetch resume ────────────────────────────────────────────────────
  sep('STEP 1 — RESUME FROM DB');

  const { data: resumes } = await supabase
    .from('resumes')
    .select('id, file_name, extracted_text, is_active')
    .eq('user_id', USER_ID)
    .order('uploaded_at', { ascending: false });

  if (!resumes?.length) { log('❌ No resumes'); process.exit(1); }
  const resumeRow = resumes.find(r => r.is_active) || resumes[0];
  log(`  File   : ${resumeRow.file_name}`);
  log(`  Active : ${resumeRow.is_active}`);
  log(`  Chars  : ${resumeRow.extracted_text?.length ?? 0}`);
  log(`\n${resumeRow.extracted_text}`);

  // ── Step 2: Fetch JD ────────────────────────────────────────────────────────
  sep('STEP 2 — JOB DESCRIPTION FROM DB');

  const { data: apps } = await supabase
    .from('applications')
    .select('id, company, position, job_description')
    .eq('user_id', USER_ID)
    .not('job_description', 'is', null)
    .order('last_updated', { ascending: false });

  if (!apps?.length) { log('❌ No apps with JD'); process.exit(1); }

  log(`  Found ${apps.length} application(s) with JD:`);
  apps.forEach((a, i) => log(`    ${i+1}. ${a.company} — ${a.position}`));

  const app = apps[0];
  log(`\n  Using: ${app.company} — ${app.position}\n`);
  log(app.job_description);

  // ── Step 3: Parse JD ────────────────────────────────────────────────────────
  sep('STEP 3 — JD PARSE');

  const parsedJD = parseJD(app.job_description);

  log(`  Title          : ${parsedJD.jobTitle}`);
  log(`  Years required : ${parsedJD.yearsRequired ?? 'not stated'}`);
  log(`  Education req  : ${parsedJD.educationRequired ?? 'not stated'}`);
  log(`  Section split  : ${parsedJD.sectionSplitWorked ? '✅ headings found' : '⚠️  no headings — fallback used'}`);

  sub('Required section text (first 600 chars)');
  log(`  ${parsedJD._sections.required || '(full text used as fallback)'}`);

  sub('Preferred section text (first 600 chars)');
  log(`  ${parsedJD._sections.preferred || '(none found)'}`);

  sub(`Required skills (${parsedJD.requiredSkills.length}) — sorted by weight`);
  if (parsedJD.requiredSkills.length) {
    parsedJD.requiredSkills.forEach(s => log(`    • [w${getWeight(s)}] ${s}`));
  } else {
    warn('No required skills detected');
  }

  sub(`Preferred skills (${parsedJD.preferredSkills.length})`);
  if (parsedJD.preferredSkills.length) {
    parsedJD.preferredSkills.forEach(s => log(`    • [w${getWeight(s)}] ${s}`));
  } else {
    info('No preferred skills found');
  }

  if (parsedJD.gatekeepers.length) {
    sub('⚠️  Gatekeepers');
    parsedJD.gatekeepers.forEach(g => warn(g));
  }

  // ── Step 4: Parse resume ────────────────────────────────────────────────────
  sep('STEP 4 — RESUME PARSE');

  const parsedResume = parseResume(resumeRow.extracted_text);

  log(`  Years experience : ${parsedResume.yearsExperience ?? 'not detected'}`);
  log(`  Education level  : ${parsedResume.educationLevel ?? 'not detected'}`);
  log(`  Total skills     : ${parsedResume.skills.length}`);
  log(`  In-context       : ${parsedResume.skillsInContext.length} (proven in bullets)`);
  log(`  Listed-only      : ${parsedResume.skillsListOnly.length} (skills section only)`);

  sub('Experience section (first 800 chars)');
  log(`  ${parsedResume._sections.experience || '(none detected)'}`);

  sub('Skills section (first 400 chars)');
  log(`  ${parsedResume._sections.skills || '(none detected)'}`);

  sub('All skills found');
  log(`  ${parsedResume.skills.join(', ')}`);

  sub('In-context skills (strong evidence)');
  log(`  ${parsedResume.skillsInContext.join(', ') || 'none'}`);

  sub('Listed-only skills (weaker evidence)');
  log(`  ${parsedResume.skillsListOnly.join(', ') || 'none'}`);

  // ── Step 5: Skill match ─────────────────────────────────────────────────────
  sep('STEP 5 — SKILL MATCHING');

  const resumeSet = new Set(parsedResume.skills);

  sub('Required skills match');
  parsedJD.requiredSkills.forEach(skill => {
    const matched  = resumeSet.has(skill);
    const inCtx    = parsedResume.skillsInContext.includes(skill);
    const evidence = inCtx ? '(in bullets ✦)' : '(listed only)';
    const raw      = resumeRow.extracted_text.toLowerCase().includes(skill.toLowerCase());
    if (matched)       ok(`[w${getWeight(skill)}] ${skill} ${evidence}`)
    else if (raw)      warn(`[w${getWeight(skill)}] ${skill} — IN raw text but NOT in dictionary → add alias`)
    else               fail(`[w${getWeight(skill)}] ${skill} — genuinely absent`);
  });

  sub('Preferred skills match');
  parsedJD.preferredSkills.forEach(skill => {
    const matched = resumeSet.has(skill);
    if (matched) ok(`[w${getWeight(skill)}] ${skill}`)
    else         fail(`[w${getWeight(skill)}] ${skill}`);
  });

  // ── Step 6: Score ───────────────────────────────────────────────────────────
  sep('STEP 6 — SCORE');

  const result = computeScore(parsedResume, parsedJD);

  log(`\n  ┌──────────────────────────────────────────┐`);
  log(`  │  Dimension              Score     Max    │`);
  log(`  │  ─────────────────────────────────────── │`);
  log(`  │  Required skills      ${String(result.breakdown.requiredScore).padStart(5)}      45    │`);
  log(`  │  Depth of evidence    ${String(result.breakdown.depthScore).padStart(5)}      20    │`);
  log(`  │  Preferred skills     ${String(result.breakdown.preferredScore).padStart(5)}      15    │`);
  log(`  │  Experience           ${String(result.breakdown.experienceScore).padStart(5)}      12    │`);
  log(`  │  Education            ${String(result.breakdown.educationScore).padStart(5)}       8    │`);
  log(`  │  ─────────────────────────────────────── │`);
  log(`  │  FINAL SCORE          ${String(result.score).padStart(5)}     100    │`);
  log(`  │  Label                ${result.label.padEnd(20)}  │`);
  log(`  └──────────────────────────────────────────┘`);

  log(`\n  Matched required  (${result.matchedRequired.length}) : ${result.matchedRequired.join(', ') || 'none'}`);
  log(`  Missing required  (${result.missingRequired.length}) : ${result.missingRequired.join(', ') || 'none'}`);
  log(`  Matched preferred (${result.matchedPreferred.length}) : ${result.matchedPreferred.join(', ') || 'none'}`);
  log(`  Missing preferred (${result.missingPreferred.length}) : ${result.missingPreferred.join(', ') || 'none'}`);

  // ── Step 7: Diagnosis ───────────────────────────────────────────────────────
  sep('STEP 7 — DIAGNOSIS');

  if (!parsedJD.sectionSplitWorked) {
    warn('Section split failed — required skills extracted from full JD text (capped at 12)');
    warn('If score seems off, try adding more heading patterns to REQUIRED_HEADINGS');
  }

  if (result.missingRequired.length === 0) {
    ok('All required skills matched');
  } else {
    log(`\n  Missing required breakdown:`);
    result.missingRequired.forEach(skill => {
      const inRaw = resumeRow.extracted_text.toLowerCase().includes(skill.toLowerCase());
      if (inRaw) warn(`"${skill}" is in raw resume text but not matched → add alias to dictionary`);
      else       info(`"${skill}" is genuinely absent from resume`);
    });
  }

  const expGap = (parsedJD.yearsRequired ?? 0) - (parsedResume.yearsExperience ?? 0);
  if (parsedJD.yearsRequired !== null && parsedResume.yearsExperience !== null) {
    if (expGap > 0) warn(`Experience gap: ${expGap} year(s) short (${parsedResume.yearsExperience} vs ${parsedJD.yearsRequired} required)`);
    else            ok(`Experience: meets requirement (${parsedResume.yearsExperience} years vs ${parsedJD.yearsRequired} required)`);
  }

  if (result.gatekeepers.length) {
    log('');
    result.gatekeepers.forEach(g => warn(`Gatekeeper: ${g}`));
  }

  // ── Step 8: GPT explanation ─────────────────────────────────────────────────
  sep('STEP 8 — GPT EXPLANATION (narrative only)');

  log('  Calling GPT-4o-mini for narrative (score is locked above)...\n');
  const explanation = await generateExplanation(result, resumeRow.extracted_text, app.job_description);
  log(`  ${explanation}`);

  // ── Write output ─────────────────────────────────────────────────────────────
  const outPath = path.resolve(__dirname, 'pipeline-trace-v3.txt');
  fs.writeFileSync(outPath, lines.join('\n'), 'utf-8');

  sep('DONE');
  log(`  Score  : ${result.score}/100 — ${result.label}`);
  log(`  Output : api/src/pipeline-trace-v3.txt`);
}

main().catch(err => {
  console.error('\n💥 Error:', err.message, '\n', err.stack);
  process.exit(1);
});