/**
 * Wiza API — email discovery for LinkedIn profiles.
 *
 * Two public functions:
 *   fetchOneWizaEmail(url)           - single profile (for pattern probe)
 *   bulkFetchWizaEmails(targets)     - parallel reveals for many profiles
 *
 * Wiza flow (2-step):
 *   1. POST /individual_reveals  -> start reveal, get { data: { id } }
 *   2. GET  /individual_reveals/:id -> poll until status "complete" or "failed"
 */

import axios from "axios";
import { config } from "../config";

const WIZA_BASE        = "https://wiza.co/api";
const POLL_INTERVAL_MS = 5_000;
const SINGLE_MAX_POLLS = 75;     // 75 x 5s = 375s (~6 min) — Wiza docs say up to 380s
const BULK_TIMEOUT_MS  = 420_000; // 7 min total for bulk reveals

interface WizaEmail {
  email:        string;
  email_type:   string;  // "work" | "personal"
  email_status: string;  // "valid" | "invalid" | "unknown"
}

interface WizaRevealData {
  id:      number;
  status:  string;  // "pending" | "complete" | "failed"
  emails?: WizaEmail[];
}

interface WizaRevealResponse {
  data?: WizaRevealData;
}

// -- Pattern detection -------------------------------------------------------

export function detectPatternFromEmail(
  email: string,
  firstName: string,
  lastName: string,
): string | null {
  const local = email.split("@")[0].toLowerCase();
  const first = firstName.toLowerCase().replace(/[^a-z]/g, "");
  const last  = lastName.toLowerCase().replace(/[^a-z]/g, "");
  const f     = first.charAt(0);

  const candidates = [
    { pattern: "{first}.{last}", value: `${first}.${last}` },
    { pattern: "{first}{last}",  value: `${first}${last}`  },
    { pattern: "{first}_{last}", value: `${first}_${last}` },
    { pattern: "{f}.{last}",     value: `${f}.${last}`     },
    { pattern: "{f}{last}",      value: `${f}${last}`      },
    { pattern: "{last}.{first}", value: `${last}.${first}` },
    { pattern: "{last}{first}",  value: `${last}${first}`  },
    { pattern: "{last}{f}",      value: `${last}${f}`      },
    { pattern: "{first}",        value: first               },
    { pattern: "{last}",         value: last                },
  ];

  for (const { pattern, value } of candidates) {
    if (local === value) return pattern;
  }
  return null;
}

// -- Low-level API helpers ---------------------------------------------------

async function startReveal(linkedinUrl: string): Promise<number | null> {
  try {
    const res = await axios.post<WizaRevealResponse>(
      `${WIZA_BASE}/individual_reveals`,
      {
        individual_reveal: { profile_url: linkedinUrl },
        enrichment_level:  "partial",
        email_options:     { accept_work: true, accept_personal: false },
      },
      {
        headers: {
          Authorization:  `Bearer ${config.wiza.apiKey}`,
          "Content-Type": "application/json",
        },
        timeout: 12_000,
      },
    );
    return res.data?.data?.id ?? null;
  } catch (err) {
    console.warn("[wiza] startReveal failed:", (err as Error).message);
    return null;
  }
}

async function getReveal(revealId: number): Promise<WizaRevealData | null> {
  try {
    const res = await axios.get<WizaRevealResponse>(
      `${WIZA_BASE}/individual_reveals/${revealId}`,
      {
        headers: { Authorization: `Bearer ${config.wiza.apiKey}` },
        timeout: 8_000,
      },
    );
    return res.data?.data ?? null;
  } catch {
    return null;
  }
}

function pickBestEmail(emails: WizaEmail[]): string | null {
  const work = emails.find(e => e.email_type === "work" && e.email_status !== "invalid");
  return (work ?? emails[0])?.email ?? null;
}

// -- Single-profile fetch (for initial pattern probe) -----------------------

export async function fetchOneWizaEmail(linkedinUrl: string): Promise<string | null> {
  if (!config.wiza.apiKey) {
    console.warn("[wiza] WIZA_API_KEY not set -- skipping");
    return null;
  }

  console.log(`[wiza] Starting reveal for ${linkedinUrl}`);
  const revealId = await startReveal(linkedinUrl);
  if (!revealId) return null;

  for (let i = 0; i < SINGLE_MAX_POLLS; i++) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    const reveal = await getReveal(revealId);
    if (!reveal) continue;
    if (reveal.status === "finished" || reveal.status === "complete") {
      const email = pickBestEmail(reveal.emails ?? []);
      if (email) console.log(`[wiza] Got reference email: ${email}`);
      else       console.warn("[wiza] Reveal finished but no emails found for this profile");
      return email;
    }
    if (reveal.status === "failed" || reveal.status === "error") {
      console.warn(`[wiza] Reveal status: ${reveal.status}`);
      return null;
    }
  }
  console.warn(`[wiza] pollReveal timed out after ${(SINGLE_MAX_POLLS * POLL_INTERVAL_MS) / 1000}s`);
  return null;
}

// -- Bulk fetch (parallel reveals for multiple contacts) --------------------

/**
 * Start reveals for ALL targets in parallel, then poll them all concurrently
 * within a shared BULK_TIMEOUT_MS window.
 * Returns Map<contactId, email>.
 */
export async function bulkFetchWizaEmails(
  targets: Array<{ contactId: string; linkedinUrl: string }>,
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (!config.wiza.apiKey || targets.length === 0) return result;

  console.log(`[wiza] Starting ${targets.length} reveals in parallel...`);

  // Step 1: start all reveals concurrently
  const started = await Promise.all(
    targets.map(async t => ({
      contactId:  t.contactId,
      linkedinUrl: t.linkedinUrl,
      revealId:   await startReveal(t.linkedinUrl),
    })),
  );

  const pending = started.filter(s => s.revealId !== null) as Array<{
    contactId:   string;
    linkedinUrl: string;
    revealId:    number;
  }>;

  console.log(`[wiza] ${pending.length}/${targets.length} reveals started`);
  if (pending.length === 0) return result;

  // Step 2: poll all concurrently until all done or shared timeout
  const done     = new Set<string>();
  const deadline = Date.now() + BULK_TIMEOUT_MS;

  while (done.size < pending.length && Date.now() < deadline) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));

    await Promise.all(
      pending
        .filter(p => !done.has(p.contactId))
        .map(async p => {
          const reveal = await getReveal(p.revealId);
          if (!reveal) return;

          if (reveal.status === "finished" || reveal.status === "complete") {
            done.add(p.contactId);
            const email = pickBestEmail(reveal.emails ?? []);
            if (email) {
              result.set(p.contactId, email);
              console.log(`[wiza] ${p.contactId} -> ${email}`);
            }
          } else if (reveal.status === "failed" || reveal.status === "error") {
            done.add(p.contactId);
          }
        }),
    );
  }

  if (done.size < pending.length) {
    console.warn(`[wiza] Bulk timeout: ${done.size}/${pending.length} reveals completed in ${BULK_TIMEOUT_MS / 1000}s`);
  }
  console.log(`[wiza] Bulk done: ${result.size}/${targets.length} emails found`);
  return result;
}