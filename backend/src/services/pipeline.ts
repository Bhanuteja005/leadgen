/**
 * Pipeline orchestrator — PostgreSQL edition.
 *
 * Flow for each company search:
 *   1. Resolve domain  → Clearbit Autocomplete (free)
 *   2. Scrape contacts → Apify harvestapi~linkedin-company-employees
 *   3. Role filter     → keep only requested roles
 *   4. Email patterns  → generate permutations (first.last@domain, etc.)
 *   5. SMTP verify     → AfterShip Go verifier at EMAIL_VERIFIER_URL
 *   6. Persist         → PostgreSQL: companies, contacts, email_verifications
 *   7. Progress        → keep jobs row updated throughout
 */

import { pool }                               from "../db/pool";
import { resolveDomainViaClearbit }           from "./clearbit";
import { scrapeLinkedInEmployees, ScrapedEmployee, matchesRole } from "./apify";
import { generateEmailCandidates, categoriseRole, getSeniorityLevel } from "./emailPatterns";
import { verifyEmail, VerifyEmailResult }     from "./emailVerifier";
import { fetchOneWizaEmail, detectPatternFromEmail, bulkFetchWizaEmails } from "./wiza";

// ── Concurrency guard ─────────────────────────────────────────────────────────

let runningJobs = 0;
const MAX_CONCURRENT = Number(process.env.MAX_CONCURRENT_JOBS ?? 3);

