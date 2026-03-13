"use client";

import { AlertCircle, ArrowRightIcon, CheckCircle2, ChevronLeft, ChevronRight, HelpCircle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import Container from "../global/container";
import Icons from "../global/icons";
import { Button } from "../ui/button";
import { OrbitingCircles } from "../ui/orbiting-circles";

interface DemoLead {
  id: number;
  name: string;
  title: string;
  company: string;
  email: string;
  status: "valid" | "catch_all" | "unknown";
}

const DEMO_LEADS: DemoLead[] = [
  { id: 1,  name: "Sarah Mitchell",   title: "VP of Sales",               company: "Stripe",      email: "s.mitchell@stripe.com",          status: "valid"     },
  { id: 2,  name: "James Cooper",     title: "CTO",                       company: "Notion",      email: "james.cooper@makenotion.com",    status: "catch_all" },
  { id: 3,  name: "Emily Rodriguez",  title: "Head of Growth",            company: "Figma",       email: "emily.r@figma.com",              status: "valid"     },
  { id: 4,  name: "David Kim",        title: "Director of Engineering",   company: "Linear",      email: "david.kim@linear.app",           status: "valid"     },
  { id: 5,  name: "Jessica Wang",     title: "CMO",                       company: "Vercel",      email: "jwang@vercel.com",               status: "valid"     },
  { id: 6,  name: "Michael Torres",   title: "VP of Product",             company: "Loom",        email: "m.torres@loom.com",              status: "unknown"   },
  { id: 7,  name: "Rachel Green",     title: "CEO",                       company: "Descript",    email: "rachel@descript.com",            status: "valid"     },
  { id: 8,  name: "Alex Patel",       title: "Head of Sales",             company: "Airtable",    email: "alex.patel@airtable.com",        status: "valid"     },
  { id: 9,  name: "Laura Chen",       title: "Engineering Manager",       company: "Supabase",    email: "l.chen@supabase.io",             status: "catch_all" },
  { id: 10, name: "Ryan Johnson",     title: "Staff Engineer",            company: "PlanetScale", email: "ryan.j@planetscale.com",         status: "valid"     },
  { id: 11, name: "Nina Hoffman",     title: "Director of Marketing",     company: "Webflow",     email: "n.hoffman@webflow.com",          status: "valid"     },
  { id: 12, name: "Chris Martinez",   title: "COO",                       company: "Retool",      email: "cmartinez@retool.com",           status: "unknown"   },
  { id: 13, name: "Priya Sharma",     title: "Product Manager",           company: "Mixpanel",    email: "priya.s@mixpanel.com",           status: "valid"     },
];

const PAGE_SIZE = 10;

function StatusBadge({ status }: { status: DemoLead["status"] }) {
  if (status === "valid") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-green-500/10 text-green-500 border border-green-500/20">
        <CheckCircle2 className="size-3" /> verified
      </span>
    );
  }
  if (status === "catch_all") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-yellow-500/10 text-yellow-500 border border-yellow-500/20">
        <AlertCircle className="size-3" /> catch-all
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-muted text-muted-foreground border border-border">
      <HelpCircle className="size-3" /> unknown
    </span>
  );
}

