import { forwardRef } from "react"
import { cn } from "@/lib/utils"

/**
 * Compact, borderless cell inputs for the dense POS grids. They sit flush in a
 * table cell, select-all on focus (fast over-typing), and never emit NaN.
 */

interface NumCellProps {
  value: number
  onChange: (n: number) => void
  step?: number
  min?: number
  className?: string
  placeholder?: string
  readOnly?: boolean
  "aria-label"?: string
}

export const NumCell = forwardRef<HTMLInputElement, NumCellProps>(
  function NumCell(
    { value, onChange, step = 0.001, min = 0, className, placeholder, readOnly, ...rest },
    ref,
  ) {
    return (
      <input
        ref={ref}
        type="number"
        inputMode="decimal"
        step={step}
        min={min}
        readOnly={readOnly}
        placeholder={placeholder}
        value={Number.isFinite(value) && value !== 0 ? value : value === 0 ? "0" : ""}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => {
          const v = e.target.valueAsNumber
          onChange(Number.isNaN(v) ? 0 : v)
        }}
        className={cn(
          "h-8 w-full bg-transparent px-1.5 text-right text-sm tabular outline-none",
          "focus:bg-accent/40 focus:ring-1 focus:ring-ring rounded-sm",
          readOnly && "text-muted-foreground",
          className,
        )}
        {...rest}
      />
    )
  },
)

interface TextCellProps {
  value: string
  onChange: (s: string) => void
  className?: string
  placeholder?: string
  "aria-label"?: string
}

export const TextCell = forwardRef<HTMLInputElement, TextCellProps>(
  function TextCell({ value, onChange, className, placeholder, ...rest }, ref) {
    return (
      <input
        ref={ref}
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "h-8 w-full bg-transparent px-1.5 text-sm outline-none",
          "focus:bg-accent/40 focus:ring-1 focus:ring-ring rounded-sm",
          className,
        )}
        {...rest}
      />
    )
  },
)
