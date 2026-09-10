# Orbit — eve web chat with conversation history

A minimal [eve](https://eve.dev) agent with a Next.js web chat and a persistent
conversation history sidebar. eve keeps the actual message transcript inside its
durable workflow sessions; a small Postgres table (Neon) only stores the list of
conversations and the pointer needed to resume each one.

Stack: Next.js 16 · eve · Neon Postgres · Drizzle ORM · shadcn/ui · SWR

## Built with v0

This repository is linked to a [v0](https://v0.app) project. Start new chats there to make changes; v0 pushes commits to this repo and every merge to `main` deploys.

[Continue working on v0 →](https://v0.app/chat/projects/prj_HjxCRIiUMq6pGNnqm8kSKc1iDNvu)

## Getting started

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). Requires Node 24 and a
`DATABASE_URL` env var (provisioned automatically by the Neon integration on
Vercel/v0). The model runs through Vercel AI Gateway, so no provider key is
needed there either.

---

## Tutorial: adding a history feature to an eve web chat

The whole trick is a division of labour:

| Concern                              | Owner                       |
| ------------------------------------ | --------------------------- |
| Message transcript, streaming, tools | eve session (durable)       |
| List of conversations + titles       | Postgres `chat_sessions`    |
| Link between the two                 | `workflow_session_id` column |

You never copy messages into your own database. You store one row per
conversation with the eve `sessionId`, and on click you hand that id back to
`useEveAgent` with `resume: true`. eve replays the transcript for you.

### 1. Scaffold the eve agent

```bash
pnpm add eve
pnpm exec eve init . --channel-web-nextjs --model anthropic/claude-sonnet-4-5
```

Wrap the Next.js config so the `/eve/v1/*` routes get mounted:

```js
// next.config.mjs
import { withEve } from "eve/next"

const nextConfig = { /* ... */ }

export default withEve(nextConfig)
```

Add `eve build` to the build script so the agent compiles on deploy:

```json
"scripts": {
  "dev": "next dev",
  "build": "eve build && next build",
  "start": "next start"
}
```

### 2. Write the agent prompt

`agent/instructions.md` is the always-on system prompt. This is the one used
by the demo:

```md
You are Orbit, a practical product and operations copilot.

Help users turn rough ideas into clear plans, decisions, and next actions. Be concise, direct, and useful. Ask one focused clarifying question only when it materially changes the answer. Use the built-in web tools when current information is necessary, but keep research bounded to at most four tool calls per turn. Prefer short headings, bullets, and concrete recommendations over long essays.

This is a public demo. Never request secrets, credentials, or sensitive personal data. Remind users not to paste confidential information when it appears relevant.
```

Tips for a history-friendly prompt:

- Keep the persona stable. Resumed sessions replay the old transcript, so a
  prompt that changes tone between deploys makes old threads feel inconsistent.
- Bound tool usage. Resuming a session that is mid-way through a long tool loop
  is fine for eve but confusing for a user who just opened the thread.
- Say it is a demo and tell the model not to ask for secrets: history lives in
  a database, so anything typed is retained.

### 3. Open the web channel

The demo is anonymous, so the eve HTTP channel uses no auth. For anything
beyond a demo, swap `none()` for a real auth provider (see
`node_modules/eve/docs/guides/auth-and-route-protection.md`).

```ts
// agent/channels/eve.ts
import { none } from "eve/channels/auth"
import { eveChannel } from "eve/channels/eve"

export default eveChannel({
  auth: none(),
})
```

### 4. Create the history table

One table, no messages in it. `visitor_id` is the owner (an anonymous cookie
here; a user id if you have auth). `workflow_session_id` is the eve pointer.
It is nullable because a conversation row is created *before* the first
message is sent, and eve assigns the session id during that first turn.

```sql
CREATE TABLE IF NOT EXISTS chat_sessions (
  id                  uuid PRIMARY KEY,
  visitor_id          text NOT NULL,
  title               text NOT NULL,
  workflow_session_id text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
```

Run this against your Neon database (through the Neon MCP in v0, the Neon
console SQL editor, or `psql "$DATABASE_URL"`).

### 5. Wire Drizzle

```bash
pnpm add pg drizzle-orm zod swr
pnpm add -D @types/pg
```

```ts
// lib/db/schema.ts
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"

export const chatSessions = pgTable("chat_sessions", {
  id: uuid("id").primaryKey(),
  visitorId: text("visitor_id").notNull(),
  title: text("title").notNull(),
  workflowSessionId: text("workflow_session_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})
```

```ts
// lib/db/index.ts
import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"
import * as schema from "./schema"

const globalForDatabase = globalThis as unknown as { pool?: Pool }

export const pool =
  globalForDatabase.pool ??
  new Pool({ connectionString: process.env.DATABASE_URL, max: 5 })

if (process.env.NODE_ENV !== "production") {
  globalForDatabase.pool = pool
}

export const db = drizzle(pool, { schema })
```

The `globalThis` cache stops Next.js dev hot-reloads from opening a new pool on
every save.

### 6. Expose a tiny history API

`app/api/chats/route.ts` has three handlers. Every query is scoped by
`visitor_id`, so one visitor can never list or edit another visitor's threads.

- `GET /api/chats` — list this visitor's conversations, newest first.
- `POST /api/chats` — create a row `{ id, title }`. The client generates the
  uuid so it can render optimistically. `onConflictDoNothing` makes retries safe.
- `PATCH /api/chats` — update `title` and/or `workflowSessionId`.

The visitor identity is an `httpOnly` cookie minted on first request:

```ts
const VISITOR_COOKIE = "orbit_visitor"

async function getVisitorId() {
  const cookieStore = await cookies()
  const existing = cookieStore.get(VISITOR_COOKIE)?.value
  if (existing) return existing

  const visitorId = crypto.randomUUID()
  cookieStore.set(VISITOR_COOKIE, visitorId, {
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 30,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  })
  return visitorId
}
```

If you add real auth, replace `getVisitorId()` with the session user id and
keep everything else.

### 7. Connect the UI to eve

The sidebar loads `/api/chats` with SWR. The thread component does the actual
linking. Three moments matter:

**a) Opening an existing thread.** Pass the stored session id back to eve and
ask it to resume. `streamIndex: 0` replays from the beginning.

```tsx
const agent = useEveAgent({
  initialSession: chat.workflowSessionId
    ? { sessionId: chat.workflowSessionId, streamIndex: 0 }
    : undefined,
  resume: Boolean(chat.workflowSessionId),
  // ...
})
```

**b) Capturing the session id on the first turn.** eve creates the session
when the first message is sent and reports it through `onSessionChange`. Save
it to the row right away so the thread is resumable even if the user closes
the tab mid-stream.

