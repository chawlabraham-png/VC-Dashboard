CREATE TABLE IF NOT EXISTS public.startups (
  id text PRIMARY KEY,
  name text,
  logo text,
  sector text,
  "subSector" text,
  geography text,
  city text,
  founded text,
  stage text,
  "lastRound" jsonb,
  founders jsonb,
  description text,
  signals jsonb,
  metrics jsonb,
  tam numeric,
  "tamUnit" text
);

-- Delete existing to allow re-running
DELETE FROM public.startups;

-- Not inserting via SQL because it contains single quotes and complex JSON.
-- We will use a migration script instead.
