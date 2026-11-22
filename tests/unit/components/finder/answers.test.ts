// Answering Majnu's questions in one message (issue #82): picking answers,
// the profile field, and the message they make together.
import { describe, expect, it } from "vitest"
import {
  NO_PROFILE,
  OTHER_ANSWER,
  composeAnswers,
  pickedAnswer,
  finderReducer,
  hasAnswers,
  initialFinderState,
  openQuestions,
  showsProfileField,
  type FinderAction,
  type FinderState,
} from "@/components/finder/finder-state"
import type { FinderEvent } from "@/lib/finder/events"

function run(actions: FinderAction[], from: FinderState = initialFinderState()): FinderState {
  return actions.reduce(finderReducer, from)
}
const ev = (event: FinderEvent): FinderAction => ({ type: "event", event })

// Majnu asked two questions after "Personalise the gift", and the reply ended.
function asked(profileRead = false): FinderState {
  return run([
    { type: "send", text: "Personalise the gift" },
    ev({ type: "question", text: "What do they do in their free time?", label: "Free time", suggestions: ["Video games", "Football"], profileRead }),
    ev({ type: "question", text: "What's the occasion?", label: "Occasion", suggestions: ["Birthday", "Christmas"], profileRead }),
    ev({ type: "done" }),
  ])
}

const ids = (s: FinderState) => openQuestions(s.items).map((q) => q.id)

describe("picking answers", () => {
  it("picks one answer per question without sending, replaces it, and clears it when picked again", () => {
    let s = asked()
    const [a, b] = ids(s)
    s = run([{ type: "answer", itemId: a, value: "Video games" }], s)
    expect(s.answers).toEqual({ [a]: "Video games" })
    expect(s.items.filter((i) => i.role === "user")).toHaveLength(1)
    s = run([{ type: "answer", itemId: a, value: "Football" }, { type: "answer", itemId: b, value: "Birthday" }], s)
    expect(s.answers).toEqual({ [a]: "Football", [b]: "Birthday" })
    s = run([{ type: "answer", itemId: a, value: "Football" }], s)
    expect(s.answers).toEqual({ [b]: "Birthday" })
  })

  it("ignores answers that were not offered, to closed questions, or while Majnu is replying", () => {
    const s = asked()
    const [a] = ids(s)
    expect(run([{ type: "answer", itemId: a, value: "Knitting" }], s).answers).toEqual({})
    const replying = run([{ type: "send", text: "Something else" }], s)
    expect(run([{ type: "answer", itemId: a, value: "Football" }], replying).answers).toEqual({})
  })
})

describe("composeAnswers", () => {
  it("makes one message of the answers, the profile link and the typed words, in that order", () => {
    const s = asked()
    const [a, b] = ids(s)
    const picked = run(
      [
        { type: "answer", itemId: a, value: "Video games" },
        { type: "answer", itemId: b, value: "Birthday" },
        { type: "profile", link: "  https://www.instagram.com/natgeo/ " },
      ],
      s,
    )
    expect(composeAnswers(picked, "  she also loves ramen ")).toBe(
      "Free time: Video games. Occasion: Birthday. https://www.instagram.com/natgeo/ she also loves ramen",
    )
    expect(hasAnswers(picked)).toBe(true)
  })

  it("leaves out unanswered questions, and sends typed words alone when nothing was picked", () => {
    const s = asked()
    expect(composeAnswers(s, "Just find something")).toBe("Just find something")
    expect(hasAnswers(s)).toBe(false)
    const one = run([{ type: "answer", itemId: ids(s)[1], value: "Christmas" }], s)
    expect(composeAnswers(one, "")).toBe("Occasion: Christmas.")
  })

  it("uses the question itself when Majnu gave no label, and keeps an answer's own full stop", () => {
    const s = run([
      { type: "send", text: "Mama" },
      ev({ type: "question", text: "How old is she?", suggestions: ["About 60.", "70"] }),
      ev({ type: "done" }),
    ])
    const [q] = ids(s)
    expect(composeAnswers(run([{ type: "answer", itemId: q, value: "About 60." }], s), "")).toBe("How old is she? About 60.")
  })

  it("says No public profile when that was picked, and drops a link typed before", () => {
    const s = run([{ type: "profile", link: "@natgeo" }, { type: "profile", none: true }], asked())
    expect(s.profile).toEqual({ link: "", none: true })
    expect(composeAnswers(s, "")).toBe(`${NO_PROFILE}.`)
    // Typing a link again unpicks it.
    expect(run([{ type: "profile", link: "@natgeo" }], s).profile).toEqual({ link: "@natgeo", none: false })
  })
})

