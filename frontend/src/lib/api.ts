const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const KEY  = process.env.NEXT_PUBLIC_API_KEY  ?? "dev-api-key-change-in-production";

const headers = () => ({
  "Content-Type": "application/json",
  "X-API-Key": KEY,
});

// -- Types ---------------------------------------------------------------------

export interface JobStatus {
  job_id: string;
  status: "queued" | "processing" | "completed" | "failed";
  company_name: string;
  company_id?: string | null;
  total_contacts: number;
  processed_contacts: number;
  verified_emails: number;
  progress_percent: number;
  error_message?: string | null;
  created_at?: string;
}

export interface Lead {
  id: string;
  name: string;
  first_name?: string | null;
  last_name?: string | null;
  title?: string | null;
  role_category?: string | null;
  seniority?: string | null;
  linkedin_url?: string | null;
  location?: string | null;
  company: string;
  domain?: string | null;
  email?: string | null;
  email_status?: string | null;
  confidence?: number | null;
}

export interface SearchResponse {
  job_id: string;
  status: string;
  company_name: string;
  cached?: boolean;
}

export interface ResultsResponse {
  job_id: string;
  count: number;
  contacts: Lead[];
}

// -- API calls -----------------------------------------------------------------

export async function startSearch(
  companyName: string,
  roles: string[],
  maxContacts = 15,
  linkedinCompanyUrl?: string,
): Promise<SearchResponse> {
  const res = await fetch(`${BASE}/api/search`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      company_name: companyName,
      linkedin_company_url: linkedinCompanyUrl,
      roles,
      max_contacts: maxContacts,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Search failed (${res.status}): ${err}`);
  }
  return res.json();
}

export async function pollJob(jobId: string): Promise<JobStatus> {
  const res = await fetch(`${BASE}/api/search/${jobId}`, { headers: headers() });
  if (!res.ok) throw new Error(`Poll failed (${res.status})`);
  return res.json();
}

export async function getResults(jobId: string): Promise<ResultsResponse> {
  const res = await fetch(`${BASE}/api/search/${jobId}/results`, { headers: headers() });
  if (!res.ok) throw new Error(`Results failed (${res.status})`);
  return res.json();
}

export function getExportUrl(jobId: string): string {
  return `${BASE}/api/search/${jobId}/export?api_key=${KEY}`;
}

// -- PRD analysis --------------------------------------------------------------

export interface PrdAnalysisResult {
  document_name: string;
  requirements_summary: string;
  suggested_roles: string[];
  job_titles: string[];
  skills: string[];
  seniority_level: string;
}

export async function analyzePrd(file: File): Promise<PrdAnalysisResult> {
  const form = new FormData();
  form.append("file", file);

  const res = await fetch(`${BASE}/api/analyze-prd`, {
    method: "POST",
    headers: { "X-API-Key": KEY },   // no Content-Type – browser sets multipart boundary
    body: form,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`PRD analysis failed (${res.status}): ${err}`);
  }
  return res.json();
}
