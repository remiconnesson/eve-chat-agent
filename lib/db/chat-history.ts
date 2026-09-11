import { sql } from "drizzle-orm"

import { db } from "@/lib/db"

let schemaReady: Promise<void> | undefined

export function ensureChatHistorySchema() {
  schemaReady ??= (async () => {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS chat_history_suppressions (
        workflow_session_id text PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `)
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS chat_creation_buckets (
        bucket_start timestamptz PRIMARY KEY,
        creation_count integer NOT NULL DEFAULT 0,
        expires_at timestamptz NOT NULL
      )
    `)
  })()
  return schemaReady
}

export async function isConversationSuppressed(workflowSessionId: string | null) {
  if (!workflowSessionId) return false
  await ensureChatHistorySchema()
  const result = await db.execute<{ workflow_session_id: string }>(sql`
    SELECT workflow_session_id
    FROM chat_history_suppressions
    WHERE workflow_session_id = ${workflowSessionId}
    LIMIT 1
  `)
  return result.rows.length > 0
}

export async function suppressConversation(workflowSessionId: string) {
  await ensureChatHistorySchema()
  await db.execute(sql`
    INSERT INTO chat_history_suppressions (workflow_session_id)
    VALUES (${workflowSessionId})
    ON CONFLICT (workflow_session_id) DO NOTHING
  `)
  await db.execute(sql`
    DELETE FROM chat_sessions
    WHERE workflow_session_id = ${workflowSessionId}
  `)
}

export async function claimProductionSessionSlot() {
  if (process.env.NODE_ENV !== "production") return true
  await ensureChatHistorySchema()
  const result = await db.execute<{ creation_count: number }>(sql`
    INSERT INTO chat_creation_buckets (bucket_start, creation_count, expires_at)
    VALUES (date_trunc('minute', now()), 1, now() + interval '2 minutes')
    ON CONFLICT (bucket_start) DO UPDATE
      SET creation_count = chat_creation_buckets.creation_count + 1
    WHERE chat_creation_buckets.creation_count < 5
    RETURNING creation_count
  `)
  await db.execute(sql`DELETE FROM chat_creation_buckets WHERE expires_at < now()`)
  return result.rows.length > 0
}

export async function trimSharedHistory() {
  await db.execute(sql`
    DELETE FROM chat_sessions
    WHERE id IN (
      SELECT id FROM chat_sessions
      ORDER BY updated_at DESC
      OFFSET ${CHAT_HISTORY_LIMIT}
    )
  `)
}

export async function deleteSuppressedHistory() {
  await db.execute(sql`
    DELETE FROM chat_sessions
    WHERE workflow_session_id IN (SELECT workflow_session_id FROM chat_history_suppressions)
  `)
}

export const CHAT_HISTORY_LIMIT = 20
export const SESSION_RATE_LIMIT = 5
export const SESSION_RATE_WINDOW_SECONDS = 60
