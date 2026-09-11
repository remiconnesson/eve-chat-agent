import { defineAgent, defineDynamic } from "eve"

import { defaultModelId, isModelId } from "./lib/models"

export default defineAgent({
  model: defineDynamic({
    events: {
      "turn.started": (_event, ctx) => {
        const requested = ctx.session.auth.current?.attributes.model
        return isModelId(requested) ? requested : defaultModelId
      },
    },
  }),
})
