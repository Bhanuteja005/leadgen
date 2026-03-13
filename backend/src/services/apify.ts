/**
 * Apify LinkedIn scraping service.
 *
 * Primary actor: harvestapi~linkedin-company-employees
 *   Input:  { url: "https://linkedin.com/company/<slug>/people/", maxItems: N }
 *   Output: [{ name, title, location, profileUrl }]
 *
 * If a resolved LinkedIn company URL is passed in (from Apollo enrichment)
 * it is used directly; otherwise we construct candidate slug URLs from the
 * company name and try the most likely one.
 */
import { ApifyClient } from "apify-client";
import { config } from "../config";
import "proxy-agent"; // Force Vercel's ncc to trace and bundle this dependency

export interface ScrapedEmployee {
  fullName: string;
  firstName: string;
  lastName: string;
  jobTitle: string;
  location: string;
  linkedinUrl: string;
}

//  helpers 

/**
 * Build candidate LinkedIn company slugs from a company name.
 * Tries the most common slug patterns first, then falls back to suffix variants.
 *
 * LinkedIn slugs are typically lowercase, hyphenated.
 * Many companies (especially Indian tech firms) register with "-technologies",
 * "-tech", or "-inc" appended even when their display name is shorter.
 *
 * Examples:
 *   "Juspay"           ["juspay", "juspay-technologies", "juspay-tech", ...]
 *   "Google LLC"       ["google", "google-llc"]
 *   "Stripe"           ["stripe", "stripe-inc", ...]
 */
function buildLinkedInSlugs(name: string): string[] {
  const base = name.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();

  // Version with legal suffix stripped (e.g. "Juspay Technologies"  "juspay")
  const stripped = base
    .replace(
      /\s+(inc|llc|ltd|corp|corporation|limited|co|group|holdings?|technologies?|tech|solutions?|services?|global|international|worldwide)\s*$/i,
      "",
    )
    .trim()
    .replace(/\s+/g, "-");

  // Version with full name hyphenated (e.g. "Google LLC"  "google-llc")
  const full = base.replace(/\s+/g, "-");

  // Additional suffix variants  covers companies like "Juspay Technologies" that
  // register as "juspay-technologies" even when searched by short name "Juspay"
  const TECH_SUFFIXES = ["technologies", "tech", "inc", "solutions", "labs", "ai", "group"];
  const withSuffixes = stripped.includes("-")
    ? [] // already multi-word; don't append more suffixes
    : TECH_SUFFIXES.map((s) => `${stripped}-${s}`);

  // Deduplicate while preserving priority order
  return [...new Set([stripped, full, ...withSuffixes])].filter(Boolean);
}

/**
 * Extract the slug portion from a full LinkedIn company URL.
 * https://www.linkedin.com/company/google/   "google"
 * https://www.linkedin.com/company/google/people/  "google"
 */
function extractSlugFromUrl(url: string): string | null {
  const m = url.match(/linkedin\.com\/company\/([^/]+)/);
  return m ? m[1] : null;
}

/**
 * Strip credential suffixes, emoji, and honorary degrees from a name segment.
 * Examples:
 *   "DeRouen, MD, CPHRM  Digital Health"  "DeRouen"
 *   "Castro, MD, MBA."  "Castro"
 *   "Rodman, M.Sc. PMP"  "Rodman"
 */
function cleanName(s: string): string {
  return s
    .replace(/,.*$/g, "")              // strip everything after first comma (credentials)
    .replace(/\s+(MD|PhD|MBA|MSc|M\.Sc\.|MFA|JD|DO|DDS|RN|NP|PE|CPA|CFA|PMP|LSSBB|CSM|CSPO)[\s.,].*$/gi, "") // strip degree suffixes
    .replace(/[^\w\s''-]/g, "")        // strip emoji and special characters
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Split "John Smith" or "Smith, John" into { first, last } */
function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: "" };
  if (full.includes(",")) {
    const [last, ...rest] = full.split(",");
    return { first: rest.join(" ").trim(), last: last.trim() };
  }
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

/** Normalise a raw Apify dataset item into ScrapedEmployee.
 *
 * harvestapi~linkedin-company-employees schema (confirmed from live run):
 *   { firstName, lastName, headline (= job title), linkedinUrl, location }
 *
 * Fallback field names are kept for other actor variants.
 */