describe("the profile field", () => {
  it("ends every open question block until a profile was read or the visitor has none", () => {
    expect(showsProfileField(initialFinderState())).toBe(false)
    expect(showsProfileField(asked())).toBe(true)
    expect(showsProfileField(asked(true))).toBe(false)
    // With a profile read, a link in the field is not part of the message.
    expect(composeAnswers(run([{ type: "profile", link: "@natgeo" }], asked(true)), "")).toBe("")
  })

  it("stays after a profile was read while the session can read more, and takes several links in one answer (issue #89)", () => {
    // The server sends profileRead: false while another link can be read.
    const second = run(
      [{ type: "send", text: "instagram.com/natgeo", answered: true }, ev({ type: "question", text: "Budget?", label: "Budget", suggestions: ["Under 30 €"], profileRead: false }), ev({ type: "done" })],
      asked(),
    )
    expect(showsProfileField(second)).toBe(true)
    const links = run([{ type: "profile", link: "tiktok.com/@natgeo linkedin.com/in/lena-example" }], second)
    expect(composeAnswers(links, "")).toBe("tiktok.com/@natgeo linkedin.com/in/lena-example")
  })

  it("is not offered again once the visitor sent No public profile", () => {
    const declined = run([{ type: "profile", none: true }, { type: "send", text: "No public profile.", answered: true }], asked())
    expect(declined.profileDeclined).toBe(true)
    expect(declined.profile).toEqual({ link: "", none: false })
    const askedAgain = run([ev({ type: "question", text: "Budget?", label: "Budget", suggestions: ["Under 30 €"] }), ev({ type: "done" })], declined)
    expect(showsProfileField(askedAgain)).toBe(false)
  })
})

describe("sending the answers", () => {
  it("closes the questions and keeps what was picked, so they show as answered", () => {
    const s = asked()
    const [a] = ids(s)
    const picked = run([{ type: "answer", itemId: a, value: "Video games" }], s)
    const sent = run([{ type: "send", text: composeAnswers(picked, ""), answered: true }], picked)
    expect(openQuestions(sent.items)).toEqual([])
    expect(sent.answers).toEqual({ [a]: "Video games" })
    expect(sent.items.at(-1)).toMatchObject({ role: "user", text: "Free time: Video games." })
  })

  it("drops the picks when another message answers instead (a suggestion or Try again)", () => {
    const s = asked()
    const [a] = ids(s)
    const sent = run([{ type: "answer", itemId: a, value: "Video games" }, { type: "send", text: "Personalise the gift" }], s)
    expect(sent.answers).toEqual({})
  })

  it("forgets everything on a new search", () => {
    const s = run([{ type: "answer", itemId: ids(asked())[0], value: "Football" }, { type: "profile", none: true }], asked())
    const fresh = run([{ type: "reset" }], s)
    expect(fresh.answers).toEqual({})
    expect(fresh.profileDeclined).toBe(false)
  })
})

describe("the Other answer (issue #97)", () => {
  const free = (state: FinderState) => openQuestions(state.items)[0].id
  const occasion = (state: FinderState) => openQuestions(state.items)[1].id

  it("goes into the answers as 'other:' with the visitor's own words", () => {
    const start = asked(true)
    const state = run(
      [
        { type: "answer", itemId: free(start), value: OTHER_ANSWER },
        { type: "other", itemId: free(start), text: "  restores   old motorbikes " },
        { type: "answer", itemId: occasion(start), value: "Birthday" },
      ],
      start,
    )
    expect(pickedAnswer(state, free(start))).toBe("other: restores old motorbikes")
    expect(composeAnswers(state, "")).toBe("Free time: other: restores old motorbikes. Occasion: Birthday.")
    expect(hasAnswers(state)).toBe(true)
  })

  it("counts only once something is typed, and only while Other is picked", () => {
    const start = asked(true)
    const picked = run([{ type: "answer", itemId: free(start), value: OTHER_ANSWER }], start)
    expect(composeAnswers(picked, "")).toBe("")
    expect(hasAnswers(picked)).toBe(false)
    const typed = run([{ type: "other", itemId: free(start), text: "chess" }], picked)
    expect(composeAnswers(typed, "")).toBe("Free time: other: chess.")
    // Picking a suggestion instead drops the typed words from the message.
    const switched = run([{ type: "answer", itemId: free(start), value: "Football" }], typed)
    expect(composeAnswers(switched, "")).toBe("Free time: Football.")
  })

  it("takes nothing for a question that is not open, or while Majnu is replying", () => {
    const start = asked(true)
    expect(run([{ type: "other", itemId: "nope", text: "x" }], start).others).toEqual({})
    const busy = run([{ type: "send", text: "hi" }], start)
    expect(run([{ type: "other", itemId: free(start), text: "x" }], busy).others).toEqual({})
  })

  it("caps the typed answer", () => {
    const start = asked(true)
    const state = run([{ type: "other", itemId: free(start), text: "a".repeat(500) }], start)
    expect(state.others[free(start)]).toHaveLength(200)
  })
})

describe("the catalogue's instant ideas (issue #97)", () => {
  it("are marked, so the finder offers ideas made just for them under them", () => {
    const option = { id: "cat-a", title: "Buch", description: "Ein Buch.", reason: "Liest gern.", url: "https://shop.example/a" }
    const state = run([
      { type: "send", text: "für meine Mama" },
      ev({ type: "options", options: [option], recommendedId: "cat-a", why: "Liest gern.", source: "catalogue" }),
      { type: "send", text: "Personalise the gift" },
      ev({ type: "options", options: [option], recommendedId: "cat-a", why: "Weil." }),
    ])
    const options = state.items.filter((item) => item.role === "options")
    expect(options.map((item) => (item as { catalogue?: boolean }).catalogue)).toEqual([true, undefined])
  })
})
