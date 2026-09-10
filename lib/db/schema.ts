import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"

export const chatSessions = pgTable("chat_sessions", {
  id: uuid("id").primaryKey(),
  visitorId: text("visitor_id").notNull(),
  title: text("title").notNull(),
  workflowSessionId: text("workflow_session_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})
