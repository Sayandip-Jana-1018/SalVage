# Salvage — Complete Production Deployment & Hosting Guide

This guide details how to take Salvage to production, deploy the frontend to **Vercel**, deploy the backend services to a **Cloud Host / VPS** (or Container PaaS like Railway / Render), and wire them together securely with automated TLS certificates.

---

## 1. Architecture & Hosting Matrix

Salvage is a high-reliability financial recovery platform split into two decoupled layers:

| Layer | Technology | Hosting Platform | Why |
| :--- | :--- | :--- | :--- |
| **Operator Console** (`apps/salvage-console`) | Next.js 15, React 19, Tailwind CSS | **Vercel** (or Cloud VPS) | Stateless edge frontend; Next.js App Router deploys natively on Vercel with global CDN caching. |
| **Financial Money Core** (`salvage-core`) | Java 21, Spring Boot 3 | **Cloud VPS / Containers** | Stateful JVM daemon; requires persistent connection pools to PostgreSQL, Redis, and streaming Kafka consumers. |
| **Decision & Sensing Brain** (`salvage-brain`) | Python 3.12, FastAPI, NumPy | **Cloud VPS / Containers** | Active background sensing loops; sub-second 2D matrix calculation; connects to Kafka and PostgreSQL. |
| **Infrastructure Stack** | PostgreSQL 16 (TimescaleDB), Redis 7, Redpanda (Kafka) | **Cloud VPS / Containers** | Persistent disk volumes, time-series continuous aggregates, and high-throughput append-only event partitions. |

> [!IMPORTANT]
> **Can the whole backend run on Vercel?**
> **No.** Vercel is a serverless platform designed for short-lived HTTP handlers (max 15–60s execution timeout). It cannot host long-running Java Spring Boot background listeners, persistent Kafka streaming consumer groups, or stateful TimescaleDB databases.
>
> **The ideal setup**:
> - **Option 1 (Hybrid)**: Frontend on **Vercel** (`https://salvage.yourdomain.com`) connected to your Backend running on a Cloud VM (`https://api.yourdomain.com`).
> - **Option 2 (All-in-One)**: Everything running on a single Linux Cloud VM (AWS EC2, DigitalOcean, Hetzner, etc.) via `docker-compose.prod.yml` with Caddy handling automated SSL.

---

## 2. Pathway A: Deploying Frontend to Vercel

The operator console (`apps/salvage-console`) is 100% self-contained and pre-configured for Vercel.

### Step 1: Push Repository to GitHub / GitLab
Make sure your latest code is committed and pushed to your Git repository:
```bash
git add .
git commit -m "feat: production readiness, liquid glass ui, and vercel config"
git push origin main
```

