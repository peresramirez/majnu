import { describe, expect, it } from "vitest"
import { displayName } from "@/components/app/format"

describe("displayName", () => {
  it("capitalises a single word typed in lower case", () => {
    expect(displayName("patricia")).toBe("Patricia")
    expect(displayName("  mama ")).toBe("Mama")
    expect(displayName("ülkü")).toBe("Ülkü")
    expect(displayName("anne-marie")).toBe("Anne-marie")
  })

  it("leaves everything else as the sender typed it", () => {
    expect(displayName("Patricia")).toBe("Patricia")
    expect(displayName("our friends")).toBe("our friends")
    expect(displayName("van der Berg")).toBe("van der Berg")
    expect(displayName("Mia & Leo")).toBe("Mia & Leo")
    expect(displayName("mcKenzie")).toBe("mcKenzie")
    expect(displayName("j.")).toBe("j.")
  })
})
