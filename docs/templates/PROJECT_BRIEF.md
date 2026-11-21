# Project Brief: 3D Invitation & Gift Templates (Three.js)

## Goal
Interactive 3D digital invitation and gift-card templates, built with Three.js, that you can personalize and share. There are three templates:

1. **Wedding invitation**: an envelope with a wax seal. The seal breaks, the flap opens, the card slides out and moves toward the camera, and rose petals fall.
2. **Party invitation**: a festive box squashes, then the lid pops off. Confetti bursts out, balloons rise, and the card springs up.
3. **Gift card**: a box wrapped in ribbon. The bow unties, the lid floats away, the sides fold open, and the card rises in a trail of sparkles.

Every template has a click-to-reveal moment ("Tap to open"), works on phones, and builds all its 3D shapes in code, so there are no model files.

## Decisions made with the user
- **Stack:** Vite + vanilla Three.js (no React).
- **Customization:** one JSON config file per template (names, date, time, venue, message, RSVP link, colors). There's no editor form yet.
- **Experience:** an interactive reveal animation, not just a static scene.

## Current state (written, NOT yet run or tested)
```
package.json, vite.config.js        Vite + three; builds both index and template pages
index.html                          landing page: pick a template
template.html                       renders ?t=wedding|party|gift, hint text, RSVP button
public/config/{wedding,party,gift}.json   editable content and colors
src/main.js                         loads config, builds card texture, starts template, click handling
src/core/scene.js                   renderer, camera, lights, shadow floor, pointer parallax, render loop
src/core/tween.js                   tiny tween/easing engine
src/core/cardTexture.js             draws invitation text onto a canvas and returns the card mesh
src/core/particles.js               particle effects: petals (falling), confetti and sparkles (bursts)
src/core/box.js                     open-top box with folding side walls, hinged lid, ribbon, bow
src/core/reveal.js                  moves the card to the front of the camera; idle float
src/templates/{wedding,party,gift}.js   each template's scene and open() animation
```

## Blockers from the previous session
- Node.js and npm were **not installed** on the machine (`npm: command not found`). Install them (Node 18 or newer).
- The previous Claude session couldn't run shell commands: its sandbox failed with an `apply-seccomp … nested userns` error. The sandbox has since been turned off in `~/.claude/settings.json`, so a new session should be able to run commands.

## Next steps
1. Install Node.js and run `npm install`.
2. Run `npm run dev` and open each template (`template.html?t=wedding`, `?t=party`, `?t=gift`).
3. Click to reveal each one and fix any runtime errors, then check the card's final framing and size, the animation timing, and the layout on a phone-sized screen.
4. Polish the visuals (lighting, materials, colors, fonts) until it looks premium.
5. Possible later work: an editor form or shareable URL for personalization, background music, more templates (Eid, birthday, baby shower), and deployment (e.g. Vercel or Netlify).
