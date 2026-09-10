import { and, desc, eq } from "drizzle-orm"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { z } from "zod"

import { db } from "@/lib/db"
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
  const visitorId = await getVisitorId()
  const chats = await db
    .select()
    .from(chatSessions)
    .where(eq(chatSessions.visitorId, visitorId))
    .orderBy(desc(chatSessions.updatedAt))
    .limit(40)

  return NextResponse.json(chats)
}

export async function POST(request: Request) {
  const parsed = createChatSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid chat details." }, { status: 400 })
  }

  const visitorId = await getVisitorId()
  const [chat] = await db
    .insert(chatSessions)
    .values({
      id: parsed.data.id,
      title: parsed.data.title,
      visitorId,
    })
    .onConflictDoNothing()
    .returning()

  if (!chat) {
    const [existing] = await db
      .select()
      .from(chatSessions)
      .where(
        and(
          eq(chatSessions.id, parsed.data.id),
          eq(chatSessions.visitorId, visitorId)
        )
      )
      .limit(1)

    if (!existing) {
      return NextResponse.json({ error: "Chat already exists." }, { status: 409 })
    }
    return NextResponse.json(existing)
  }

  return NextResponse.json(chat, { status: 201 })
}

export async function PATCH(request: Request) {
  const parsed = updateChatSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid chat update." }, { status: 400 })
  }

  const visitorId = await getVisitorId()
  const [chat] = await db
    .update(chatSessions)
    .set({
      ...(parsed.data.title ? { title: parsed.data.title } : {}),
      ...(parsed.data.workflowSessionId
        ? { workflowSessionId: parsed.data.workflowSessionId }
        : {}),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(chatSessions.id, parsed.data.id),
        eq(chatSessions.visitorId, visitorId)
      )
    )
    .returning()

  if (!chat) {
    return NextResponse.json({ error: "Chat not found." }, { status: 404 })
  }

  return NextResponse.json(chat)
}
