"use client"

import { ChevronDownIcon, CpuIcon } from "lucide-react"

import { isModelId, models, type ModelId } from "@/agent/lib/models"

export function ModelPicker({
  value,
  onChange,
  disabled,
}: {
  value: ModelId
  onChange: (model: ModelId) => void
  disabled?: boolean
}) {
  return (
    <label className="relative flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground has-focus-visible:ring-2 has-focus-visible:ring-ring">
      <CpuIcon className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="sr-only">Model</span>
      <select
        aria-label="Model"
        className="appearance-none bg-transparent pr-4 font-mono text-[11px] outline-none disabled:cursor-not-allowed disabled:opacity-60"
        disabled={disabled}
        onChange={(event) => {
          if (isModelId(event.target.value)) onChange(event.target.value)
        }}
        value={value}
      >
        {models.map((model) => (
          <option key={model.id} value={model.id}>
            {model.vendor} · {model.label}
          </option>
        ))}
      </select>
      <ChevronDownIcon
        className="pointer-events-none absolute right-2 size-3 shrink-0"
        aria-hidden="true"
      />
    </label>
  )
}
