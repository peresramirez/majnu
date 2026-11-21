// One realistic example per template. Used by /dev/templates, by the stubbed
// getPublicLetter() for the demo slugs, and by tests.
import type { CalendarContent, CalendarTemplateId, LetterContent, LetterTemplateId } from "./schema"

export const letterFixtures: Record<LetterTemplateId, LetterContent> = {
  "classic-envelope": {
    recipientName: "Anna",
    senderName: "Javier",
    occasion: "Birthday",
    headline: "Happy birthday, Anna",
    body: [
      "Thirty looks good on you. I still remember the night we got lost in Lisbon and you insisted the moon would guide us home. It didn't, but the walk was the best part of the trip.",
      "Thank you for every late call, every bad joke and every time you knew what I needed before I did.",
      "Here's to a year as bright as you are.",
    ],
    signOff: "With all my love",
    theme: { palette: "night", font: "serif" },
    gifts: [],
  },
  "gift-reveal": {
    recipientName: "Tom",
    senderName: "Lea and Max",
    occasion: "Thank you",
    headline: "A little thank-you",
    body: ["You fed our cat for three weeks and watered every plant. The least we can do is send you somewhere to relax."],
    signOff: "Love, Lea and Max",
    theme: { palette: "rose", font: "sans" },
    gifts: [
      {
        title: "Spa day for two",
        description: "A full day at Vabali Spa Berlin, saunas and garden included.",
        url: "https://example.com/redeem",
        code: "VBL-7Q2K-9XMA",
        price: "€90",
      },
    ],
  },
  "wedding-invite": {
    recipientName: "Sophie",
    senderName: "Clara and Ben",
    occasion: "Wedding",
    headline: "We're getting married",
    body: ["We would love you to be there when we say yes. Dinner and dancing follow until late."],
    signOff: "Clara and Ben",
    theme: { palette: "ink", font: "serif" },
    gifts: [],
    event: {
      title: "Clara and Ben's wedding",
      startsAt: "2027-06-12T15:00:00+02:00",
      locationName: "Gut Sarnow",
      address: "Dorfstraße 1, 17398 Sarnow, Germany",
    },
    wishlist: [
      { id: "fxwed01", title: "Cast-iron casserole", description: "The deep round one, in cream.", price: "€180" },
      { id: "fxwed02", title: "Linen bedding", description: "Double size, in sage or white.", price: "€140" },
      { id: "fxwed03", title: "A night in Lisbon", description: "Towards our honeymoon hotel.", price: "€120" },
    ],
  },
  "party-invite": {
    recipientName: "Everyone",
    senderName: "Mia",
    occasion: "Birthday party",
    headline: "Mia turns 25",
    body: ["Pizza, music and a terrible playlist. Bring yourself and maybe a friend."],
    signOff: "See you there",
    theme: { palette: "petal", font: "sans" },
    gifts: [],
    event: {
      title: "Mia's 25th",
      startsAt: "2026-12-05T20:00:00+01:00",
      locationName: "Mia's flat",
      address: "Oranienstraße 25, 10999 Berlin, Germany",
    },
    wishlist: [
      { id: "fxpty01", title: "Polaroid film", description: "Two packs for the party camera.", price: "€30" },
      { id: "fxpty02", title: "A vinyl for the record player", description: "Anything you would dance to.", price: "about €25" },
      { id: "fxpty03", title: "Pasta-making class", description: "One evening for two, in Kreuzberg.", price: "€65" },
    ],
  },
  postcard: {
    recipientName: "Grandma",
    senderName: "Leo",
    occasion: "Thinking of you",
    headline: "Greetings from Porto",
    body: ["The tiles here are as blue as your kitchen. I ate a custard tart for you. Back on Sunday."],
    signOff: "Hugs, Leo",
    theme: { palette: "sage", font: "script" },
    gifts: [],
  },
}

const adventNotes = [
  "The first door. Twenty-four small reasons to smile, starting now.",
  "Remember our first coffee? You ordered for both of us.",
  "Tonight: blankets, tea and the film you keep quoting.",
  "You make ordinary Tuesdays feel like holidays.",
  "A song for today: the one from the car in August.",
  "Saint Nicholas left something in your shoe. Go and look.",
  "Halfway through the first week. Proud of you.",
  "I love the way you laugh at your own jokes before the punchline.",
  "Plan for Saturday: the Christmas market, my treat.",
  "Ten days in. Ten things I'd pick you for, every time.",
  "Today you get to choose dinner. Anything at all.",
  "A memory: the snow in Prague and your frozen fingers.",
  "Look up tonight. Same moon, thinking of you.",
  "Two weeks. You're doing great at this whole December thing.",
  "Breakfast in bed is booked for tomorrow.",
  "I still have the note you left on the fridge in March.",
  "One week to go. Start packing your favourite socks.",
  "You deserve a quiet evening. It's yours.",
  "Our next trip starts in this door. Where to?",
  "Four more sleeps.",
  "The shortest day of the year, the longest hug.",
  "Wrap something silly for me. I'll do the same.",
  "Tomorrow is Christmas Eve. Thank you for this year.",
  "Merry Christmas. Every door led here: to you.",
]

export const calendarFixtures: Record<CalendarTemplateId, CalendarContent> = {
  "advent-classic": {
    recipientName: "Lena",
    senderName: "Jonas",
    headline: "24 days of us",
    intro: "One door a day until Christmas. No peeking ahead: they open at midnight.",
    startDate: "2026-12-01",
    timezone: "Europe/Berlin",
    theme: { palette: "night", font: "serif" },
    doors: adventNotes.map((message, i) => ({
      day: i + 1,
      title: `Day ${i + 1}`,
      message,
      ...(i === 5
        ? { gift: { title: "Chocolate from Rausch", code: "RSCH-NIKO-06", description: "Pick it up at the Gendarmenmarkt shop." } }
        : {}),
    })),
  },
  countdown: {
    recipientName: "Sam",
    senderName: "Alex",
    headline: "Seven days to Lisbon",
    intro: "A door a day until we fly.",
    startDate: "2027-03-01",
    timezone: "Europe/Berlin",
    theme: { palette: "sage", font: "sans" },
    doors: [
      { day: 1, title: "Seven", message: "Find your passport. Seriously, today." },
      { day: 2, title: "Six", message: "Learn one word of Portuguese: saudade." },
      { day: 3, title: "Five", message: "Playlist for the flight, your turn to pick." },
      { day: 4, title: "Four", message: "Pastéis de nata count so far: zero. That changes soon." },
      { day: 5, title: "Three", message: "Pack light. Leave room for tiles." },
      { day: 6, title: "Two", message: "Tram 28 tickets are booked.", gift: { title: "Tram 28 day pass", code: "LX-TRAM-28" } },
      { day: 7, title: "One", message: "Tomorrow we fly. Sleep well." },
    ],
  },
}

// Slugs that always resolve to fixtures, so templates can be built before the database exists.
export const demoSlugs = {
  "demo-letter": { kind: "letter", templateId: "classic-envelope" },
  "demo-gift": { kind: "letter", templateId: "gift-reveal" },
  "demo-calendar": { kind: "calendar", templateId: "advent-classic" },
} as const
