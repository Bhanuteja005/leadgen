/**
 * PostgreSQL schema for LeadGen.
 * Run once at startup via migrate.ts.
 */

export const SCHEMA_SQL = /* sql */ `

-- ── Companies ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS companies (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  domain      TEXT UNIQUE,
  linkedin_url TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Search Jobs ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS jobs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID REFERENCES companies(id),
  company_name        TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'queued',   -- queued|processing|completed|failed
  error_message       TEXT,
  total_contacts      INT  NOT NULL DEFAULT 0,
  processed_contacts  INT  NOT NULL DEFAULT 0,
  verified_emails     INT  NOT NULL DEFAULT 0,
  progress_percent    INT  NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Contacts (Employees) ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contacts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id          UUID REFERENCES jobs(id) ON DELETE CASCADE,
  company_id      UUID REFERENCES companies(id),
  full_name       TEXT NOT NULL,
  first_name      TEXT,
  last_name       TEXT,
  job_title       TEXT,
  role_category   TEXT,
  seniority_level TEXT,
  linkedin_url    TEXT,
  location        TEXT,
  source          TEXT NOT NULL DEFAULT 'apify',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Email Verifications ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_verifications (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id          UUID REFERENCES contacts(id) ON DELETE CASCADE,
  email               TEXT NOT NULL,
  pattern_used        TEXT,
  verification_status TEXT NOT NULL DEFAULT 'unknown',  -- valid|invalid|unknown|catch_all|risky|unverified
  is_reachable        TEXT,
  has_mx_records      BOOLEAN,
  is_disposable       BOOLEAN,
  is_role_account     BOOLEAN,
  is_free             BOOLEAN,
  confidence_score    INT,
  smtp_response       TEXT,
  verified_at         TIMESTAMPTZ,
  UNIQUE (contact_id, email)
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_jobs_company_id        ON jobs(company_id);
CREATE INDEX IF NOT EXISTS idx_contacts_job_id        ON contacts(job_id);
CREATE INDEX IF NOT EXISTS idx_contacts_company_id    ON contacts(company_id);
CREATE INDEX IF NOT EXISTS idx_email_contact_id       ON email_verifications(contact_id);

`;
