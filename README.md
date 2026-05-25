# ReviewBot

AI-powered GitHub PR review agent — automatically analyzes code diffs, detects security vulnerabilities (CWE-mapped), code smells, and performance issues, with a dark "Terminal Intelligence" dashboard.

## Stack

- **Runtime**: Node.js 20, TypeScript 5.9, pnpm workspaces
- **API**: Express 5 → Vercel Serverless Function (`api/webhook.ts`)
- **Frontend**: React + Vite + Tailwind CSS + shadcn/ui + Framer Motion
- **Database**: PostgreSQL + Drizzle ORM
- **AI**: Google Gemini 2.5 Flash (or OpenAI)

## Deployment (Vercel)

### 1. Prerequisites

- PostgreSQL database — [Neon](https://neon.tech) free tier recommended
- [Google Gemini API key](https://aistudio.google.com/app/apikey) — free tier available

### 2. Environment Variables

Set these in **Vercel → Project → Settings → Environment Variables**:

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `GEMINI_API_KEY` | ✅ | Google Gemini API key |
| `OPENAI_API_KEY` | optional | OpenAI API key (alternative AI provider) |
| `GITHUB_TOKEN` | optional | Fine-grained PAT: `pull_requests: write`, `contents: read` |
| `GITHUB_WEBHOOK_SECRET` | optional | HMAC secret matching your GitHub webhook config |

### 3. Deploy

```bash
# Install pnpm
npm install -g pnpm

# Install dependencies
pnpm install

# Push DB schema (run once against your production DATABASE_URL)
DATABASE_URL=your_url pnpm --filter @workspace/db run push

# Deploy
vercel
```

### 4. Final Webhook URL

```
https://YOUR_PROJECT.vercel.app/api/webhook
```

### 5. GitHub Webhook Setup

1. Go to your GitHub repo → **Settings → Webhooks → Add webhook**
2. **Payload URL**: `https://YOUR_PROJECT.vercel.app/api/webhook`
3. **Content type**: `application/json`
4. **Secret**: value of your `GITHUB_WEBHOOK_SECRET`
5. **Events**: select **Pull requests**

## Local Development

```bash
cp .env.example .env
# Fill in DATABASE_URL and GEMINI_API_KEY

# Push DB schema
pnpm --filter @workspace/db run push

# Terminal 1 — API server (port 8080)
pnpm --filter @workspace/api-server run dev

# Terminal 2 — Frontend (port 3000)
pnpm --filter @workspace/reviewbot run dev
```

## Architecture

```
api/
  webhook.ts              ← Vercel serverless entry (wraps Express app)

artifacts/
  api-server/
    src/
      app.ts              ← Express app (no app.listen — safe for serverless)
      index.ts            ← Local dev server only (NOT deployed)
      lib/agent.ts        ← AI analysis pipeline (Gemini 2.5 Flash)
      lib/github.ts       ← GitHub API: fetch diff, post comments
      lib/sse.ts          ← SSE broadcaster for Live Feed
      routes/
        webhook.ts        ← POST /api/webhook (GitHub events)
        scans.ts          ← GET/POST /api/scans
        settings.ts       ← GET/PATCH /api/settings
        events.ts         ← GET /api/events (SSE)
        health.ts         ← GET /api/healthz
  reviewbot/
    src/                  ← React dashboard (Vite build → dist/public)

lib/
  db/src/schema/          ← Drizzle ORM schema (PostgreSQL)
  api-spec/openapi.yaml   ← OpenAPI contract (source of truth)
  api-client-react/       ← Generated React Query hooks
  integrations-gemini-ai/ ← Gemini client (uses GEMINI_API_KEY)
```
