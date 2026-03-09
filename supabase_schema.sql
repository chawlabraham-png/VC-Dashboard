-- ============================================================
-- Jungle Ventures VC Dashboard — Supabase Schema
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard
-- ============================================================

-- ---- 1. news_signals table ----
-- Populated by n8n news scraping workflow (ET, VCCircle, Inc42, The Ken)
CREATE TABLE IF NOT EXISTS news_signals (
  id          bigserial PRIMARY KEY,
  title       text NOT NULL,
  summary     text,
  company     text,          -- extracted company name (if any)
  type        text,          -- 'funding', 'partnership', 'person_move', 'market_signal', 'general'
  source      text,          -- 'Economic Times', 'VCCircle', 'Inc42', 'The Ken', 'LinkedIn', etc.
  source_url  text,
  published_at timestamptz DEFAULT now(),
  created_at  timestamptz DEFAULT now(),
  relevance_score integer DEFAULT 0,   -- 0-100: how relevant to JV's thesis
  tags        text[],        -- e.g. ['India', 'FinTech', 'Series A']
  ai_summary  text,          -- OpenAI-generated 2-sentence summary
  implication text           -- OpenAI-generated "what this means for JV"
);
CREATE INDEX IF NOT EXISTS idx_news_signals_published ON news_signals(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_signals_company   ON news_signals(company);
CREATE INDEX IF NOT EXISTS idx_news_signals_type      ON news_signals(type);

-- ---- 2. deal_enrichments table ----
-- Populated by n8n GPT enrichment workflow
CREATE TABLE IF NOT EXISTS deal_enrichments (
  id                bigserial PRIMARY KEY,
  box_key           text UNIQUE NOT NULL,   -- Streak box_key, joins to streak_deals
  company_name      text,
  -- Founders
  founder_name      text,
  founder_linkedin  text,
  founder_background text,
  co_founders       text,
  -- Business
  website           text,
  founded_year      int,
  employee_count    text,
  business_model    text,
  product_description text,
  -- Traction
  revenue           text,
  growth_rate       text,
  customers         text,
  -- Funding history
  total_raised      text,
  last_round        text,
  last_round_date   text,
  investors         text[],
  -- JV thesis
  thesis_fit_score  int,        -- 0-100
  thesis_fit_reason text,
  strengths         text[],
  risks             text[],
  -- Competitive
  competitors       text[],
  moat              text,
  -- Market
  market_size       text,
  market_growth     text,
  -- Meta
  enriched_at       timestamptz DEFAULT now(),
  enriched_by       text DEFAULT 'gpt-4o',
  raw_response      text        -- full GPT JSON for debugging
);
CREATE INDEX IF NOT EXISTS idx_deal_enrichments_box_key ON deal_enrichments(box_key);

-- ---- 3. vc_contacts table ----
-- Known VCs, angels, limited partners (for co-investment mapping)
CREATE TABLE IF NOT EXISTS vc_contacts (
  id            bigserial PRIMARY KEY,
  name          text NOT NULL,
  firm          text,
  role          text,          -- 'Partner', 'Principal', 'Associate', 'Angel'
  linkedin      text,
  email         text,
  twitter       text,
  focus_geos    text[],        -- e.g. ['India', 'SEA']
  focus_sectors text[],        -- e.g. ['SaaS', 'FinTech']
  fund_size     text,
  typical_check text,          -- e.g. '$500K-$2M'
  notes         text,
  warm_intro    text,          -- who can intro JV to this VC
  relationship  text DEFAULT 'cold',   -- 'cold', 'warm', 'partner', 'lp'
  last_contact  timestamptz,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vc_contacts_firm ON vc_contacts(firm);

-- ---- 4. daily_briefings table ----
-- Populated by n8n daily summary workflow
-- (table may already exist, this is idempotent)
CREATE TABLE IF NOT EXISTS daily_briefings (
  id               bigserial PRIMARY KEY,
  date             date UNIQUE NOT NULL,
  summary_markdown text,
  sources          jsonb,
  created_at       timestamptz DEFAULT now()
);

-- ---- RLS: make all tables readable by anon key ----
-- (the dashboard uses the anon/publishable key)
ALTER TABLE news_signals     ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_enrichments ENABLE ROW LEVEL SECURITY;
ALTER TABLE vc_contacts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_briefings  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_read_news"         ON news_signals     FOR SELECT USING (true);
CREATE POLICY "anon_read_enrichments"  ON deal_enrichments FOR SELECT USING (true);
CREATE POLICY "anon_read_vc_contacts"  ON vc_contacts      FOR SELECT USING (true);
CREATE POLICY "anon_read_briefings"    ON daily_briefings  FOR SELECT USING (true);

-- Allow n8n service_role key to insert/update (n8n uses service_role)
CREATE POLICY "service_insert_news"        ON news_signals     FOR INSERT WITH CHECK (true);
CREATE POLICY "service_upsert_enrichments" ON deal_enrichments FOR ALL   USING (true);
CREATE POLICY "service_insert_vc_contacts" ON vc_contacts      FOR ALL   USING (true);
CREATE POLICY "service_upsert_briefings"   ON daily_briefings  FOR ALL   USING (true);
