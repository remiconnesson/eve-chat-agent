export const MODEL_HEADER = "x-orbit-model"

export const models = [
  {
    id: "meta/muse-spark-1.3-contributor",
    label: "Muse Spark 1.3",
    vendor: "Meta",
  },
  {
    id: "inception/mercury-2.5",
    label: "Mercury 2.5",
    vendor: "Inception",
  },
  {
    id: "deepseek/deepseek-v4.1-flash",
    label: "DeepSeek V4.1 Flash",
    vendor: "DeepSeek",
  },
] as const

export type ModelId = (typeof models)[number]["id"]

export const defaultModelId: ModelId = models[0].id

export function isModelId(value: unknown): value is ModelId {
  return models.some((model) => model.id === value)
}
