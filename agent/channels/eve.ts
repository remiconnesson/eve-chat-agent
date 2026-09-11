import type { AuthFn } from "eve/channels/auth"
import { eveChannel } from "eve/channels/eve"

import { defaultModelId, isModelId, MODEL_HEADER } from "../lib/models"

// Public demo: every caller is accepted, but the model the browser picked is
// carried on the principal so the dynamic model resolver can read it per turn.
const publicWithModelChoice: AuthFn<Request> = (request) => {
  const requested = request.headers.get(MODEL_HEADER)
  return {
    authenticator: "orbit-public",
    principalId: "anonymous",
    principalType: "user",
    attributes: { model: isModelId(requested) ? requested : defaultModelId },
  }
}

export default eveChannel({
  auth: publicWithModelChoice,
})
