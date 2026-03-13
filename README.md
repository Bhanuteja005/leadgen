# LeadGen — AI-Powered Lead Generation

Full-stack lead generation tool: search a company → scrape LinkedIn (Apify) → generate email patterns → verify via SMTP.

## Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 15 + React 19 + TailwindCSS + shadcn/ui |
| Backend | Node.js + Express + TypeScript |
| Database | PostgreSQL (raw `pg`, no ORM) |
| Scraping | Apify `harvestapi~linkedin-company-employees` |
| Domain lookup | Clearbit Autocomplete (free) |
| Email verifier | AfterShip Go server (`email-verifier-main/`) |

---

## Quick Start (Docker)

```bash
# Clone
git clone <repo>
cd leadgen

# Start everything
docker compose up -d

# Open
# http://localhost:3000/app   ← Lead search UI
# http://localhost:3000       ← Landing page
# http://localhost:8000/health ← Backend
# http://localhost:8080/health ← Email verifier
```

---

## Local Development

### Prerequisites
- Node.js 20+
- Go 1.21+
- PostgreSQL 15+ running locally
- pnpm

### 1. Create the database

```bash
psql -U postgres -c "CREATE DATABASE leadgen;"
```

The backend auto-creates all tables on first start.

### 2. Backend

```bash
cd backend
cp .env.example .env    # edit with your keys
npm install
npm run dev             # ts-node-dev on port 8000
```

### 3. Email Verifier

```bash
cd email-verifier-main
go run ./cmd/apiserver   # runs on port 8080
```

> See [SMTP_SETUP.md](./SMTP_SETUP.md) for full SMTP verification on a VPS.

### 4. Frontend

```bash
cd frontend
pnpm install
pnpm dev   # Next.js on port 3000
```

---

## Environment Variables (`backend/.env`)

```env
PORT=8000
API_KEY=dev-api-key-change-in-production

DB_HOST=localhost
DB_PORT=5432
DB_NAME=leadgen
DB_USER=postgres
DB_PASSWORD=postgres
DB_SSL=false

EMAIL_VERIFIER_URL=http://localhost:8080

APIFY_API_KEY=<your_apify_token>
APIFY_ACTOR_ID=harvestapi~linkedin-company-employees

MAX_CONCURRENT_JOBS=3
```

---

## API Reference

All API routes require `X-API-Key: <API_KEY>` header (or `?api_key=` for CSV export).

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/search` | Start a new search job |
| `GET` | `/api/search/:id` | Job status + progress |
| `GET` | `/api/search/:id/results` | Contacts with best email |
| `GET` | `/api/search/:id/export` | CSV download |

### POST /api/search

```json
{
  "company_name": "Stripe",
  "roles": ["CEO", "CTO", "VP Engineering"],
  "max_contacts": 15
}
```

Response `202`:
```json
{ "job_id": "uuid", "status": "queued", "company_name": "Stripe" }
```

### GET /api/search/:id/results

```json
{
  "job_id": "uuid",
  "count": 12,
  "contacts": [
    {
      "id": "uuid",
      "name": "John Smith",
      "title": "CTO",
      "email": "john.smith@stripe.com",
      "email_status": "valid",
      "confidence": 90,
      "linkedin_url": "https://linkedin.com/in/johnsmith",
      "company": "Stripe",
      "domain": "stripe.com"
    }
  ]
}
```

---

## SMTP Verification

See **[SMTP_SETUP.md](./SMTP_SETUP.md)** for:
- Why SMTP returns "unknown" locally
- VPS providers with port 25 open
- Step-by-step systemd service setup
- Docker configuration

---

## Database Schema

```sql
companies (id, name, domain, linkedin_url, created_at)
jobs      (id, company_id, company_name, status, total/processed/verified, progress_percent, error_message)
contacts  (id, job_id, company_id, full_name, first/last_name, job_title, role_category, seniority_level, linkedin_url, location)
email_verifications (id, contact_id, email, pattern_used, verification_status, is_reachable, has_mx_records, confidence_score, smtp_response)
```