### Step 2: Import Project in Vercel
1. Log in to [Vercel](https://vercel.com).
2. Click **"Add New..."** ➔ **"Project"**.
3. Select your Git repository.
4. In the **Configure Project** screen:
   - **Project Name**: `salvage-console` (or your preferred name)
   - **Framework Preset**: `Next.js`
   - **Root Directory**: Click **Edit** and set it to:
     ```
     apps/salvage-console
     ```
     *(CRITICAL: Do not leave as root `/`; set to `apps/salvage-console`)*

### Step 3: Configure Environment Variables in Vercel
In the Vercel dashboard under **Environment Variables**, add:

| Variable Name | Example Value | Description |
| :--- | :--- | :--- |
| `CORE_BASE_URL` | `https://api.yourdomain.com` | Public HTTPS URL of your deployed `salvage-core` |
| `BRAIN_BASE_URL` | `https://brain.yourdomain.com` | Public HTTPS URL of your deployed `salvage-brain` |
| `SALVAGE_API_KEY` | `svg_operator_...` | An **operator** scope API key generated with `./scripts/generate_api_key.sh operator` |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID` | `rzp_test_...` or `rzp_live_...` | Your public Razorpay Key ID |
| `NEXT_PUBLIC_DEFAULT_MERCHANT_ID`| `merch_demo` | Default tenant loaded on the console |

### Step 4: Deploy
Click **Deploy**. Vercel will build the application using `npm run build` and assign you a URL like `https://salvage-console.vercel.app`.

---

## 3. Pathway B: Deploying Backend to a Cloud Host (VPS / VM)

This is the standard, battle-tested deployment model using `docker-compose.prod.yml`.

### Recommended Host Specifications:
- **OS**: Ubuntu 22.04 LTS or 24.04 LTS
- **RAM**: Minimum 4 GB (8 GB recommended for heavy traffic)
- **Disk**: 40 GB+ SSD
- **Providers**: DigitalOcean Droplet ($24/mo), Hetzner Cloud CPX31 (€13/mo), AWS EC2 `t3.medium` / `t3.large`, GCP `e2-medium`.

### Step 1: Install Docker on the Server
Connect to your server via SSH:
```bash
# Update packages
sudo apt update && sudo apt upgrade -y

# Install Docker and Compose plugin
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
```
*(Log out and log back in for group changes to take effect)*

### Step 2: Clone Repository & Create Production Secrets
```bash
git clone <your-repo-url> salvage
cd salvage

# Create production environment file
cp .env.example .env.prod
```

Generate secure passwords for PostgreSQL and Redis:
```bash
# Set strong random passwords
sed -i "s/POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$(openssl rand -base64 32 | tr -d '\n\r=')/" .env.prod
sed -i "s/REDIS_PASSWORD=.*/REDIS_PASSWORD=$(openssl rand -base64 32 | tr -d '\n\r=')/" .env.prod
```

### Step 3: Generate Production API Keys
Run the key generation script:
```bash
# On Linux/macOS:
./scripts/generate_api_key.sh operator

# On Windows:
powershell -ExecutionPolicy Bypass -File .\scripts\generate_api_key.ps1 -Scope operator
```
Output will display:
1. The **Raw Key**: `svg_operator_abc123...` (save this securely; put this into `SALVAGE_CONSOLE_API_KEY` or Vercel's `SALVAGE_API_KEY`).
2. The **Config Entry**: `operator:*:801716...` (append this to `SALVAGE_API_KEYS` in `.env.prod`).

Generate a merchant key for each tenant carrying traffic:
```bash
./scripts/generate_api_key.sh merchant merch_demo
```
Add the generated entries to `.env.prod`:
```ini
SALVAGE_AUTH_REQUIRED=true
SALVAGE_API_KEYS=operator:*:801716...,merchant:merch_demo:4f82...
SALVAGE_CONSOLE_API_KEY=svg_operator_abc123...
SALVAGE_PAYMENT_PROVIDER=simulated
RAZORPAY_KEY_ID=rzp_test_...
RAZORPAY_KEY_SECRET=...
```

### Step 4: Launch the Production Stack
```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

Check that all containers are healthy:
```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod ps
```
You should see:
- `salvage-postgres` ➔ `healthy`
- `salvage-redis` ➔ `healthy`
- `salvage-redpanda` ➔ `healthy`
- `salvage-core` ➔ `healthy` (listening on `127.0.0.1:8081`)
- `salvage-brain` ➔ `healthy` (listening on `127.0.0.1:8001`)
- `salvage-console` ➔ `healthy` (listening on `127.0.0.1:3000`)

---

## 4. Automated SSL & Reverse Proxy Setup (Caddy)

To expose the services securely over HTTPS with automatic Let's Encrypt certificates, install Caddy on your server:

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install caddy -y
```

### Point Your DNS Records:
In your domain registrar (GoDaddy, Cloudflare, Namecheap, Route53), create 3 `A` records pointing to your server's public IP:
- `api.yourdomain.com` ➔ `<SERVER_IP>`
- `brain.yourdomain.com` ➔ `<SERVER_IP>`
- `console.yourdomain.com` ➔ `<SERVER_IP>`

### Configure Caddy:
Copy `ops/caddy/Caddyfile` to `/etc/caddy/Caddyfile`:
```bash
sudo cp ops/caddy/Caddyfile /etc/caddy/Caddyfile
```
Edit `/etc/caddy/Caddyfile` and replace `example.com` with your actual domain:
```bash
sudo sed -i 's/example.com/yourdomain.com/g' /etc/caddy/Caddyfile
sudo systemctl reload caddy
```
Caddy will automatically obtain Let's Encrypt certificates. In seconds, your HTTPS endpoints are live!

---

## 5. Pathway C: Deploying on Container PaaS (Railway / Render)

If you prefer managed platforms over managing a Linux VPS:

### Deploying to Railway:
1. Install the Railway CLI or use the web dashboard at [railway.app](https://railway.app).
2. Add a **PostgreSQL** plugin (note: enable TimescaleDB extension if available, or provision the docker image `timescale/timescaledb:2.29.2-pg16`).
3. Add a **Redis** plugin.
4. Deploy **Redpanda**: Add a service using image `redpandadata/redpanda:v25.3.17`.
5. Deploy **`salvage-core`**:
   - Source: Repository root
   - Dockerfile path: `services/salvage-core/Dockerfile`
   - Set environment variables (`POSTGRES_*`, `REDIS_*`, `KAFKA_*`, `SALVAGE_API_KEYS`).
6. Deploy **`salvage-brain`**:
   - Source: Repository root
   - Dockerfile path: `services/salvage-brain/Dockerfile`
7. Deploy **`salvage-console`**:
   - Deploy either to Vercel (recommended) or Railway pointing to `apps/salvage-console/Dockerfile`.

---

## 6. Post-Deployment Verification Drill

Run these verification tests from your local machine to prove the deployment is solid:

### 1. Health Probe (Unauthenticated)
```bash
curl -fsS https://api.yourdomain.com/health/readiness
```
Expected output:
```json
{"status":"healthy","checks":{"postgres":true,"redis":true,"kafka":true}}
```

### 2. Sensing Matrix (Unauthenticated Read Probe)
```bash
curl -fsS https://brain.yourdomain.com/healthz/readiness
```
Expected response: HTTP 200 OK.

### 3. Authenticated Tenant Read
```bash
curl -fsS -H "Authorization: Bearer <MERCHANT_KEY>" \
  https://api.yourdomain.com/api/v1/telemetry/merchants/merch_demo/stats
```

### 4. Cross-Tenant Isolation Proof (Must return 404, never 200 or 403)
```bash
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer <MERCHANT_KEY>" \
  https://api.yourdomain.com/api/v1/telemetry/merchants/unauthorized_merchant/stats
```
Expected output: `404`

### 5. Cryptographic Ledger Chain Verification
```bash
curl -fsS -H "Authorization: Bearer <OPERATOR_KEY>" \
  https://api.yourdomain.com/api/v1/ledger/merchants/merch_demo/verify
```
Expected output:
```json
{"valid":true,"verified_entries":0,"failure_index":null}
```

---

## 7. Production Backups

The cryptographic ledger is append-only. Nightly automated database dumps ensure full disaster recovery:

```bash
# Automated cron backup command
docker compose -f docker-compose.prod.yml exec -T postgres pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > "/backups/salvage-$(date +\%F).sql.gz"
```

To restore from a backup:
```bash
gunzip -c /backups/salvage-2026-09-05.sql.gz | docker compose -f docker-compose.prod.yml exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
```