```tsx
onSessionChange(session) {
  if (!session || persistedSessionId.current === session.sessionId) return
  persistedSessionId.current = session.sessionId
  void fetch("/api/chats", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: chat.id, workflowSessionId: session.sessionId }),
  }).then(onHistoryChanged)
},
onFinish: onHistoryChanged,
```

**c) Creating the row on first send.** A "New conversation" is a local draft
until the user types. On the first submit, POST the row (title derived from the
prompt), then hand the prompt to eve.

```tsx
if (chat.draft) {
  const title = titleFromPrompt(prompt)
  const response = await fetch("/api/chats", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: chat.id, title }),
  })
  if (!response.ok) return
  onChatUpdated(await response.json())
}

await agent.send(prompt, isBusy ? { turnPolicy: "steer" } : undefined)
```

Render `<ChatThread key={selectedChat.id} />` so switching threads remounts
the hook with a fresh `initialSession`.

### 8. Verify

1. Send a message in a new thread; the sidebar entry appears with the prompt as title.
2. Reload the page; the thread is still listed.
3. Click it; the transcript replays from eve without a database read of messages.
4. Send another message; it continues the same eve session.

### Notes and limits

- eve sessions are resumable for 30 days by default. After that the row still
  exists but `resume` will start an empty thread. Add a cleanup job or show
  an "expired" state if that matters for you.