async function waitForSlot(): Promise<void> {
  while (runningJobs >= MAX_CONCURRENT) {
    await new Promise((r) => setTimeout(r, 2_000));
  }
  runningJobs++;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function dedup(contacts: ScrapedEmployee[]): ScrapedEmployee[] {
  const seen = new Set<string>();
  return contacts.filter((c) => {
    const key = c.fullName.toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function updateJob(
  id: string,
  fields: Record<string, unknown>,
): Promise<void> {
  const keys   = Object.keys(fields);
  const values = Object.values(fields);
  const sets   = keys.map((k, i) => `"${k}" = $${i + 2}`).join(", ");
  await pool.query(
    `UPDATE jobs SET ${sets}, updated_at = NOW() WHERE id = $1`,
    [id, ...values],
  );
}

// ── Public entry point ───────────────────────────────────────────────────────

export async function runPipeline(
  jobId:       string,
  companyName: string,
  targetRoles: string[],
  maxContacts: number,
  linkedinCompanyUrl?: string,
): Promise<void> {
  await waitForSlot();
  try {
    await _run(jobId, companyName, targetRoles, maxContacts, linkedinCompanyUrl);
  } catch (err) {
    await updateJob(jobId, { status: "failed", error_message: (err as Error).message }).catch(() => null);
    console.error(`[pipeline] Fatal error for job ${jobId}:`, (err as Error).message);
  } finally {
    runningJobs--;
  }
}

// ── Main pipeline ────────────────────────────────────────────────────────────

async function _run(
  jobId:       string,
  companyName: string,
  targetRoles: string[],
  maxContacts: number,
  linkedinCompanyUrl?: string,
): Promise<void> {
  await updateJob(jobId, { status: "processing" });

  // ── Step 1: Resolve company domain ────────────────────────────────────────
  const domain = await resolveDomainViaClearbit(companyName);

  if (!domain) {
    await updateJob(jobId, { status: "failed", error_message: "Could not resolve company domain" });
    console.warn(`[pipeline] ${companyName}: domain resolution failed`);
    return;
  }
  console.log(`[pipeline] ${companyName} → domain: ${domain}`);

  // ── Step 2: Upsert company in DB ──────────────────────────────────────────
  const companyResult = await pool.query<{ id: string }>(
    `INSERT INTO companies (name, domain)
     VALUES ($1, $2)
     ON CONFLICT (domain) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [companyName, domain],
  );
  const companyId = companyResult.rows[0].id;
  await updateJob(jobId, { company_id: companyId });

  // ── Step 3: Scrape contacts via Apify ────────────────────────────────────
  const fetchLimit = Math.min(maxContacts * 7, 200);
  let employees: ScrapedEmployee[] = [];
  const source = "apify";

  try {
    employees = await scrapeLinkedInEmployees(
      companyName,
      targetRoles,
      maxContacts,
      linkedinCompanyUrl,
    );
  } catch (err) {
    console.warn(`[pipeline] Apify scrape failed:`, (err as Error).message);
  }

  console.log(`[pipeline] ${companyName}: ${employees.length} raw contacts from apify`);

  const allScraped = dedup(employees);
  console.log(`[pipeline] ${companyName}: ${allScraped.length} unique contacts scraped`);

  // Apply smart role filter (handles "Chief Technology Officer" ↔ "CTO", etc.)
  const contacts = (targetRoles.length > 0
    ? allScraped.filter((c) => matchesRole(c.jobTitle, targetRoles))
    : allScraped
  ).slice(0, maxContacts);

  const total = contacts.length;
  console.log(`[pipeline] ${companyName}: ${total} contacts after role filter (of ${allScraped.length} scraped)`);
  await updateJob(jobId, { total_contacts: total });

  if (total === 0) {
    await updateJob(jobId, { status: "completed", progress_percent: 100 });
    return;
  }

  // ── Step 3b: Wiza pattern discovery (fetch ONE reference email) ───────────
  // Pick the first contact that has a LinkedIn URL to use as our pattern probe.
  let domainPattern: string | undefined;
  let probeEmail: string | null = null;
  const probeContact = contacts.find((c) => c.linkedinUrl && c.firstName && c.lastName);
  if (probeContact?.linkedinUrl) {
    probeEmail = await fetchOneWizaEmail(probeContact.linkedinUrl);
    if (probeEmail && probeContact.firstName && probeContact.lastName) {
      const detected = detectPatternFromEmail(probeEmail, probeContact.firstName, probeContact.lastName);
      if (detected) {
        domainPattern = detected;
        console.log(`[pipeline] ${companyName}: Wiza pattern detected → ${domainPattern}`);
      }
    }
  }

  // save probe email reference for pre-seeding after Phase A
  const probeLinkedinUrl = probeContact?.linkedinUrl ?? null;

  // ── Steps 4–6: Insert contacts → round-by-round verify → Wiza fallback ────

  interface ContactRow {
    id:          string;
    firstName:   string;
    lastName:    string;
    linkedinUrl: string | null;
    fullName:    string;
  }

  // ─ Phase A: Insert all contacts, collect IDs ─────────────────────────────
  const contactRows: ContactRow[] = [];

  for (const c of contacts) {
    const contactResult = await pool.query<{ id: string }>(
      `INSERT INTO contacts
         (job_id, company_id, full_name, first_name, last_name, job_title,
          role_category, seniority_level, linkedin_url, location, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [
        jobId, companyId, c.fullName,
        c.firstName || null, c.lastName || null, c.jobTitle || null,
        categoriseRole(c.jobTitle), getSeniorityLevel(c.jobTitle),
        c.linkedinUrl || null, c.location || null, source,
      ],
    );

    let contactId: string;
    if (contactResult.rows.length > 0) {
      contactId = contactResult.rows[0].id;
    } else {
      const existing = await pool.query<{ id: string }>(
        `SELECT id FROM contacts WHERE job_id = $1 AND full_name = $2`,
        [jobId, c.fullName],
      );
      contactId = existing.rows[0]?.id ?? "";
    }

    if (contactId && c.firstName && c.lastName) {
      contactRows.push({
        id: contactId, firstName: c.firstName, lastName: c.lastName,
        linkedinUrl: c.linkedinUrl || null, fullName: c.fullName,
      });
    }
  }

  await updateJob(jobId, { total_contacts: contactRows.length, progress_percent: 10 });

  // ─ Phase B: Round-by-round Bouncify verification ─────────────────────────
  // Round 0 uses the Wiza-detected pattern (highest confidence) for ALL contacts.
  // Round 1 uses pattern[1] only for contacts that didn't get valid/catch_all.
  // ... up to 5 rounds. Confirmed contacts are skipped in later rounds.

  interface BestResult {
    email:   string;
    pattern: string;
    result:  VerifyEmailResult;
  }
  const bestResultMap = new Map<string, BestResult>();

  // If the user only asked for a tiny result set, prioritize Wiza first to save verifier credits.
  const preferWizaFirst = maxContacts <= 2;

  if (preferWizaFirst) {
    const wizaFirstTargets = contactRows
      .filter(row => row.linkedinUrl)
      .map(row => ({ contactId: row.id, linkedinUrl: row.linkedinUrl! }));

    if (wizaFirstTargets.length > 0) {
      console.log(`[pipeline] Wiza-first mode: ${wizaFirstTargets.length} contacts`);
      const wizaEmailMap = await bulkFetchWizaEmails(wizaFirstTargets);

      const wizaVerified = await Promise.all(
        Array.from(wizaEmailMap.entries()).map(async ([contactId, email]) => ({
          contactId,
          email,
          result: await verifyEmail(email),
        })),
      );

      for (const { contactId, email, result } of wizaVerified) {
        const wizaResult: VerifyEmailResult = (
          result.status === "valid" || result.status === "catch_all"
        )
          ? result
          : { ...result, status: "source_provided" as const, confidence: Math.max(result.confidence, 70) };

        const existing = bestResultMap.get(contactId);
        if (!existing || wizaResult.confidence > existing.result.confidence) {
          bestResultMap.set(contactId, { email, pattern: "wiza_first", result: wizaResult });
          console.log(`[pipeline] Wiza-first checked: ${email} (${wizaResult.status})`);
        }
      }
    }
  }

  // Pre-seed probe contact with Wiza-found email, but still verify through Bouncify.
  if (probeEmail && probeLinkedinUrl) {
    const probeRow = contactRows.find(r => r.linkedinUrl === probeLinkedinUrl);
    if (probeRow) {
      const probeVerification = await verifyEmail(probeEmail);
      const probeResult: VerifyEmailResult = (
        probeVerification.status === "valid" || probeVerification.status === "catch_all"
      )
        ? probeVerification
        : { ...probeVerification, status: "source_provided" as const, confidence: Math.max(probeVerification.confidence, 70) };

      bestResultMap.set(probeRow.id, { email: probeEmail, pattern: "wiza_probe", result: probeResult });
      console.log(`[pipeline] Probe email checked: ${probeRow.fullName} -> ${probeEmail} (${probeResult.status})`);
    }
  }

  const maxCandidateRounds = contactRows.reduce((maxRounds, row) => {
    const candidates = generateEmailCandidates(row.firstName, row.lastName, domain, domainPattern);
    return Math.max(maxRounds, candidates.length);
  }, 0);
  const MAX_PATTERN_ROUNDS = Math.max(0, maxCandidateRounds);

  for (let round = 0; round < MAX_PATTERN_ROUNDS; round++) {
    // Only keep contacts not yet confirmed
    const remaining = contactRows.filter(row => {
      const best = bestResultMap.get(row.id);
      if (!best) return true;
      if (best.result.status === "valid" || best.result.status === "catch_all") return false;
      if (preferWizaFirst && best.result.status === "source_provided") return false;
      return true;
    });

    if (remaining.length === 0) break;

    // Pick the round-th candidate for each remaining contact
    const roundTasks = remaining.flatMap(row => {
      const candidates = generateEmailCandidates(row.firstName, row.lastName, domain, domainPattern);
      if (round < candidates.length) {
        return [{ contactId: row.id, email: candidates[round].email, pattern: candidates[round].pattern }];
      }
      return [];
    });

    if (roundTasks.length === 0) break;

    console.log(`[pipeline] Pattern round ${round + 1}/${MAX_PATTERN_ROUNDS}: verifying ${roundTasks.length} emails in parallel`);

    // Verify this round's candidates concurrently (one API call per email)
    const roundResults = await Promise.all(
      roundTasks.map(async task => ({ ...task, result: await verifyEmail(task.email) })),
    );

    for (const { contactId, email, pattern, result } of roundResults) {
      const existing = bestResultMap.get(contactId);
      if (!existing || result.confidence > existing.result.confidence) {
        bestResultMap.set(contactId, { email, pattern, result });
      }
    }

    const confirmedNow = [...bestResultMap.values()]
      .filter(
        b =>
          b.result.status === "valid" ||
          b.result.status === "catch_all",
      ).length;
    console.log(`[pipeline] Round ${round + 1} done: ${confirmedNow}/${contactRows.length} confirmed`);

    const pct = 10 + Math.round(((round + 1) / MAX_PATTERN_ROUNDS) * 55);
    await updateJob(jobId, { progress_percent: Math.min(pct, 65) });

    if (confirmedNow === contactRows.length) break;
  }

  const confirmedAfterBouncify = [...bestResultMap.values()]
    .filter(b => b.result.status === "valid" || b.result.status === "catch_all").length;
  console.log(`[pipeline] After ${MAX_PATTERN_ROUNDS} pattern rounds: ${confirmedAfterBouncify}/${contactRows.length} confirmed`);

  console.log(`[pipeline] Bouncify verification complete: ${confirmedAfterBouncify}/${contactRows.length} confirmed`);


  // ─ Phase C: Wiza fallback — parallel reveals for still-unconfirmed ────────
  const wizaTargets = contactRows
    .filter(row => {
      const best = bestResultMap.get(row.id);
      if (!row.linkedinUrl) return false;
      if (best && (best.result.status === "valid" || best.result.status === "catch_all")) return false;
      if (preferWizaFirst && best?.result.status === "source_provided") return false;
      return true;
    })
    .map(row => ({ contactId: row.id, linkedinUrl: row.linkedinUrl! }));

  if (wizaTargets.length > 0) {
    console.log(`[pipeline] ${wizaTargets.length} contacts need Wiza fallback — running bulk reveal (may take up to 7 min)`);
    const wizaEmailMap = await bulkFetchWizaEmails(wizaTargets);

    // Re-verify Wiza fallback emails with Bouncify before marking confirmed.
    const wizaVerified = await Promise.all(
      Array.from(wizaEmailMap.entries()).map(async ([contactId, email]) => ({
        contactId,
        email,
        result: await verifyEmail(email),
      })),
    );

    for (const { contactId, email, result } of wizaVerified) {
      const wizaResult: VerifyEmailResult = (
        result.status === "valid" || result.status === "catch_all"
      )
        ? result
        : { ...result, status: "source_provided" as const, confidence: Math.max(result.confidence, 70) };

      const existing = bestResultMap.get(contactId);
      if (!existing || wizaResult.confidence > existing.result.confidence) {
        bestResultMap.set(contactId, { email, pattern: "wiza_direct", result: wizaResult });
        console.log(`[pipeline] Wiza fallback checked: ${email} (${wizaResult.status})`);
      }
    }
  }

  await updateJob(jobId, { progress_percent: 85 });

  // ─ Phase D: Persist all best results ─────────────────────────────────────
  let processed = 0;
  let verified  = 0;

  for (const row of contactRows) {
    const best = bestResultMap.get(row.id);
    if (best) {
      await pool.query(
        `INSERT INTO email_verifications
           (contact_id, email, pattern_used, verification_status,
            is_reachable, has_mx_records, is_disposable, is_role_account,
            is_free, confidence_score, smtp_response, verified_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())
         ON CONFLICT (contact_id, email) DO NOTHING`,
        [
          row.id, best.email, best.pattern, best.result.status,
          (best.result.status === "valid" || best.result.status === "catch_all") ? "yes" : "unknown",
          best.result.hasMxRecords, best.result.isDisposable,
          best.result.isRoleAccount, best.result.isFree,
          best.result.confidence, best.result.smtpResponse || null,
        ],
      );

      if (best.result.status === "valid" || best.result.status === "catch_all") {
        verified++;
      }
    }
    processed++;
  }

  await updateJob(jobId, {
    status:             "completed",
    progress_percent:   100,
    processed_contacts: processed,
    verified_emails:    verified,
  });

  console.log(`[pipeline] Job ${jobId} done — ${processed} contacts, ${verified} verified`);
}

