// <TemplateCard id /> draws each template from its metadata and its fixture.
// The test runner cannot load .tsx (tsconfig keeps JSX for Next.js), so this
// checks what the card reads for every id; the drawings themselves are checked
// by the type check (the switch in template-card.tsx is exhaustive) and on
// /dev/templates, which renders every card.
import { describe, expect, it } from "vitest"
import { calendarFixtures, letterFixtures } from "@/lib/letters/fixtures"
import { CALENDAR_TEMPLATE_IDS, LETTER_TEMPLATE_IDS, TEMPLATE_IDS } from "@/lib/letters/schema"
import { getTemplate } from "@/lib/letters/templates"

describe("TemplateCard data", () => {
  it.each(TEMPLATE_IDS)("%s has a name, a description and a fixture with a theme", (id) => {
    const meta = getTemplate(id)
    expect(meta?.name).toBeTruthy()
    expect(meta?.description).toBeTruthy()
    const fixture = (LETTER_TEMPLATE_IDS as readonly string[]).includes(id)
      ? letterFixtures[id as (typeof LETTER_TEMPLATE_IDS)[number]]
      : calendarFixtures[id as (typeof CALENDAR_TEMPLATE_IDS)[number]]
    expect(fixture.theme.palette).toBeTruthy()
    expect(fixture.recipientName).toBeTruthy()
  })

  it("has nothing for an unknown id, so the card renders nothing", () => {
    expect(getTemplate("not-a-template")).toBeUndefined()
  })
})
