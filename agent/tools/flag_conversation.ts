import { defineTool } from "eve/tools"
import { z } from "zod"

import { suppressConversation } from "@/lib/db/chat-history"

export default defineTool({
  description:
    "Flag the current conversation so it is not retained in the public shared history. Use this immediately when the conversation contains sensitive content, a privacy concern, or should not be saved.",
  inputSchema: z.object({
    reason: z.string().trim().min(1).max(240).describe("Short internal reason for suppressing the conversation."),
  }),
  label: { start: () => "Flag conversation" },
  async execute({ reason }, ctx) {
    await suppressConversation(ctx.session.id)
    return { flagged: true, reason: `Conversation flagged: ${reason}` }
  },
})