function normalise(item: Record<string, unknown>): ScrapedEmployee | null {
  // Clean credential suffixes from API-returned name parts (e.g. "DeRouen, MD, CPHRM ")
  const firstName = cleanName((item.firstName as string) || "");
  const lastName  = cleanName((item.lastName  as string) || "");

  // Build full name: prefer explicit first+last, fallback to combined fields
  const rawName =
    (firstName || lastName)
      ? `${firstName} ${lastName}`.trim()
      : ((item.name as string) || (item.fullName as string) || (item.full_name as string) || "").trim();

  if (!rawName) return null;

  // Re-split only when we had a combined-name source (no first/last available)
  const nameParts = (firstName || lastName)
    ? { first: firstName, last: lastName }
    : splitName(rawName);

  // Extract clean job title.
  // Priority: 1) experience[0].position (clean title from LinkedIn)
  //           2) headline parsed before " at " / " | " (removes company/description)
  //           3) other fallback fields
  let jobTitle = "";
  const expArray = Array.isArray(item.experience) ? item.experience : [];
  if (expArray.length > 0) {
    jobTitle = ((expArray[0] as Record<string, unknown>).position as string || "").trim();
  }
  if (!jobTitle) {
    const raw = ((item.headline as string) || (item.title as string) || (item.jobTitle as string) || (item.job_title as string) || "").trim();
    // Strip the " at Company | description" portion that LinkedIn appends to headlines
    jobTitle = raw.split(/ at (?=[A-Z])/)[0].split(" | ")[0].trim();
  }

  // location may be a plain string or a nested object
  let location = "";
  if (typeof item.location === "string") {
    location = item.location;
  } else if (item.location && typeof item.location === "object") {
    const loc = item.location as Record<string, unknown>;
    location = (loc.defaultLocalizedName as string) || (loc.name as string) || "";
  }

  return {
    fullName:    rawName,
    firstName:   nameParts.first,
    lastName:    nameParts.last,
    jobTitle,
    location,
    linkedinUrl:
      (item.linkedinUrl     as string) ||
      (item.profileUrl      as string) ||
      (item.linkedin_url    as string) ||
      (item.publicProfileUrl as string) || "",
  };
}

/**
 * Expanded keyword map: maps frontend display-role names to all substrings
 * that can appear inside real LinkedIn job titles.
 */
const ROLE_KEYWORD_MAP: Record<string, string[]> = {
  "ceo":                      ["ceo", "chief executive"],
  "cto":                      ["cto", "chief technology", "chief tech", "chief technical"],
  "cfo":                      ["cfo", "chief financial", "chief finance"],
  "cmo":                      ["cmo", "chief marketing"],
  "coo":                      ["coo", "chief operat"],
  "ciso":                     ["ciso", "chief information security", "chief security"],
  "vp engineering":           ["vp engineering", "vp of engineering", "vice president engineering", "vice president of engineering"],
  "vp product":               ["vp product", "vp of product", "vice president product", "vice president of product"],
  "vp sales":                 ["vp sales", "vp of sales", "vice president sales", "vice president of sales"],
  "vp marketing":             ["vp marketing", "vp of marketing", "vice president marketing", "vice president of marketing"],
  "vp operations":            ["vp operations", "vp of operations", "vice president operations", "vice president of operations"],
  "vice president":           ["vice president", "vp "],
  "director of engineering":  ["director of engineering", "engineering director"],
  "director of product":      ["director of product", "product director"],
  "director of sales":        ["director of sales", "sales director"],
  "director of marketing":    ["director of marketing", "marketing director"],
  "director":                 ["director"],
  "engineering manager":      ["engineering manager", "manager of engineering", "manager, engineering"],
  "product manager":          ["product manager"],
  "head of engineering":      ["head of engineering", "head, engineering"],
  "head of product":          ["head of product", "head, product"],
  "head of growth":           ["head of growth"],
  "head of sales":            ["head of sales"],
  "software engineer":        ["software engineer"],
  "senior software engineer": ["senior software engineer", "sr. software engineer"],
  "staff engineer":           ["staff engineer"],
  "principal engineer":       ["principal engineer"],
};

/** Expand a role display name into all matching substrings for title matching. */
function expandRoleKeywords(role: string): string[] {
  return ROLE_KEYWORD_MAP[role.toLowerCase()] ?? [role.toLowerCase()];
}

