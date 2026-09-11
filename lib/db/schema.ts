import { integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"

export const chatSessions = pgTable("chat_sessions", {
  id: uuid("id").primaryKey(),
  visitorId: text("visitor_id").notNull(),
  title: text("title").notNull(),
  workflowSessionId: text("workflow_session_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

export const chatHistorySuppressions = pgTable("chat_history_suppressions", {
  workflowSessionId: text("workflow_session_id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

export const chatCreationBuckets = pgTable("chat_creation_buckets", {
  bucketStart: timestamp("bucket_start", { withTimezone: true }).primaryKey(),
  creationCount: integer("creation_count").notNull().default(0),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
})
