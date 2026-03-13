"use client";
// Thin wrapper — kept for any legacy component that imports it.
// New search page (src/app/app/page.tsx) uses api.ts directly.
export { startSearch, pollJob, getResults, getExportUrl } from "@/lib/api";
export type { JobStatus, Lead, SearchResponse, ResultsResponse } from "@/lib/api";
