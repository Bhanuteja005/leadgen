/**
 * Email pattern generator.
 *
 * Given a person's name and their company domain (plus an optional Hunter.io
 * preferred pattern), returns an ordered list of email candidates.
 *
 * Patterns ranked by likelihood for typical B2B domains.
 */

// Hunter.io pattern tokens → local-part template
const HUNTER_PATTERN_MAP: Record<string, string> = {
  "{first}":           "{first}",
  "{first}.{last}":    "{first}.{last}",
  "{f}{last}":         "{f}{last}",
  "{first}{last}":     "{first}{last}",
  "{first}_{last}":    "{first}_{last}",
  "{f}.{last}":        "{f}.{last}",
  "{last}":            "{last}",
  "{last}.{first}":    "{last}.{first}",
  "{last}{first}":     "{last}{first}",
  "{last}{f}":         "{last}{f}",
  // Hunter short codes
  "first":             "{first}",
  "first.last":        "{first}.{last}",
  "flast":             "{f}{last}",
  "firstlast":         "{first}{last}",
  "first_last":        "{first}_{last}",
  "f.last":            "{f}.{last}",
  "last":              "{last}",
  "last.first":        "{last}.{first}",
};

/**
 * Ordered list of patterns to try when no preferred pattern is known.
 * Includes common corporate variants to improve coverage before Wiza fallback.
 */
const DEFAULT_PATTERNS = [
  // Most common corporate formats
  "{first}.{last}",
  "{first}_{last}",
  "{first}-{last}",
  "{f}{last}",
  "{f}.{last}",
  "{f}_{last}",
  "{f}-{last}",
  "{first}{last}",
  "{last}.{first}",
  "{last}_{first}",
  "{last}-{first}",
  "{last}{first}",

  // Initial-based patterns
  "{first}.{l}",
  "{first}_{l}",
  "{first}-{l}",
  "{first}{l}",
  "{f}.{l}",
  "{f}_{l}",
  "{f}-{l}",
  "{fl}",
  "{lf}",
  "{l}{first}",
  "{l}.{first}",
  "{l}_{first}",
  "{l}-{first}",
  "{last}{f}",
  "{last}.{f}",
  "{last}_{f}",
  "{last}-{f}",

  // Single-name / condensed
  "{first}",
  "{last}",
  "{first}{last2}",
  "{first}.{last2}",
  "{f}{last2}",
  "{first}{last3}",
  "{f}{last3}",
  "{first2}{last}",
  "{first3}{last}",
];

function normalise(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function replaceToken(input: string, token: string, value: string): string {
  return input.split(token).join(value);
}

function applyPattern(template: string, first: string, last: string): string {
  const f  = normalise(first);
  const l  = normalise(last);
  const fi = f.charAt(0);
  const li = l.charAt(0);
  const first2 = f.slice(0, 2);
  const first3 = f.slice(0, 3);
  const last2 = l.slice(0, 2);
  const last3 = l.slice(0, 3);
  let local = template;
  local = replaceToken(local, "{first}", f);
  local = replaceToken(local, "{last}", l);
  local = replaceToken(local, "{f}", fi);
  local = replaceToken(local, "{l}", li);
  local = replaceToken(local, "{first2}", first2);
  local = replaceToken(local, "{first3}", first3);
  local = replaceToken(local, "{last2}", last2);
  local = replaceToken(local, "{last3}", last3);
  local = replaceToken(local, "{fl}", `${fi}${li}`);
  local = replaceToken(local, "{lf}", `${li}${fi}`);
  return local;
}

export function generateEmailCandidates(
  firstName: string,
  lastName:  string,
  domain:    string,
  preferredPattern?: string,
): Array<{ email: string; pattern: string }> {
  const candidates: Array<{ email: string; pattern: string }> = [];
  const seen = new Set<string>();

  const add = (template: string) => {
    const local = applyPattern(template, firstName, lastName);
    if (!local || local.length < 2) return;          // skip empty
    const email = `${local}@${domain}`;
    if (!seen.has(email)) {
      seen.add(email);
      candidates.push({ email, pattern: template });
    }
  };

  // Put the preferred pattern first
  if (preferredPattern) {
    const mapped = HUNTER_PATTERN_MAP[preferredPattern] ?? preferredPattern;
    add(mapped);
  }

  for (const p of DEFAULT_PATTERNS) {
    add(p);
  }

  return candidates;
}

// ── Role categorisation ───────────────────────────────────────────────────────

export function categoriseRole(jobTitle: string): string {
  const t = jobTitle.toLowerCase();
  if (/\b(cto|chief tech|vp.*eng|vp.*tech|director.*eng|head.*eng|staff.*eng)\b/.test(t)) return "Engineering Leadership";
  if (/\b(ceo|chief exec|president|founder|co-founder)\b/.test(t))                         return "C-Suite";
  if (/\b(coo|chief operat|vp.*operat|director.*operat)\b/.test(t))                         return "Operations";
  if (/\b(cmo|chief market|vp.*market|director.*market|head.*market)\b/.test(t))            return "Marketing Leadership";
  if (/\b(cfo|chief financ|vp.*financ|director.*financ)\b/.test(t))                         return "Finance Leadership";
  if (/\b(ciso|cso|chief sec|vp.*sec|director.*sec|head.*sec)\b/.test(t))                   return "Security Leadership";
  if (/\b(cpo|chief prod|vp.*prod|director.*prod|head.*prod|pmo|product.*manag|program.*manag)\b/.test(t)) return "Product Leadership";
  if (/\b(cro|chief rev|vp.*sales|director.*sales|head.*sales)\b/.test(t))                  return "Sales Leadership";
  if (/\b(cxo|chief exp|vp.*customer|director.*customer|head.*customer)\b/.test(t))        return "Customer Success";
  if (/\b(manager|lead)\b/.test(t))  return "Management";
  if (/\b(engineer|developer|architect|devops|sre)\b/.test(t)) return "Engineering";
  if (/\b(analyst|data|scientist)\b/.test(t))   return "Analytics";
  if (/\b(designer|ux|ui)\b/.test(t))           return "Design";
  return "Other";
}

export function getSeniorityLevel(jobTitle: string): string {
  const t = jobTitle.toLowerCase();
  if (/\b(chief|c[a-z]o)\b/.test(t))                            return "C-Level";
  if (/\bvp\b|vice president/.test(t))                          return "VP";
  if (/\bdirector\b/.test(t))                                   return "Director";
  if (/\bhead of\b/.test(t))                                    return "Head";
  if (/\bmanager\b/.test(t))                                    return "Manager";
  if (/\blead\b/.test(t))                                       return "Lead";
  if (/\b(senior|staff|principal|sr\.)\b/.test(t))              return "Senior";
  return "Individual Contributor";
}
