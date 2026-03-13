import "dotenv/config";

export const config = {
  port:    Number(process.env.PORT ?? 8000),
  apiKey:  process.env.API_KEY ?? "dev-api-key-change-in-production",
  apify: {
    apiKey:  process.env.APIFY_API_KEY  ?? "",
    actorId: process.env.APIFY_ACTOR_ID ?? "harvestapi~linkedin-company-employees",
  },
  maxConcurrentJobs: Number(process.env.MAX_CONCURRENT_JOBS ?? 3),
  wiza: {
    apiKey: process.env.WIZA_API_KEY ?? "",
  },
  fastrouter: {
    apiKey:  process.env.FASTROUTER_API_KEY  ?? "",
    baseUrl: process.env.FASTROUTER_BASE_URL ?? "https://go.fastrouter.ai/api/v1",
  },
  bouncify: {
    apiKey: process.env.BOUNCIFY_API_KEY ?? "",
  },
};