const Hero = () => {
  const [page, setPage] = useState(0);
  const totalPages = Math.ceil(DEMO_LEADS.length / PAGE_SIZE);
  const visibleLeads = DEMO_LEADS.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div className="relative flex flex-col items-center justify-center w-full py-20">
      <div className="absolute flex lg:hidden size-40 rounded-full bg-blue-500 blur-[10rem] top-0 left-1/2 -translate-x-1/2 -z-10"></div>

      <div className="flex flex-col items-center justify-center gap-y-8 relative">
        <Container className="hidden lg:flex absolute inset-0 top-0 mb-auto flex-col items-center justify-center w-full min-h-screen -z-10">
          <OrbitingCircles speed={0.5} radius={300}>
            <Icons.circle1 className="size-4 text-foreground/70" />
            <Icons.circle2 className="size-1 text-foreground/80" />
          </OrbitingCircles>
          <OrbitingCircles speed={0.25} radius={400}>
            <Icons.circle2 className="size-1 text-foreground/50" />
            <Icons.circle1 className="size-4 text-foreground/60" />
            <Icons.circle2 className="size-1 text-foreground/90" />
          </OrbitingCircles>
          <OrbitingCircles speed={0.1} radius={500}>
            <Icons.circle2 className="size-1 text-foreground/50" />
            <Icons.circle2 className="size-1 text-foreground/90" />
            <Icons.circle1 className="size-4 text-foreground/60" />
            <Icons.circle2 className="size-1 text-foreground/90" />
          </OrbitingCircles>
        </Container>

        <div className="flex flex-col items-center justify-center text-center gap-y-4 bg-background/0">
          <Container className="relative hidden lg:block overflow-hidden">
            <button className="group relative grid overflow-hidden rounded-full px-2 py-1 shadow-[0_1000px_0_0_hsl(0_0%_15%)_inset] transition-colors duration-200 mx-auto">
              <span>
                <span className="spark mask-gradient absolute inset-0 h-[100%] w-[100%] animate-flip overflow-hidden rounded-full [mask:linear-gradient(white,_transparent_50%)] before:absolute before:aspect-square before:w-[200%] before:rotate-[-90deg] before:animate-rotate before:bg-[conic-gradient(from_0deg,transparent_0_340deg,white_360deg)] before:content-[''] before:[inset:0_auto_auto_50%] before:[translate:-50%_-15%]" />
              </span>
              <span className="backdrop absolute inset-[1px] rounded-full bg-background transition-colors duration-200 group-hover:bg-neutral-800" />
              <span className="z-10 py-0.5 text-sm text-neutral-100 flex items-center">
                <span className="px-2 py-[0.5px] h-[18px] tracking-wide flex items-center justify-center rounded-full bg-gradient-to-r from-sky-400 to-blue-600 text-[9px] font-medium mr-2 text-white">
                  AI
                </span>
                Automated lead discovery &amp; email verification
              </span>
            </button>
          </Container>

          <Container delay={0.15}>
            <h1 className="text-4xl md:text-4xl lg:text-7xl font-bold text-center !leading-tight max-w-4xl mx-auto">
              Find &amp; Verify{" "}
              <span>
                Decision-Maker{" "}
              </span>
              Emails with AI
            </h1>
          </Container>

          <Container delay={0.2}>
            <p className="max-w-xl mx-auto mt-2 text-base lg:text-lg text-center text-muted-foreground">
              Search any company, discover decision-maker contacts, and verify work emails — fully automated.
            </p>
          </Container>

          <Container delay={0.25} className="z-20">
            <div className="flex items-center justify-center mt-6 gap-x-4">
              <Link href="/app" className="flex items-center gap-2 group">
                <Button size="lg">
                  Start Finding Leads
                  <ArrowRightIcon className="size-4 group-hover:translate-x-1 transition-all duration-300" />
                </Button>
              </Link>
            </div>
          </Container>

          <Container delay={0.3} className="relative">
            <div className="relative rounded-xl lg:rounded-[32px] border border-border p-2 backdrop-blur-lg mt-10 max-w-6xl mx-auto">
              <div className="absolute top-1/8 left-1/2 -z-10 bg-gradient-to-r from-sky-500 to-blue-600 w-1/2 lg:w-3/4 -translate-x-1/2 h-1/4 -translate-y-1/2 inset-0 blur-[4rem] lg:blur-[10rem] animate-image-glow"></div>
              <div className="hidden lg:block absolute -top-1/8 left-1/2 -z-20 bg-blue-600 w-1/4 -translate-x-1/2 h-1/4 -translate-y-1/2 inset-0 blur-[10rem] animate-image-glow"></div>

              <div className="rounded-lg lg:rounded-[22px] border border-border bg-background overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Name</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Role</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground hidden md:table-cell">Company</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Email</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleLeads.map((lead, i) => (
                        <tr
                          key={lead.id}
                          className={`border-b border-border/50 hover:bg-muted/20 transition-colors ${i % 2 === 0 ? "" : "bg-muted/5"}`}
                        >
                          <td className="px-4 py-2.5 font-medium text-foreground whitespace-nowrap">{lead.name}</td>
                          <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">{lead.title}</td>
                          <td className="px-4 py-2.5 text-muted-foreground hidden md:table-cell">{lead.company}</td>
                          <td className="px-4 py-2.5 text-muted-foreground font-mono text-xs whitespace-nowrap">{lead.email}</td>
                          <td className="px-4 py-2.5"><StatusBadge status={lead.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {totalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/20">
                    <span className="text-xs text-muted-foreground">
                      Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, DEMO_LEADS.length)} of {DEMO_LEADS.length} contacts
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setPage(p => Math.max(0, p - 1))}
                        disabled={page === 0}
                        className="p-1 rounded hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        <ChevronLeft className="size-4" />
                      </button>
                      <span className="text-xs text-muted-foreground">{page + 1} / {totalPages}</span>
                      <button
                        onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                        disabled={page === totalPages - 1}
                        className="p-1 rounded hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        <ChevronRight className="size-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="bg-gradient-to-t from-background to-transparent absolute bottom-0 inset-x-0 w-full h-1/2"></div>
          </Container>
        </div>
      </div>
    </div>
  );
};

export default Hero;