- Titles are the first 46 characters of the first prompt. Swap
  `titleFromPrompt` for a model call if you want generated titles.
- Deleting a conversation is just `DELETE FROM chat_sessions WHERE id = $1 AND
  visitor_id = $2`; the eve session ages out on its own.

---

## Deploy to Vercel

With `withEve`, the Next.js app and the agent build and ship as **one** Vercel
project. eve sessions run on managed Vercel Workflow in production, so there is
no extra service to host for the transcript side of the history feature.

### 1. Push the repo and import it

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new)

Import the repository at [vercel.com/new](https://vercel.com/new), or from the
CLI:

```bash
pnpm dlx vercel link   # once, links the folder to a Vercel project
pnpm dlx vercel        # preview deployment
pnpm dlx vercel --prod # production deployment
```

Leave the framework preset on **Next.js**. The build command must stay
`eve build && next build` (already set in `package.json`) so the `/eve/v1/*`
routes exist in the output. A plain `next build` deploys a frontend that has
nothing to talk to.

### 2. Add the Neon integration

In the Vercel project go to **Storage → Create Database → Neon** (or connect an
existing Neon project via the Marketplace). This injects `DATABASE_URL` into
every environment, which is all `lib/db/index.ts` needs.

Then create the history table once, in the Neon SQL editor or with `psql`:

```sql
CREATE TABLE IF NOT EXISTS chat_sessions (
  id                  uuid PRIMARY KEY,
  visitor_id          text NOT NULL,
  title               text NOT NULL,
  workflow_session_id text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
```

### 3. Environment variables

| Variable                     | Needed? | Notes                                                                                            |
| ---------------------------- | ------- | ------------------------------------------------------------------------------------------------ |
| `DATABASE_URL`               | yes     | Set by the Neon integration.                                                                     |
| `AI_GATEWAY_API_KEY`         | no      | Vercel AI Gateway authenticates via OIDC on Vercel deployments; nothing to add.                  |
| `ROUTE_AUTH_BASIC_PASSWORD`  | no      | Only if you switch the channel to `httpBasic()` (see below).                                     |

### 4. Decide who can reach the chat

`agent/channels/eve.ts` ends with `none()`, so the deployed chat is fully
public and anyone with the URL can talk to the agent. Two ways to lock it down:

- **Shared password** — swap `none()` for
  `httpBasic({ username: "demo", password: process.env.ROUTE_AUTH_BASIC_PASSWORD! })`
  and set that env var in Vercel.
- **Vercel Deployment Protection** — Project → Settings → Deployment
  Protection. Gates every page (and the `/eve/v1/*` routes) behind Vercel
  authentication or a password without touching code.

Whatever you pick, keep `vercelOidc()` and `localDev()` in front so previews
and local dev keep working.

### 5. Verify the deployment

1. Open the production URL, send a message, confirm a streamed reply.
2. `curl https://<your-app>.vercel.app/eve/v1/health` returns `200` (this
   route is always public).
3. Reload; the sidebar still lists the conversation and clicking it replays
   the transcript.
4. Project → **Workflows** in the Vercel dashboard shows one run per eve
   session if you want to inspect them.

### Gotchas

- `.eve/`, `.output/`, and `.vercel/` are git-ignored on purpose. Local dev
  writes thousands of stream-chunk files under `.eve/.workflow-data`; if a
  publish ever fails on file count, delete that directory (it is only local run
  state).
- If you put a proxy or rewrite in front of the app, forward both `/eve/` and
  `/.well-known/workflow/`. Runs stall without the second one.
- Node 24 is required; Vercel picks it up from `engines.node` in
  `package.json`.

## Project layout

```
agent/
  instructions.md        system prompt
  channels/eve.ts        public HTTP channel
app/
  page.tsx               renders <ChatWorkspace />
  api/chats/route.ts     GET / POST / PATCH history rows
components/
  chat-workspace.tsx     sidebar + thread, useEveAgent wiring
lib/db/
  index.ts               pg Pool + Drizzle client
  schema.ts              chat_sessions table
next.config.mjs          withEve(...)
```
