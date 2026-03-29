// ═══════════════════════════════════════════════════════════════════════════════
// SKILL DICTIONARY
// Extracted from trace-match-pipeline.ts v3.6
// Each entry: canonical name, aliases (word-boundary matched), implied-by rules,
// and weight (core=3, standard=2, niche=1)
// ═══════════════════════════════════════════════════════════════════════════════

export interface SkillEntry {
  canonical: string;
  aliases: string[];
  impliedBy?: string[][];   // OR of ANDs — any one full group being present credits this skill
  weight: 1 | 2 | 3;       // 3=core, 2=standard, 1=niche
}

export const SKILL_DICTIONARY: SkillEntry[] = [
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

  // ── Writing / Comms ─────────────────────────────────────────────────────────
  { canonical: 'technical writing', aliases: ['technical writing', 'documentation', 'technical documentation'],     weight: 2 },
  { canonical: 'public relations',  aliases: ['public relations', 'media relations', 'press releases'],             weight: 3 },
  { canonical: 'content writing',   aliases: ['content writing', 'copywriting', 'content creation'],               weight: 2 },

  // ── Research ────────────────────────────────────────────────────────────────
  { canonical: 'research methodology', aliases: ['research methodology', 'research design', 'qualitative research', 'quantitative research'], weight: 3 },
  { canonical: 'spss',                 aliases: ['spss', 'ibm spss'],                                              weight: 2 },
];

// ═══════════════════════════════════════════════════════════════════════════════
// SKILL SCANNING UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════

export function scanText(text: string): Set<string> {
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

export function applyImpliedSkills(found: Set<string>): Set<string> {
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
export function deduplicateImplied(skills: Set<string>): Set<string> {
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

export function getWeight(canonical: string): number {
  return SKILL_DICTIONARY.find(e => e.canonical === canonical)?.weight ?? 1;
}