/** Check whether a job title matches any of the caller-supplied role keywords (smart matching). */
export function matchesRole(jobTitle: string, roles: string[]): boolean {
  if (roles.length === 0) return true;
  const t = jobTitle.toLowerCase();
  return roles.some((r) =>
    expandRoleKeywords(r).some((kw) => {
      // Short acronyms (2-4 lowercase letters, e.g. "cto", "ceo", "vp") must match
      // as whole words to avoid false substring matches (e.g. "cto" inside "director").
      if (/^[a-z]{2,4}$/.test(kw)) {
        return new RegExp(`\\b${kw}\\b`).test(t);
      }
      return t.includes(kw);
    }),
  );
}

//  main export 

export async function scrapeLinkedInEmployees(
  companyName: string,
  targetRoles: string[],
  maxItems: number,
  /** Optional: LinkedIn company URL obtained from Apollo enrichment */
  resolvedLinkedInUrl?: string,
): Promise<ScrapedEmployee[]> {
  if (!config.apify.apiKey) {
    console.warn("[apify] APIFY_API_KEY not set  skipping LinkedIn scrape");
    return [];
  }

  const client  = new ApifyClient({ token: config.apify.apiKey });
  const actorId = config.apify.actorId;

  // Always fetch a large pool so that role-filtering (done in the pipeline)
  // has enough candidates. Use at least 100 so narrow-role searches don't starve.
  const fetchLimit = Math.min(Math.max(maxItems * 10, 100), 200);

  //  Build ordered list of slug candidates to try 
  let slugCandidates: string[];

  if (resolvedLinkedInUrl) {
    // Use slug from Apollo-resolved URL (most reliable  only one candidate)
    const slug = extractSlugFromUrl(resolvedLinkedInUrl);
    slugCandidates = slug ? [slug] : [];
    if (!slug) {
      // The full URL itself can be used directly
      const employees = await runActorForUrl(
        client, actorId, resolvedLinkedInUrl.replace(/\/?$/, "/people/"), fetchLimit, companyName,
      );
      console.log(`[apify] Fetched ${employees.length} raw profiles for "${companyName}"`);
      return employees;
    }
  } else {
    // Derive from company name: try up to 3 most-likely variants
    slugCandidates = buildLinkedInSlugs(companyName).slice(0, 3);
  }

  //  Try each slug until we get results 
  for (const slug of slugCandidates) {
    const peopleUrl = `https://www.linkedin.com/company/${slug}/people/`;
    console.log(`[apify] Trying slug "${slug}"  ${peopleUrl}`);
    const employees = await runActorForUrl(client, actorId, peopleUrl, fetchLimit, companyName);
    if (employees.length > 0) {
      console.log(`[apify] Fetched ${employees.length} raw profiles for "${companyName}" (slug="${slug}")`);
      return employees;
    }
    console.log(`[apify] Slug "${slug}" returned 0 profiles  trying next variant`);
  }

  console.warn(`[apify] All slug variants exhausted for "${companyName}"  0 profiles found`);
  return [];
}

/** Run the actor for one URL and return normalised employees (empty = not found). */
async function runActorForUrl(
  client: ApifyClient,
  actorId: string,
  peopleUrl: string,
  fetchLimit: number,
  companyName: string,
): Promise<ScrapedEmployee[]> {
  // Do NOT pass a proxy config  harvestapi manages its own residential proxies.
  const input: Record<string, unknown> = {
    companies: [peopleUrl],
    maxItems:  fetchLimit,
  };

  let run;
  try {
    run = await client.actor(actorId).call(input, { waitSecs: 600 });
  } catch (err) {
    console.error("[apify] Actor call failed:", (err as Error).message);
    return [];
  }

  if (!run?.defaultDatasetId) return [];

  const { items } = await client
    .dataset(run.defaultDatasetId)
    .listItems({ limit: fetchLimit });

  console.log(`[apify] Dataset has ${items.length} raw items for "${companyName}" at ${peopleUrl}`);
  if (items.length > 0) {
    console.log(`[apify] Sample item keys:`, Object.keys(items[0] as object).join(", "));
  }

  const employees: ScrapedEmployee[] = [];
  for (const item of items) {
    const emp = normalise(item as Record<string, unknown>);
    if (emp) employees.push(emp);
  }
  return employees;
}
import 'proxy-agent';

