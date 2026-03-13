# Leadgen – Backend API

Node.js / TypeScript backend that powers the lead generation pipeline.

## Architecture

```
Company Name
    │
    ├─► Clearbit Autocomplete (free)  ──► domain
    └─► Hunter.io (optional, free 25/mo) ──► domain + some emails + pattern
            │
            └─► Apify (LinkedIn scrape) ──► person list
                        │
                        └─► Email Pattern Generator (8 patterns)
                                    │
                                    └─► AfterShip email-verifier (Go) ──► status
                                                │
                                                └─► MongoDB Atlas ──► Frontend
```

## Quick Start (local dev)

```bash
# 1 – install deps
npm install

# 2 – copy env file and fill in any missing values
cp .env.example .env
# MONGODB_URI and APIFY_API_KEY are required

# 3 – start the Go email-verifier server in another terminal
#     (from email-verifier-main/)
go run ./cmd/apiserver

# 4 – start the backend
npm run dev
```

The API is available at `http://localhost:8000`.

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `MONGODB_URI` | ✅ | — | MongoDB Atlas connection string |
| `APIFY_API_KEY` | ✅ | — | Apify API token |
| `APIFY_ACTOR_ID` | | `harvestapi~linkedin-company-employees` | LinkedIn scraping actor |
| `EMAIL_VERIFIER_URL` | | `http://localhost:8080` | AfterShip Go verifier URL |
| `HUNTER_API_KEY` | | — | Hunter.io key (optional, boosts domain accuracy) |
| `API_KEY` | | `dev-api-key-change-in-production` | X-API-Key for incoming requests |
| `PORT` | | `8000` | HTTP listen port |
| `MAX_CONCURRENT_JOBS` | | `3` | Max simultaneous pipelines |

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/companies/search` | Start a search job for 1-N companies |
| `GET` | `/api/v1/jobs/:jobId` | Poll job progress |
| `GET` | `/api/v1/contacts?company_id=...` | Get all contacts for a company |
| `GET` | `/api/v1/contacts/with-emails?company_id=...` | Contacts + best verified email |
| `GET` | `/api/v1/contacts/:contactId/emails` | All email candidates for a contact |
| `GET` | `/api/v1/export/:companyId/csv?api_key=...` | Download CSV |
| `GET` | `/health` | Health check |

## Full Stack (Docker)

From the repo root:

```bash
docker compose up --build
```

- Frontend → `http://localhost:3000`
- Backend API → `http://localhost:8000`
- Go verifier → `http://localhost:8080`

## Enabling SMTP Verification

SMTP verification is **off by default** because most home/cloud ISPs block outbound port 25.
On a VPS with open port 25:

```bash
# backend/.env
SMTP_ENABLED=true          # in docker-compose email-verifier environment

# Or via docker-compose:
# email-verifier:
#   environment:
#     SMTP_ENABLED: "true"
```

## Choosing a Different Apify Actor

The default actor (`harvestapi~linkedin-company-employees`) expects a LinkedIn company
`/people/` URL and returns `{ name, title, location, profileUrl }` per employee.

Alternatives:
- `curious_coder~linkedin-people-search-scraper` – accepts search queries, slower but more targeted
- Any custom actor – set `APIFY_ACTOR_ID` env var; the service normalises common field name variants automatically

## Catch-all Domains (Important)

Many enterprise domains accept all email addresses regardless of whether the mailbox
exists (the verifier returns `catch_all`). This is flagged in the UI with orange colour.
Use email open tracking or LinkedIn confirmation as a secondary signal for these contacts.
