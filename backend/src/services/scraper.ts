/**
 * Client for the local Python Playwright scraper microservice.
 *
 * The scraper service exposes:
 *   POST /scrape/sync  { company_name: string; max_items: number }
 *                   → { total: number; employees: PythonEmployee[] }
 *
 * This module normalises the Python response shape into the same
 * ScrapedEmployee interface used by the Apify service so that the rest
 * of the pipeline needs no changes.
 */

import axios from "axios";
import type { ScrapedEmployee } from "./apify";

interface PythonEmployee {
  full_name:    string;
  first_name:   string;
  last_name:    string;
  title:        string;
  linkedin_url: string;
  location:     string;
}

export async function scrapeViaLocalScraper(
  scraperUrl: string,
  companyName: string,
  maxItems: number,
): Promise<ScrapedEmployee[]> {
  const res = await axios.post<{ total: number; employees: PythonEmployee[] }>(
    `${scraperUrl}/scrape/sync`,
    { company_name: companyName, max_items: maxItems },
    { timeout: 600_000 }, // 10-minute hard cap per scrape job
  );

  return res.data.employees.map((e) => ({
    fullName:    e.full_name,
    firstName:   e.first_name,
    lastName:    e.last_name,
    jobTitle:    e.title,
    location:    e.location ?? "",
    linkedinUrl: e.linkedin_url ?? "",
  }));
}
