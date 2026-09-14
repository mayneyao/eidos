import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { UsageMeter, formatUsageBytes, usagePercent } from "./usage-meter"

describe("Usage meter", () => {
  it("formats byte totals with binary units", () => {
    expect(formatUsageBytes(0)).toBe("0 B")
    expect(formatUsageBytes(512)).toBe("512 B")
    expect(formatUsageBytes(1024)).toBe("1.0 KiB")
    expect(formatUsageBytes(100 * 1024 * 1024)).toBe("100 MiB")
    expect(formatUsageBytes(1.5 * 1024 ** 3)).toBe("1.5 GiB")
  })

  it("clamps the used percentage", () => {
    expect(usagePercent(50, 100)).toBe(50)
    expect(usagePercent(200, 100)).toBe(100)
    expect(usagePercent(1, 0)).toBe(0)
  })

  it("renders used, reserved, and remaining segments", () => {
    const html = renderToStaticMarkup(
      <UsageMeter
        title="Sync storage"
        total={100}
        usedLabel="20 of 100 used"
        freeLabel="Free"
        formatValue={(value) => String(value)}
        segments={[
          { key: "used", label: "Used", value: 15, tone: "accent" },
          { key: "reserved", label: "Reserved", value: 5, tone: "muted" },
        ]}
      />
    )
    expect(html).toContain("Sync storage")
    expect(html).toContain("20 of 100 used")
    expect(html).toContain("usage-meter-segment is-accent")
    expect(html).toContain("usage-meter-segment is-muted")
    expect(html).toContain("usage-meter-segment is-free")
    expect(html).toContain("Free")
  })
})
