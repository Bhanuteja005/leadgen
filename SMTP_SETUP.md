# SMTP Email Verification — Step-by-Step Setup Guide

The `email-verifier-main/` directory contains an [AfterShip email-verifier](https://github.com/aftership/email-verifier) Go server.  
It verifies email addresses by:
1. Checking MX records (DNS lookup)
2. Opening an SMTP connection and simulating `RCPT TO` — this is **port 25**
3. Detecting catch-all servers, disposable providers, and role addresses

---

## Why "unknown" on your local machine?

Most home ISPs and cloud providers (AWS EC2, Azure VMs) **block outbound port 25** to prevent spam abuse.  
When port 25 is blocked the verifier can still check MX records but cannot confirm mailbox existence → result is `unknown`.

---

## Option A — VPS with Port 25 Open (Recommended for production)

Providers that allow port 25 on request:
| Provider | Notes |
|---|---|
| [Vultr](https://vultr.com) | Enable port 25 via support ticket after account verification |
| [Hetzner](https://hetzner.com) | Port 25 open by default on dedicated/cloud servers |
| [DigitalOcean](https://digitalocean.com) | Request port 25 unlock via support — usually approved |
| [OVHcloud](https://ovhcloud.com) | Port 25 open by default |
| [Contabo](https://contabo.com) | Port 25 open by default |

### Steps

#### 1. Provision a VPS (example: Ubuntu 22.04, 1 vCPU, 1 GB RAM)

```bash
# SSH into the VPS
ssh root@<VPS_IP>
```

#### 2. Install Go

```bash
apt update && apt install -y golang-go git
```

Or install a specific version:

```bash
wget https://go.dev/dl/go1.22.0.linux-amd64.tar.gz
tar -C /usr/local -xzf go1.22.0.linux-amd64.tar.gz
export PATH=$PATH:/usr/local/go/bin
```

#### 3. Clone and build the verifier

```bash
git clone https://github.com/aftership/email-verifier.git
cd email-verifier/cmd/apiserver
go build -o /usr/local/bin/verifier-server .
```

#### 4. Configure environment variables

Create `/etc/verifier.env`:

```env
PORT=8080
SMTP_ENABLED=true
CATCH_ALL_ENABLED=true

# Use a domain you own (for EHLO/HELO greeting)
HELLO_NAME=yourdomain.com
FROM_EMAIL=verify@yourdomain.com

# Optional DNS resolver (Cloudflare)
DNS_SERVER=1.1.1.1:53
```

> **Important**: `HELLO_NAME` should match a valid reverse-DNS (PTR) record for your VPS IP for best deliverability.  
> Set this up in your DNS provider: `<VPS_IP>` → `mail.yourdomain.com`

#### 5. Run with systemd (auto-restart)

Create `/etc/systemd/system/verifier.service`:

```ini
[Unit]
Description=Email Verifier SMTP Server
After=network.target

[Service]
EnvironmentFile=/etc/verifier.env
ExecStart=/usr/local/bin/verifier-server
Restart=on-failure
User=nobody
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload
systemctl enable --now verifier
systemctl status verifier
```

#### 6. Open firewall on port 8080

```bash
ufw allow 8080/tcp
ufw reload
```

#### 7. Test from the VPS

```bash
curl http://localhost:8080/health
# → {"status":"ok"}

curl http://localhost:8080/v1/test@gmail.com/verification
# → {"email":"test@gmail.com","reachable":"no","syntax":{...},"smtp":{"hostExists":true,...}}
```

#### 8. Update your backend `.env`

```env
EMAIL_VERIFIER_URL=http://<VPS_IP>:8080
```

Or with the Docker stack, update `docker-compose.yml`:

```yaml
email-verifier:
  image: ...   # or build: ./email-verifier-main
  environment:
    SMTP_ENABLED: "true"
    HELLO_NAME: "yourdomain.com"
    FROM_EMAIL: "verify@yourdomain.com"
```

---

## Option B — Run Locally (MX-Only, No SMTP)

This is the default mode. Useful for development.

```bash
# From: email-verifier-main/
cd email-verifier-main

# Build the binary (Windows)
go build -o verifier-server.exe ./cmd/apiserver

# Run
$env:PORT="8080"
$env:SMTP_ENABLED="false"   # MX check only
$env:CATCH_ALL_ENABLED="true"
.\verifier-server.exe
```

Results will return `is_reachable: "unknown"` for SMTP-only checks.  
MX lookup still returns `has_mx_records: true/false` which is useful for filtering clearly invalid domains.

---

## Option C — Docker (Local or VPS)

The `email-verifier-main/Dockerfile` is already configured.

**Local (no SMTP):**

```bash
docker compose up email-verifier
```

**VPS with SMTP:**

```yaml
# docker-compose.yml
email-verifier:
  build: ./email-verifier-main
  environment:
    SMTP_ENABLED: "true"
    HELLO_NAME: "yourdomain.com"
    FROM_EMAIL: "verify@yourdomain.com"
```

```bash
docker compose up -d
```

---

## API Reference

The verifier exposes a single REST endpoint used by the backend:

```
GET /v1/{email}/verification
```

### Example response (SMTP enabled, valid email)

```json
{
  "email": "john.smith@stripe.com",
  "reachable": "yes",
  "syntax": {
    "username": "john.smith",
    "domain": "stripe.com",
    "valid": true
  },
  "smtp": {
    "hostExists": true,
    "fullInbox": false,
    "catchAll": false,
    "deliverable": true,
    "disabled": false
  },
  "gravatar": null,
  "suggestion": "",
  "disposable": false,
  "roleAccount": false,
  "free": false,
  "hasMxRecords": true
}
```

### Reachability values

| `reachable` | Meaning |
|---|---|
| `yes` | SMTP confirmed — mailbox exists |
| `no` | SMTP rejected — mailbox does not exist |
| `unknown` | Cannot confirm (port 25 blocked, timeout, catch-all) |
| `risky` | Catch-all server — accept-all but may bounce |

---

## Confidence Score Mapping (in backend)

The backend (`emailVerifier.ts`) maps the verifier response to a confidence score:

| Status | Score | Meaning |
|---|---|---|
| `valid` | 90 | SMTP confirmed deliverable |
| `catch_all` | 60 | Server accepts all — uncertain |
| `risky` | 40 | Likely risky |
| `unknown` | 20 | Cannot verify |
| `invalid` | 0 | Definitely invalid |

---

## Security Notes

- Never expose the verifier server's port publicly without firewall ACLs on production
- Use the `API_KEY` for backend → verifier communication if it's on a public IP
- Rate-limit your verifier VPS: each SMTP check opens a real connection to mail servers
- Avoid verifying bulk lists rapidly — this may get your IP flagged as a spammer

---

## Full Stack: Quick Start

```bash
# 1. Start PostgreSQL, backend, email-verifier, and frontend
docker compose up -d

# 2. Open the app
# http://localhost:3000/app   ← Lead search UI
# http://localhost:3000       ← Landing page

# 3. Backend API
# http://localhost:8000/health

# 4. Verifier
# http://localhost:8080/health
```

### Without Docker

```powershell
# Terminal 1: Email verifier
cd email-verifier-main
$env:PORT="8080"; $env:SMTP_ENABLED="false"
go run ./cmd/apiserver

# Terminal 2: Backend
cd backend
npm run dev   # ts-node-dev --transpile-only src/index.ts

# Terminal 3: Frontend
cd frontend
pnpm dev
```

> **Prerequisite**: PostgreSQL must be running locally with database `leadgen` created:
> ```sql
> CREATE DATABASE leadgen;
> ```
> The backend auto-creates all tables on first startup via `migrate()`.
