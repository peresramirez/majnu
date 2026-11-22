# Pitch script

The spoken script for Majnu's two-minute pitch, slide by slide. The deck is at [majnu.app/pitch](https://majnu.app/pitch) (the password is the domain name; how the deck works is in [features/pitch-deck.md](features/pitch-deck.md)). The same words are the speaker notes in the deck's presenter view, and a unit test keeps the two identical, so change them in [`lib/pitch/notes.ts`](../lib/pitch/notes.ts) and here together.

The eight main slides come to about 270 words: two minutes at a calm pace, roughly 15 seconds a slide. Speak to one person in the room, as the brand does.

## Presenting

- Open the deck on the laptop that drives the projector, press **F** for full screen and **N** for the notes. The notes show under the slide on your screen; with the projector mirrored, open the notes only on a second screen or leave them off.
- **→**, **Space**, **PageDown** or a click on the right of the screen moves on; **←**, **PageUp** or a click on the left goes back. **Home** and **End** jump to the first and last slide. Most presentation clickers send PageUp and PageDown.
- The clock in the notes starts when you open them. Click it to start again from 0:00 just before you begin.
- The address follows the slide: `majnu.app/pitch#8` opens the last slide. The appendix (slides 9 to 11: the agents and the data, the launch film, the poster and the posts) is after the last slide, for questions.
- To print or save a PDF, use the browser's print dialog: one slide per landscape page.

## The script

| Slide | Time | |
|---|---|---|
| 1. Majnu | 0:00 | This is Majnu. Tell it who a gift is for, and it finds the right gift and wraps it in a page made for that one person. |
| 2. Have you ever wondered | 0:12 | Have you ever wondered what to get someone who already has everything? How to make a gift more personal, or truly memorable? Gifting should be about creating memories, not just buying presents. |
| 3. The problem | 0:27 | But finding the perfect gift isn't easy. You need inspiration, a way to make it theirs, and time to find and organise it all. So we often pick something ordinary. |
| 4. How Majnu works | 0:41 | With Majnu, you say who it's for: in words, by voice, with their Instagram, TikTok or LinkedIn, or a photo. Majnu builds their profile, asks a few quick questions, and finds six real gifts from real shops, one recommended. It wraps it in a page made for them, and you see when they open it. |
| 5. More than a card | 1:04 | And it's more than a card. An advent calendar gives one gift, a surprise every day, filled door by door. Next come experiences and travel, potentially with partners such as Expedia and Layla. |
| 6. How it works inside | 1:19 | Inside, Majnu's agents run on Claude. They build the person's profile, research the web, recommend gifts and write the page. Stripe takes payments, and Claude Code designs each personalised wrapper in a Daytona sandbox. |
| 7. The model and the vision | 1:35 | Finding, wrapping and sending are free, with no account. A free account keeps your gifts and the tracker. A one-of-a-kind wrapper is €2.99, once. Our vision: make thoughtful, personal gifts easy for everyone. |
| 8. Majnu + Layla | 1:50 | And the name? In the old love story, Majnu wrote poems for Layla. Layla plans the journey, and Majnu finds the gift. Scan the code to try it. Thank you. |

On slide 8 the moon travels from Majnu's hands to Layla's over the painting: let it land before "Majnu finds the gift".

## For questions

**Appendix, the agents and the data:** For questions. The finder agent has three tools: read a public profile into a profile of the person, ask one round of quick questions, or find six gifts through a research sub-agent that searches the web. The builder writes the page into a template. Everything is stored in Supabase behind row-level security, and a paid wrapper goes from Stripe through a Cloudflare Queue to Claude Code in a Daytona sandbox.

**Appendix, the launch film:** What we post at launch. The film shows the app in 36 seconds: say who it's for, choose a gift, wrap it and send the link.

**Appendix, the poster and the posts:** The printed poster, with a code for a free personalised wrapper for the first 100 people, and two posts for social: who is the gift for, and the three steps.
