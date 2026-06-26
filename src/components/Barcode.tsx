import { useEffect, useRef } from "react"
import JsBarcode from "jsbarcode"

/**
 * Renders a scannable Code128 barcode as crisp SVG (prints sharply on any
 * printer / thermal label). Used by the jewellery tag labels.
 */
export function Barcode({
  value,
  height = 28,
  width = 1.4,
  fontSize = 10,
  displayValue = true,
  className,
}: {
  value: string
  height?: number
  width?: number
  fontSize?: number
  displayValue?: boolean
  className?: string
}) {
  const ref = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (!ref.current || !value) return
    try {
      JsBarcode(ref.current, value, {
        format: "CODE128",
        height,
        width,
        fontSize,
        displayValue,
        margin: 2,
        background: "#ffffff",
        lineColor: "#000000",
      })
    } catch {
      /* invalid value — leave blank */
    }
  }, [value, height, width, fontSize, displayValue])

  return <svg ref={ref} className={className} />
}
