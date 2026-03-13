/**
 * Clearbit Autocomplete – free, no API key required.
 * Resolves a company name to its primary domain.
 * https://autocomplete.clearbit.com/v1/companies/suggest?query={name}
 */
import axios from "axios";

interface ClearbitCompany {
  name: string;
  domain: string;
  logo: string;
}

/**
 * Hard-coded domain overrides for companies where Clearbit returns a
 * marketing/product domain instead of the corporate email domain.
 * Keys are lowercase company name substrings.
 */
const DOMAIN_OVERRIDES: Record<string, string> = {
  microsoft:    "microsoft.com",
  amazon:       "amazon.com",
  google:       "google.com",
  apple:        "apple.com",
  meta:         "fb.com",
  facebook:     "fb.com",
  netflix:      "netflix.com",
  salesforce:   "salesforce.com",
  oracle:       "oracle.com",
  ibm:          "ibm.com",
  intel:        "intel.com",
  adobe:        "adobe.com",
  twitter:      "twitter.com",
  "x.com":      "x.com",
  linkedin:     "linkedin.com",
  uber:         "uber.com",
  airbnb:       "airbnb.com",
  spotify:      "spotify.com",
  tesla:        "tesla.com",
  nvidia:       "nvidia.com",
};

/** Naive name-similarity score: count matching words (case-insensitive). */
function nameSimilarity(query: string, candidate: string): number {
  const qWords = query.toLowerCase().split(/\s+/);
  const cLower = candidate.toLowerCase();
  return qWords.filter((w) => cLower.includes(w)).length;
}

export async function resolveDomainViaClearbit(
  companyName: string,
): Promise<string | null> {
  // Check hard-coded overrides first (covers big companies where Clearbit is wrong)
  const nameLower = companyName.toLowerCase().trim();
  for (const [key, domain] of Object.entries(DOMAIN_OVERRIDES)) {
    if (nameLower.includes(key)) {
      console.log(`[clearbit] Override: ${companyName} → ${domain}`);
      return domain;
    }
  }

  try {
    const res = await axios.get<ClearbitCompany[]>(
      "https://autocomplete.clearbit.com/v1/companies/suggest",
      { params: { query: companyName }, timeout: 8000 },
    );
    if (res.data.length === 0) return null;

    // Pick the result whose name best matches the query,
    // breaking ties by position (earlier = more relevant per Clearbit).
    let best = res.data[0];
    let bestScore = nameSimilarity(companyName, best.name);

    for (const company of res.data.slice(1)) {
      const score = nameSimilarity(companyName, company.name);
      if (score > bestScore) {
        bestScore = score;
        best      = company;
      }
    }

    return best.domain ?? null;
  } catch {
    return null;
  }
}
