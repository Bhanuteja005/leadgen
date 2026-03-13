import { Router, Request, Response } from "express";
import { pool }        from "../db/pool";
import { runPipeline } from "../services/pipeline";

const router = Router();

/**
 * POST /api/search
 * Body: {
 *   company_name: string
 *   linkedin_company_url?: string
 *   force_refresh?: boolean
 *   roles?: string[]          // role keywords to filter; empty array = no filter (all employees)
 *   max_contacts?: number     // default 25
 * }
 */
router.post("/", async (req: Request, res: Response): Promise<void> => {
  const {
    company_name,
    linkedin_company_url,
    force_refresh,
    roles,
    max_contacts = 25,
  } = req.body as {
    company_name?: string;
    linkedin_company_url?: string;
    force_refresh?: boolean;
    roles?: string[];
    max_contacts?: number;
  };

  if (!company_name || typeof company_name !== "string" || !company_name.trim()) {
    res.status(400).json({ error: "company_name is required" });
    return;
  }

  const name        = company_name.trim();
  const cap         = Math.min(Number(max_contacts) || 25, 500);
  const targetRoles: string[] = Array.isArray(roles) ? roles : [];
  const linkedinCompanyUrl = typeof linkedin_company_url === "string" && linkedin_company_url.trim()
    ? linkedin_company_url.trim()
    : undefined;

  if (
    linkedinCompanyUrl &&
    !/^https?:\/\/(www\.)?linkedin\.com\/company\/[a-z0-9-_%]+/i.test(linkedinCompanyUrl)
  ) {
    res.status(400).json({ error: "linkedin_company_url must be a valid LinkedIn company URL" });
    return;
  }

  const forceRefresh = Boolean(force_refresh);

  // ── Cache check: if same company was completed within 7 days, reuse it ────
  if (!forceRefresh) {
    const cached = await pool.query<{ id: string; created_at: string }>(
      `SELECT id, created_at FROM jobs
        WHERE LOWER(company_name) = LOWER($1)
          AND status = 'completed'
          AND created_at > NOW() - INTERVAL '7 days'
        ORDER BY created_at DESC
        LIMIT 1`,
      [name],
    );

    if (cached.rows.length > 0) {
      const hit = cached.rows[0];
      console.log(`[route] Cache hit for "${name}" — reusing job ${hit.id} (created ${hit.created_at})`);
      res.status(200).json({ job_id: hit.id, status: "completed", company_name: name, cached: true });
      return;
    }
  }

  // Create job row
  const jobResult = await pool.query<{ id: string }>(
    `INSERT INTO jobs (company_name, status) VALUES ($1, 'queued') RETURNING id`,
    [name],
  );
  const jobId = jobResult.rows[0].id;

  // Fire and forget
  setImmediate(() => {
    runPipeline(jobId, name, targetRoles, cap, linkedinCompanyUrl).catch((err) => {
      console.error(`[route] unhandled pipeline error for ${jobId}:`, err);
    });
  });

  res.status(202).json({ job_id: jobId, status: "queued", company_name: name });
});

/**
 * GET /api/search/:id  — job status
 */
router.get("/:id", async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const result = await pool.query<{
    id: string; status: string; company_name: string; company_id: string | null;
    total_contacts: number; processed_contacts: number; verified_emails: number;
    progress_percent: number; error_message: string | null; created_at: string;
  }>(
    `SELECT id, status, company_name, company_id,
            total_contacts, processed_contacts, verified_emails,
            progress_percent, error_message, created_at
       FROM jobs WHERE id = $1`,
    [id],
  );

  if (result.rows.length === 0) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  const j = result.rows[0];
  res.json({
    job_id:             j.id,
    status:             j.status,
    company_name:       j.company_name,
    company_id:         j.company_id,
    total_contacts:     j.total_contacts,
    processed_contacts: j.processed_contacts,
    verified_emails:    j.verified_emails,
    progress_percent:   j.progress_percent,
    error_message:      j.error_message,
    created_at:         j.created_at,
  });
});

/**
 * GET /api/search/:id/results  — contacts with best email for a completed job
 */
router.get("/:id/results", async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  // Ensure job exists
  const jobCheck = await pool.query(`SELECT id, status FROM jobs WHERE id = $1`, [id]);
  if (jobCheck.rows.length === 0) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  const rows = await pool.query<{
    id: string; full_name: string; first_name: string | null; last_name: string | null;
    job_title: string | null; role_category: string | null; seniority_level: string | null;
    linkedin_url: string | null; location: string | null;
    company_name: string; domain: string | null;
    best_email: string | null; verification_status: string | null; confidence_score: number | null;
  }>(
    `SELECT
       c.id, c.full_name, c.first_name, c.last_name,
       c.job_title, c.role_category, c.seniority_level,
       c.linkedin_url, c.location,
       co.name  AS company_name,
       co.domain,
       ev.email AS best_email,
       ev.verification_status,
       ev.confidence_score
     FROM contacts c
     JOIN companies co ON co.id = c.company_id
     LEFT JOIN LATERAL (
       SELECT email, verification_status, confidence_score
         FROM email_verifications
        WHERE contact_id = c.id
        ORDER BY confidence_score DESC NULLS LAST
        LIMIT 1
     ) ev ON TRUE
     WHERE c.job_id = $1
     ORDER BY ev.confidence_score DESC NULLS LAST, c.full_name`,
    [id],
  );

  res.json({
    job_id:   id,
    count:    rows.rows.length,
    contacts: rows.rows.map((r) => ({
      id:                  r.id,
      name:                r.full_name,
      first_name:          r.first_name,
      last_name:           r.last_name,
      title:               r.job_title,
      role_category:       r.role_category,
      seniority:           r.seniority_level,
      linkedin_url:        r.linkedin_url,
      location:            r.location,
      company:             r.company_name,
      domain:              r.domain,
      email:               r.best_email,
      email_status:        r.verification_status,
      confidence:          r.confidence_score,
    })),
  });
});

/**
 * GET /api/search/:id/export  — CSV download
 */
router.get("/:id/export", async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const rows = await pool.query<{
    full_name: string; job_title: string | null; role_category: string | null;
    linkedin_url: string | null; company_name: string; domain: string | null;
    best_email: string | null; verification_status: string | null;
  }>(
    `SELECT
       c.full_name, c.job_title, c.role_category, c.linkedin_url,
       co.name AS company_name, co.domain,
       ev.email AS best_email, ev.verification_status
     FROM contacts c
     JOIN companies co ON co.id = c.company_id
     LEFT JOIN LATERAL (
       SELECT email, verification_status
         FROM email_verifications
        WHERE contact_id = c.id
        ORDER BY confidence_score DESC NULLS LAST
        LIMIT 1
     ) ev ON TRUE
     WHERE c.job_id = $1
     ORDER BY c.full_name`,
    [id],
  );

  const header = "Name,Title,Role Category,Company,Domain,Email,Email Status,LinkedIn\n";
  const body   = rows.rows.map((r) =>
    [
      `"${r.full_name}"`,
      `"${r.job_title ?? ""}"`,
      `"${r.role_category ?? ""}"`,
      `"${r.company_name}"`,
      `"${r.domain ?? ""}"`,
      `"${r.best_email ?? ""}"`,
      `"${r.verification_status ?? ""}"`,
      `"${r.linkedin_url ?? ""}"`,
    ].join(",")
  ).join("\n");

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="leads-${id}.csv"`);
  res.send(header + body);
});

export default router;
