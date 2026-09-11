import { desc, eq } from "drizzle-orm"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { z } from "zod"

import { db } from "@/lib/db"
import {
  CHAT_HISTORY_LIMIT,
  claimProductionSessionSlot,
  deleteSuppressedHistory,
  ensureChatHistorySchema,
  isConversationSuppressed,
  trimSharedHistory,
} from "@/lib/db/chat-history"
import { chatSessions } from "@/lib/db/schema"

const VISITOR_COOKIE = "orbit_visitor"

const createChatSchema = z.object({
  id: z.uuid(),
  title: z.string().trim().min(1).max(80),
})

const updateChatSchema = z.object({
  id: z.uuid(),
  title: z.string().trim().min(1).max(80).optional(),
  workflowSessionId: z.string().min(1).max(200).optional(),
})

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

export async function GET() {
  await ensureChatHistorySchema()
  await deleteSuppressedHistory()
  const chats = await db
    .select()
    .from(chatSessions)
    .orderBy(desc(chatSessions.updatedAt))
    .limit(CHAT_HISTORY_LIMIT)
  return NextResponse.json(chats)
}

export async function POST(request: Request) {
  const parsed = createChatSchema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: "Invalid chat details." }, { status: 400 })

  await ensureChatHistorySchema()
  const existing = await db.select().from(chatSessions).where(eq(chatSessions.id, parsed.data.id)).limit(1)
  if (existing[0]) return NextResponse.json(existing[0])

  if (!(await claimProductionSessionSlot())) {
    return NextResponse.json(
      { error: "The public demo is busy. Try again in a minute." },
      { status: 429, headers: { "Retry-After": "60" } }
    )
  }

  const visitorId = await getVisitorId()
  const [chat] = await db.insert(chatSessions).values({ id: parsed.data.id, title: parsed.data.title, visitorId }).returning()
  await trimSharedHistory()
  return NextResponse.json(chat, { status: 201 })
}

export async function PATCH(request: Request) {
  const parsed = updateChatSchema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: "Invalid chat update." }, { status: 400 })
  const [chat] = await db.update(chatSessions).set({
    ...(parsed.data.title ? { title: parsed.data.title } : {}),
    ...(parsed.data.workflowSessionId ? { workflowSessionId: parsed.data.workflowSessionId } : {}),
    updatedAt: new Date(),
  }).where(eq(chatSessions.id, parsed.data.id)).returning()
  if (!chat || await isConversationSuppressed(chat.workflowSessionId)) {
    return NextResponse.json({ error: "Chat not found." }, { status: 404 })
  }
  await trimSharedHistory()
  return NextResponse.json(chat)
}
