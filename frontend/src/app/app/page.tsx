"use client";

import { useState, useCallback, useRef } from "react";
import { startSearch, pollJob, getResults, getExportUrl, analyzePrd } from "@/lib/api";
import type { JobStatus, Lead, PrdAnalysisResult } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  Search, Download, Loader2, CheckCircle2, Circle,
  ExternalLink, Mail, User, Building2, Briefcase,
  RefreshCw, FileText, Upload, Sparkles, X, ChevronRight,
} from "lucide-react";

// -- Role groups ---------------------------------------------------------------

const ROLE_GROUPS = [
  {
    label: "C-Suite",
    roles: ["CEO", "CTO", "CFO", "COO", "CISO"],
  },
  {
    label: "VP Level",
    roles: ["VP Engineering", "VP Product", "VP Sales", "Vice President"],
  },
  {
    label: "Director / Manager",
    roles: ["Director", "Engineering Manager", "Head of Engineering", "Head of Product"],
  },
];

const ALL_ROLES = ROLE_GROUPS.flatMap((g) => g.roles);

// -- Status badge --------------------------------------------------------------

function statusBadge(status: string | null | undefined) {
  if (!status) return null;
  const map: Record<string, string> = {
    valid:           "bg-green-500/20 text-green-400 border-green-500/30",
    source_provided: "bg-blue-500/20 text-blue-300 border-blue-500/30",
    catch_all:       "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    unknown:         "bg-zinc-700/50 text-zinc-400 border-zinc-600",
    risky:           "bg-orange-500/20 text-orange-400 border-orange-500/30",
    invalid:         "bg-red-500/20 text-red-400 border-red-500/30",
    unverified:      "bg-zinc-700/50 text-zinc-500 border-zinc-600",
  };
  const cls = map[status] ?? map.unknown;
  const isVerified = status === "valid" || status === "catch_all";
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border ${cls}`}>
      {isVerified ? <CheckCircle2 className="w-3 h-3" /> : <Circle className="w-3 h-3" />}
      {status === "source_provided" ? "sourced" : status}
    </span>
  );
}

// -- Main page -----------------------------------------------------------------

type Mode = "company" | "prd";

export default function LeadGenPage() {
  const [mode, setMode] = useState<Mode>("company");

  const [companyName, setCompanyName]     = useState("");
  const [linkedinCompanyUrl, setLinkedinCompanyUrl] = useState("");
  const [selectedRoles, setSelectedRoles] = useState<string[] | null>(null);
  const [maxContacts, setMaxContacts]     = useState(25);

  const [prdFile, setPrdFile]           = useState<File | null>(null);
  const [prdAnalysis, setPrdAnalysis]   = useState<PrdAnalysisResult | null>(null);
  const [analyzingPrd, setAnalyzingPrd] = useState(false);
  const fileInputRef                    = useRef<HTMLInputElement>(null);

  const [job, setJob]         = useState<JobStatus | null>(null);
  const [leads, setLeads]     = useState<Lead[]>([]);
  const [loading, setLoading] = useState(false);
  const [polling, setPolling] = useState(false);
  const pollRef               = useRef<ReturnType<typeof setInterval> | null>(null);

  const effectiveRoles = selectedRoles ?? [];

  const toggleRole = useCallback((role: string) => {
    setSelectedRoles((prev) => {
      const list = prev ?? [];
      return list.includes(role) ? list.filter((r) => r !== role) : [...list, role];
    });
  }, []);

  const toggleGroup = useCallback((roles: string[]) => {
    setSelectedRoles((prev) => {
      const list  = prev ?? [];
      const allOn = roles.every((r) => list.includes(r));
      if (allOn) return list.filter((r) => !roles.includes(r));
      return [...new Set([...list, ...roles])];
    });
  }, []);

  const stopPolling = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
    setPolling(false);
  };

  const fetchResults = useCallback(async (jobId: string) => {
    try {
      const data = await getResults(jobId);
      setLeads(data.contacts);
    } catch (err) {
      console.warn("Results fetch failed:", err);
    }
  }, []);

  const startPolling = useCallback((jobId: string) => {
    setPolling(true);
    pollRef.current = setInterval(async () => {
      try {
        const status = await pollJob(jobId);
        setJob(status);
        if (status.status === "completed") {
          stopPolling();
          await fetchResults(jobId);
          toast.success(`Found ${status.total_contacts} contacts for ${status.company_name}`);
        } else if (status.status === "failed") {
          stopPolling();
          toast.error(status.error_message ?? "Search failed");
        }
      } catch {
        stopPolling();
      }
    }, 4_000);
  }, [fetchResults]);

  const handleAnalyzePrd = async () => {
    if (!prdFile) { toast.error("Please select a file first"); return; }
    setAnalyzingPrd(true);
    setPrdAnalysis(null);
    try {
      const result = await analyzePrd(prdFile);
      setPrdAnalysis(result);
      if (result.suggested_roles.length > 0) setSelectedRoles(result.suggested_roles);
      toast.success("Document analyzed! Suggested roles applied.");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setAnalyzingPrd(false);
    }
  };

  const handleSearch = async () => {
    if (!companyName.trim()) { toast.error("Please enter a company name"); return; }
    setLoading(true);
    setLeads([]);
    setJob(null);
    stopPolling();
    try {
      const result = await startSearch(
        companyName.trim(),
        effectiveRoles,
        maxContacts,
        linkedinCompanyUrl.trim() || undefined,
      );

      if (result.cached) {
        const status = await pollJob(result.job_id);
        setJob(status);
        await fetchResults(result.job_id);
        toast.success(`Loaded cached results for ${result.company_name}`);
        return;
      }

      const initialJob: JobStatus = {
        job_id: result.job_id,
        status: "queued",
        company_name: result.company_name,
        total_contacts: 0,
        processed_contacts: 0,
        verified_emails: 0,
        progress_percent: 0,
      };
      setJob(initialJob);
      const filterInfo = effectiveRoles.length > 0 ? `(${effectiveRoles.length} role filters)` : "(all employees)";
      toast.info(`Search started for ${result.company_name} ${filterInfo}`);
      startPolling(result.job_id);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handlePrdSearch = () => {
    if (!companyName.trim()) {
      toast.error("Enter a company name to search with AI-suggested roles");
      return;
    }
    setMode("company");
    handleSearch();
  };

  return (
    <div className="min-h-screen bg-background text-foreground p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-1">Lead Generator</h1>
        <p className="text-muted-foreground text-sm">
          Search by company · Scrape LinkedIn · Generate &amp; verify emails · AI document analysis
        </p>
      </div>

      <div className="flex gap-2 mb-6 p-1 bg-muted/40 rounded-xl w-fit border border-border">
        <button
          onClick={() => setMode("company")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            mode === "company"
              ? "bg-background shadow text-foreground border border-border"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Building2 className="w-4 h-4" />
          Company Search
        </button>
        <button
          onClick={() => setMode("prd")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            mode === "prd"
              ? "bg-background shadow text-foreground border border-border"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Sparkles className="w-4 h-4" />
          PRD / Document
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-5">

          {mode === "prd" && (
            <div className="rounded-xl border border-border bg-card p-5 space-y-4">
              <h2 className="font-semibold flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary" />
                Upload PRD / Document
              </h2>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Upload a product requirements doc, job description, or any brief.
                AI will analyze it and suggest the right roles to search for.
              </p>

              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files[0];
                  if (f) setPrdFile(f);
                }}
                className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors"
              >
                <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-50" />
                {prdFile ? (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-foreground">{prdFile.name}</p>
                    <p className="text-xs text-muted-foreground">{(prdFile.size / 1024).toFixed(0)} KB</p>
                  </div>
                ) : (
                  <div>
                    <p className="text-xs font-medium">Click or drag &amp; drop</p>
                    <p className="text-xs text-muted-foreground mt-1">PDF, DOCX, TXT — up to 10 MB</p>
                  </div>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.doc,.txt"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) { setPrdFile(f); setPrdAnalysis(null); }
                }}
              />

              {prdFile && (
                <button
                  onClick={() => {
                    setPrdFile(null);
                    setPrdAnalysis(null);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive"
                >
                  <X className="w-3 h-3" /> Remove file
                </button>
              )}

              <Button onClick={handleAnalyzePrd} disabled={!prdFile || analyzingPrd} className="w-full gap-2">
                {analyzingPrd
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing…</>
                  : <><Sparkles className="w-4 h-4" /> Analyze with AI</>}
              </Button>
            </div>
          )}

          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <h2 className="font-semibold flex items-center gap-2">
              <Building2 className="w-4 h-4 text-primary" />
              {mode === "prd" ? "Company to search" : "Company"}
            </h2>
            {mode === "prd" && (
              <p className="text-xs text-muted-foreground -mt-2">
                Enter a company to search LinkedIn with the AI-suggested roles.
              </p>
            )}
            <Input
              placeholder="e.g. Stripe, Microsoft, Notion…"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (mode === "company" ? handleSearch() : handlePrdSearch())}
              className="w-full"
            />
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">LinkedIn company URL (optional fallback)</label>
              <Input
                placeholder="https://www.linkedin.com/company/compqsoft-inc"
                value={linkedinCompanyUrl}
                onChange={(e) => setLinkedinCompanyUrl(e.target.value)}
                className="w-full"
              />
            </div>
            {mode === "company" && (
              <div className="flex items-center gap-3">
                <label className="text-xs text-muted-foreground whitespace-nowrap">Max contacts</label>
                <Input
                  type="number" min={1} max={200}
                  value={maxContacts}
                  onChange={(e) => setMaxContacts(Number(e.target.value))}
                  className="w-24"
                />
              </div>
            )}
          </div>

          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <h2 className="font-semibold flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-primary" />
              Role Filters
              {prdAnalysis && selectedRoles && selectedRoles.length > 0 && (
                <Badge variant="secondary" className="text-xs gap-1">
                  <Sparkles className="w-2.5 h-2.5" /> AI suggested
                </Badge>
              )}
            </h2>

            <label className="flex items-center gap-2 cursor-pointer rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
              <Checkbox
                checked={selectedRoles === null || selectedRoles.length === 0}
                onCheckedChange={(checked) => {
                  if (checked) setSelectedRoles(null);
                  else setSelectedRoles([...ALL_ROLES]);
                }}
                className="h-3.5 w-3.5"
              />
              <span className="text-xs font-medium">All employees (no filter)</span>
            </label>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Or filter by role:</span>
                <div className="flex gap-2">
                  <button onClick={() => setSelectedRoles([...ALL_ROLES])} className="text-xs text-primary hover:underline">All</button>
                  <button onClick={() => setSelectedRoles(null)}           className="text-xs text-muted-foreground hover:underline">None</button>
                </div>
              </div>
              {ROLE_GROUPS.map((group) => {
                const list  = selectedRoles ?? [];
                const allOn = group.roles.every((r) => list.includes(r));
                return (
                  <div key={group.label} className="space-y-1.5">
                    <button
                      onClick={() => toggleGroup(group.roles)}
                      className={`flex items-center gap-2 text-xs font-medium uppercase tracking-wide ${allOn ? "text-primary" : "text-muted-foreground"}`}
                    >
                      <span className={`w-2 h-2 rounded-full ${allOn ? "bg-primary" : "bg-muted-foreground/50"}`} />
                      {group.label}
                    </button>
                    <div className="grid grid-cols-1 gap-1 pl-4">
                      {group.roles.map((role) => (
                        <label key={role} className="flex items-center gap-2 cursor-pointer">
                          <Checkbox
                            checked={(selectedRoles ?? []).includes(role)}
                            onCheckedChange={() => {
                              if (selectedRoles === null) setSelectedRoles([role]);
                              else toggleRole(role);
                            }}
                            className="h-3.5 w-3.5"
                          />
                          <span className="text-xs">{role}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {mode === "company" ? (
            <Button onClick={handleSearch} disabled={loading || polling} className="w-full gap-2" size="lg">
              {loading || polling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              {loading ? "Starting…" : polling ? "Searching…" : "Search"}
            </Button>
          ) : (
            <Button
              onClick={handlePrdSearch}
              disabled={!companyName.trim() || loading || polling || !prdAnalysis}
              className="w-full gap-2"
              size="lg"
            >
              {loading || polling ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
              {loading ? "Starting…" : polling ? "Searching…" : "Search with AI roles"}
            </Button>
          )}
        </div>

        <div className="lg:col-span-2 space-y-4">
          {mode === "prd" && prdAnalysis && (
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                <h3 className="font-semibold text-sm">AI Analysis — {prdAnalysis.document_name}</h3>
              </div>

              <p className="text-sm text-muted-foreground leading-relaxed">{prdAnalysis.requirements_summary}</p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Suggested Roles</p>
                  <div className="flex flex-wrap gap-1.5">
                    {prdAnalysis.suggested_roles.map((role) => (
                      <button
                        key={role}
                        onClick={() => {
                          setSelectedRoles((prev) => {
                            const list = prev ?? [];
                            return list.includes(role) ? list.filter((r) => r !== role) : [...list, role];
                          });
                        }}
                        className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                          (selectedRoles ?? []).includes(role)
                            ? "bg-primary text-primary-foreground border-primary"
                            : "border-border hover:border-primary/50"
                        }`}
                      >
                        {role}
                      </button>
                    ))}
                  </div>
                </div>

                {prdAnalysis.job_titles.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">LinkedIn titles</p>
                    <div className="flex flex-wrap gap-1.5">
                      {prdAnalysis.job_titles.map((t) => (
                        <span key={t} className="px-2 py-0.5 rounded-md bg-muted text-xs text-muted-foreground border border-border">{t}</span>
                      ))}
                    </div>
                  </div>
                )}

                {prdAnalysis.skills.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Key skills</p>
                    <div className="flex flex-wrap gap-1.5">
                      {prdAnalysis.skills.map((s) => (
                        <span key={s} className="px-2 py-0.5 rounded-md bg-muted/70 text-xs text-muted-foreground border border-border">{s}</span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Seniority</p>
                  <Badge variant="outline" className="capitalize">{prdAnalysis.seniority_level}</Badge>
                </div>
              </div>

              <p className="text-xs text-muted-foreground italic">
                Roles are pre-selected above. Enter a company name and click &quot;Search with AI roles&quot;.
              </p>
            </div>
          )}

          {job && (
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <span className="text-sm font-semibold">{job.company_name}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {job.total_contacts > 0 && `${job.processed_contacts} / ${job.total_contacts} contacts`}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {polling && <RefreshCw className="w-3.5 h-3.5 animate-spin text-primary" />}
                  <Badge variant={job.status === "completed" ? "default" : job.status === "failed" ? "destructive" : "secondary"}>
                    {job.status}
                  </Badge>
                  {job.status === "completed" && leads.length > 0 && (
                    <Button size="sm" variant="outline" asChild className="gap-1 text-xs">
                      <a href={getExportUrl(job.job_id)} download>
                        <Download className="w-3.5 h-3.5" /> CSV
                      </a>
                    </Button>
                  )}
                </div>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${job.progress_percent}%` }} />
              </div>
              {job.error_message && <p className="mt-2 text-xs text-red-400">{job.error_message}</p>}
            </div>
          )}

          {leads.length > 0 ? (
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="px-5 py-3 border-b border-border flex items-center justify-between">
                <span className="text-sm font-semibold">
                  {leads.length} leads found{job && ` · ${job.verified_emails} verified`}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30 text-xs text-muted-foreground uppercase tracking-wide">
                      <th className="text-left px-4 py-3">Name</th>
                      <th className="text-left px-4 py-3">Title</th>
                      <th className="text-left px-4 py-3">Email</th>
                      <th className="text-left px-4 py-3">Status</th>
                      <th className="text-left px-4 py-3">LinkedIn</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leads.map((lead, i) => (
                      <tr key={lead.id} className={`border-b border-border/50 hover:bg-muted/20 transition-colors ${i % 2 === 0 ? "" : "bg-muted/10"}`}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                              <User className="w-3.5 h-3.5 text-primary" />
                            </div>
                            <div>
                              <div className="font-medium leading-tight">{lead.name}</div>
                              {lead.location && <div className="text-xs text-muted-foreground">{lead.location}</div>}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm leading-tight">{lead.title ?? "—"}</div>
                          {lead.seniority && lead.seniority !== "Other" && <div className="text-xs text-muted-foreground">{lead.seniority}</div>}
                        </td>
                        <td className="px-4 py-3">
                          {lead.email ? (
                            <div className="flex items-center gap-1.5">
                              <Mail className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                              <span className="font-mono text-xs break-all">{lead.email}</span>
                            </div>
                          ) : <span className="text-xs text-muted-foreground">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          {statusBadge(lead.email_status)}
                          {lead.confidence != null && <div className="text-xs text-muted-foreground mt-0.5">{lead.confidence}% conf</div>}
                        </td>
                        <td className="px-4 py-3">
                          {lead.linkedin_url ? (
                            <a href={lead.linkedin_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-primary hover:underline">
                              <ExternalLink className="w-3.5 h-3.5" /> Profile
                            </a>
                          ) : <span className="text-xs text-muted-foreground">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : job?.status === "completed" ? (
            <div className="rounded-xl border border-border bg-card p-12 text-center text-muted-foreground">
              <Search className="w-8 h-8 mx-auto mb-3 opacity-30" />
              <p>No contacts found.</p>
              <p className="text-xs mt-1">Try a different company name or switch to &quot;All employees&quot;.</p>
            </div>
          ) : !job && mode === "company" ? (
            <div className="rounded-xl border border-dashed border-border bg-card/50 p-16 text-center text-muted-foreground">
              <Building2 className="w-10 h-10 mx-auto mb-4 opacity-20" />
              <p className="font-medium">Enter a company name to get started</p>
              <p className="text-xs mt-2 opacity-60">Scrapes LinkedIn via Apify · Generates email patterns · Verifies via MX/SMTP</p>
            </div>
          ) : !job && mode === "prd" ? (
            <div className="rounded-xl border border-dashed border-border bg-card/50 p-16 text-center text-muted-foreground">
              <FileText className="w-10 h-10 mx-auto mb-4 opacity-20" />
              <p className="font-medium">Upload a document to analyze</p>
              <p className="text-xs mt-2 opacity-60">AI will extract role requirements and suggest LinkedIn search terms</p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
