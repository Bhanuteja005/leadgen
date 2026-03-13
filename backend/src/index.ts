import "dotenv/config";
import express    from "express";
import cors       from "cors";
import { config } from "./config";
import { pool }   from "./db/pool";
import { migrate } from "./db/migrate";
import { apiKeyMiddleware } from "./middleware/auth";
import searchRouter  from "./routes/search";
import analyzeRouter from "./routes/analyze";

const app = express();

app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "1mb" }));

// Health check — no auth required
app.get("/health", (_req, res) => res.json({ status: "ok" }));

// All /api routes require API key (skip for export via ?api_key query param)
app.use("/api", apiKeyMiddleware);
app.use("/api/search",      searchRouter);
app.use("/api/analyze-prd", analyzeRouter);

// 404
app.use((_req, res) => res.status(404).json({ error: "Not found" }));

async function start(): Promise<void> {
  // Verify DB connection
  await pool.query("SELECT 1");
  console.log("[db] PostgreSQL connected");

  // Run schema migrations (idempotent)
  await migrate();

  app.listen(config.port, () => {
    console.log(`Leadgen API running on http://localhost:${config.port}`);
  });
}

start().catch((err) => {
  console.error("Failed to start:", err);
  process.exit(1);
});

