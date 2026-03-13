/**
 * PRD / Document analyzer.
 *
 * Sends extracted document text to FastRouter (OpenAI-compatible API) and
 * returns structured suggestions: roles to search, skills, seniority, summary.
 */
import axios from "axios";
import { config } from "../config";

export interface PrdAnalysisResult {
  requirements_summary: string;
  suggested_roles: string[];
  job_titles: string[];
  skills: string[];
  seniority_level: string;
}

const SYSTEM_PROMPT = `You are a senior talent acquisition specialist.
Analyze the given document (which may be a PRD, job description, company brief, or requirements doc)
and identify the type of people who would be relevant to hire or contact.

Return ONLY valid JSON with these exact keys:
- requirements_summary: 1-2 sentence summary of what kind of person is needed
- suggested_roles: array of role category names to filter by (choose from: "CEO", "CTO", "CFO", "COO", "CISO", "VP Engineering", "VP Product", "VP Sales", "Vice President", "Director", "Engineering Manager", "Head of Engineering", "Head of Product")
- job_titles: array of specific LinkedIn job title keywords to look for (3-8 items)
- skills: array of key technical/business skills mentioned (3-10 items)
- seniority_level: one of "executive", "senior", "mid", "any"`;

export async function analyzePrdText(documentText: string): Promise<PrdAnalysisResult> {
  if (!config.fastrouter.apiKey) {
    throw new Error("FASTROUTER_API_KEY is not configured");
  }

  // Truncate to avoid token limits (gpt-4o-mini handles ~16k tokens)
  const truncated = documentText.substring(0, 12_000);

  const response = await axios.post(
    `${config.fastrouter.baseUrl}/chat/completions`,
    {
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Analyze this document and return JSON:\n\n${truncated}` },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
      max_tokens: 800,
    },
    {
      headers: {
        Authorization: `Bearer ${config.fastrouter.apiKey}`,
        "Content-Type": "application/json",
      },
      timeout: 30_000,
    },
  );

  const content: string = response.data.choices[0].message.content;
  const parsed = JSON.parse(content) as PrdAnalysisResult;

  // Ensure arrays are arrays
  return {
    requirements_summary: parsed.requirements_summary ?? "",
    suggested_roles:      Array.isArray(parsed.suggested_roles) ? parsed.suggested_roles : [],
    job_titles:           Array.isArray(parsed.job_titles)       ? parsed.job_titles       : [],
    skills:               Array.isArray(parsed.skills)           ? parsed.skills           : [],
    seniority_level:      parsed.seniority_level ?? "any",
  };
}
