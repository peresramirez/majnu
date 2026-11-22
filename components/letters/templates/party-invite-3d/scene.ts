// The three.js scene of party-invite-3d: a ticket to the party, hovering.
// Tapping tears the stub off along the perforation (it tumbles away), two
// cannons fire confetti that flutters down and settles on the floor, and the
// ticket flips to show when and where. Every shape and word is drawn in code:
// no model files, no textures or fonts from other sites.
//
// Only ../party-invite-3d.tsx loads this module, and only with import().
import * as THREE from "three"
import { fitDistance } from "../three-kit/fit"
import { drawStack, loadFaces, paperCanvas, type PaperColors, type PaperFonts } from "../three-kit/paper"
import { addPaperLights, blobShadow, createFlakes, createStage, ease, fitTexture, lerp, slab, textureOf } from "../three-kit/stage"
import type { TicketWords } from "./words"

export type TicketSceneOptions = {
  colors: PaperColors
  fonts: PaperFonts
  words: TicketWords
  onTap: () => void
  onLost: () => void
}

export type TicketScene = { open: () => Promise<void>; dispose: () => void }

// The ticket, in scene units: a tall body and a stub below the perforation.
const W = 1.25
const BODY = 1.85
const STUB = 0.62
const NOTCH = 0.09
const DEPTH = 0.02
const PX_PER_UNIT = 560
const FLOOR = -1.75

// The body's outline: round corners at the top, half-round notches at the perforation.
function bodyShape(): THREE.Shape {
  const s = new THREE.Shape()
  const x = W / 2
  const r = 0.08
  s.moveTo(-x, 0 + NOTCH)
  s.absarc(-x, 0, NOTCH, Math.PI / 2, 0, true)
  s.lineTo(x - NOTCH, 0)
  s.absarc(x, 0, NOTCH, Math.PI, Math.PI / 2, true)
  s.lineTo(x, BODY - r)
  s.quadraticCurveTo(x, BODY, x - r, BODY)
  s.lineTo(-x + r, BODY)
  s.quadraticCurveTo(-x, BODY, -x, BODY - r)
  s.lineTo(-x, NOTCH)
  return s
}

function stubShape(): THREE.Shape {
  const s = new THREE.Shape()
  const x = W / 2
  const r = 0.08
  s.moveTo(-x, -NOTCH)
  s.lineTo(-x, -STUB + r)
  s.quadraticCurveTo(-x, -STUB, -x + r, -STUB)
  s.lineTo(x - r, -STUB)
  s.quadraticCurveTo(x, -STUB, x, -STUB + r)
  s.lineTo(x, -NOTCH)
  s.absarc(x, 0, NOTCH, -Math.PI / 2, -Math.PI, true)
  s.lineTo(-x + NOTCH, 0)
  s.absarc(-x, 0, NOTCH, 0, -Math.PI / 2, true)
  return s
}

function canvasFor(h: number, color: string) {
  return paperCanvas(Math.round(W * PX_PER_UNIT), Math.round(h * PX_PER_UNIT), color)
}

// The front of the body: a band in the accent colour, then who it is for.
function frontTexture(words: TicketWords, c: PaperColors, f: PaperFonts) {
  const { canvas, ctx } = canvasFor(BODY, c.paper)
  const w = canvas.width
  const h = canvas.height
  ctx.fillStyle = c.accent
  ctx.fillRect(0, 0, w, 150)
  drawStack(ctx, [{ kind: "text", text: "Admit one", font: `700 30px ${f.body}`, color: c.deep, lineHeight: 40, spacing: "10px", upper: true }], w / 2, 0, 150, w - 80)
  // Dots along the perforation edge.
  ctx.fillStyle = c.paperMuted
  for (let x = 70; x < w - 50; x += 26) {
    ctx.beginPath()
    ctx.arc(x, h - 6, 4, 0, Math.PI * 2)
    ctx.fill()
  }
  drawStack(
    ctx,
    [
      { kind: "text", text: words.occasion, font: `600 26px ${f.body}`, color: c.paperMuted, lineHeight: 38, spacing: "6px", upper: true, maxLines: 1 },
      { kind: "gap", height: 16 },
      { kind: "text", text: words.forName, font: `${f.displayWeight} ${f.script ? 92 : 80}px ${f.display}`, color: c.paperAccent, lineHeight: f.script ? 96 : 86, maxLines: 2 },
      { kind: "gap", height: 26 },
      { kind: "rule", color: c.paperAccent, width: 240 },
      { kind: "gap", height: 26 },
      { kind: "text", text: words.headline, font: `${f.script ? "" : "italic "}${f.displayWeight} 48px ${f.display}`, color: c.paperInk, lineHeight: 58, maxLines: 4 },
      { kind: "gap", height: 30 },
      { kind: "text", text: words.from, font: `400 28px ${f.body}`, color: c.paperMuted, lineHeight: 38, maxLines: 1 },
    ],
    w / 2,
    170,
    h - 40,
    w - 110,
  )
  return canvas
}

// The back: when and where, in big type.
function backTexture(words: TicketWords, c: PaperColors, f: PaperFonts) {
  const { canvas, ctx } = canvasFor(BODY, c.deep)
  const w = canvas.width
  const h = canvas.height
  ctx.strokeStyle = c.accent
  ctx.lineWidth = 4
  ctx.setLineDash([14, 10])
  ctx.strokeRect(28, 28, w - 56, h - 56)
  ctx.setLineDash([])
  drawStack(
    ctx,
    words.date
      ? [
          { kind: "text", text: words.title, font: `${f.displayWeight} 60px ${f.display}`, color: c.accent, lineHeight: 68, maxLines: 3 },
          { kind: "gap", height: 36 },
          { kind: "text", text: words.weekday, font: `600 26px ${f.body}`, color: c.deepInk, lineHeight: 36, spacing: "8px", upper: true, maxLines: 1 },
          { kind: "text", text: words.date, font: `${f.displayWeight} 72px ${f.display}`, color: c.deepInk, lineHeight: 84, maxLines: 1 },
          { kind: "text", text: words.time, font: `600 40px ${f.body}`, color: c.deepInk, lineHeight: 52, maxLines: 1 },
          { kind: "gap", height: 36 },
          { kind: "rule", color: c.accent, width: 200 },
          { kind: "gap", height: 36 },
          { kind: "text", text: words.place, font: `${f.displayWeight} 48px ${f.display}`, color: c.deepInk, lineHeight: 56, maxLines: 2 },
          { kind: "text", text: words.address, font: `400 26px ${f.body}`, color: c.deepInk, lineHeight: 36, maxLines: 2 },
        ]
      : [{ kind: "text", text: words.headline, font: `${f.displayWeight} 64px ${f.display}`, color: c.deepInk, lineHeight: 74, maxLines: 4 }],
    w / 2,
    40,
    h - 40,
    w - 120,
  )
  return canvas
}

function stubTexture(words: TicketWords, c: PaperColors, f: PaperFonts) {
  const { canvas, ctx } = canvasFor(STUB, c.paper)
  const w = canvas.width
  const h = canvas.height
  ctx.fillStyle = c.paperMuted
  for (let x = 70; x < w - 50; x += 26) {
    ctx.beginPath()
    ctx.arc(x, 6, 4, 0, Math.PI * 2)
    ctx.fill()
  }
  // A barcode-like row of bars, from the name, so each ticket has its own.
  ctx.fillStyle = c.paperInk
  let x = 80
  for (let i = 0; x < w - 80; i++) {
    const code = words.forName.charCodeAt(i % Math.max(1, words.forName.length)) || 7
    const bar = 3 + (code % 4) * 3
    ctx.fillRect(x, 60, bar, 120)
    x += bar + 4 + ((code >> 2) % 3) * 3
  }
  drawStack(ctx, [{ kind: "text", text: words.number, font: `600 28px ${f.body}`, color: c.paperMuted, lineHeight: 40, spacing: "8px", upper: true, maxLines: 1 }], w / 2, 190, h - 20, w - 80)
  return canvas
}

export async function createTicketScene(container: HTMLElement, opts: TicketSceneOptions): Promise<TicketScene> {
  const { colors: c, fonts: f, words } = opts
  const stage = createStage(container, {
    onTap: opts.onTap,
    onLost: opts.onLost,
    lift: 0.3,
    lookAt: new THREE.Vector3(0, 0.05, 0),
    distance: (aspect) => fitDistance(W / 2 + 0.32, (BODY + STUB) / 2 + 0.75, aspect, 4.4),
  })
  const { scene, renderer, tweens, camera } = stage
  addPaperLights(scene, c.wrapShade, c.accentSoft)

  await loadFaces(f)
  if (stage.disposed) throw new Error("disposed")

  const tex = (canvas: HTMLCanvasElement, h: number, cy: number) => {
    const t = textureOf(canvas, renderer)
    fitTexture(t, W, h, 0, cy)
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.75 })
  }
  const edge = new THREE.MeshStandardMaterial({ color: c.accent, roughness: 0.6 })
  const ticket = new THREE.Group()
  // Body above the perforation, stub below; the whole ticket centred a little
  // low, clear of the heading above it and the button below.
  const restY = -(BODY - STUB) / 2 - 0.2
  ticket.position.y = restY
  ticket.scale.setScalar(0.88)
  scene.add(ticket)
  const body = slab({ shape: bodyShape(), depth: DEPTH, front: tex(frontTexture(words, c, f), BODY, BODY / 2), back: tex(backTexture(words, c, f), BODY, BODY / 2), edge })
  ticket.add(body)
  const stub = new THREE.Group()
  stub.add(slab({ shape: stubShape(), depth: DEPTH, front: tex(stubTexture(words, c, f), STUB, -STUB / 2), back: new THREE.MeshStandardMaterial({ color: c.accent, roughness: 0.7 }), edge }))
  ticket.add(stub)

  const shadow = blobShadow(1.1, 0.3)
  shadow.position.set(0, FLOOR, 0)
  shadow.scale.set(1, 0.45, 1)
  scene.add(shadow)

  const confetti = createFlakes({
    count: 360,
    colors: [c.accent, c.accentSoft, c.paper, c.paperAccent, "#f6c453", c.deep],
    geometry: new THREE.PlaneGeometry(0.07, 0.12),
    gravity: -4,
    drag: 1.7,
    flutter: 1.1,
    floor: FLOOR,
  })
  scene.add(confetti.mesh)

  // A second, lighter group for the stub's fall, outside the ticket.
  let idle = true
  let stubFall: { vy: number; vx: number; spin: number } | null = null
  stage.onFrame((dt, time) => {
    confetti.update(dt, time)
    if (idle) {
      ticket.rotation.y = Math.sin(time * 0.7) * 0.22
      ticket.rotation.z = Math.sin(time * 0.5) * 0.03
      ticket.position.y = restY + Math.sin(time * 1.3) * 0.04
    }
    if (stubFall) {
      stubFall.vy -= 6 * dt
      stub.position.y += stubFall.vy * dt
      stub.position.x += stubFall.vx * dt
      stub.rotation.z += stubFall.spin * dt
      stub.rotation.x += stubFall.spin * 0.6 * dt
      if (stub.position.y < -6) {
        stubFall = null
        stub.visible = false
      }
    }
  })
  stage.start()

  function fire() {
    // Two cannons just outside the bottom corners of the view, aimed up and in.
    const d = camera.position.z
    const halfH = d * Math.tan(((camera.fov / 2) * Math.PI) / 180)
    const halfW = halfH * camera.aspect
    const y = FLOOR + 0.1
    confetti.burst(new THREE.Vector3(-halfW - 0.1, y, 0.4), new THREE.Vector3(0.45, 1, 0), { n: 170, speed: 7.2, spread: 0.35 })
    confetti.burst(new THREE.Vector3(halfW + 0.1, y, 0.4), new THREE.Vector3(-0.45, 1, 0), { n: 170, speed: 7.2, spread: 0.35 })
  }

  async function play() {
    idle = false
    const ry = ticket.rotation.y
    const rz = ticket.rotation.z
    await tweens.tween({
      duration: 0.35,
      onUpdate: (t) => {
        ticket.rotation.y = lerp(ry, 0, t)
        ticket.rotation.z = lerp(rz, 0, t)
      },
    })
    if (stage.disposed) return
    // A tug at the perforation, then the stub tears free and tumbles.
    await tweens.tween({ duration: 0.25, easing: ease.outCubic, onUpdate: (t) => (stub.rotation.z = -0.12 * t) })
    if (stage.disposed) return
    stubFall = { vy: 0.4, vx: -0.5, spin: -2.2 }
    fire()
    // The ticket springs up and flips to show when and where.
    const y0 = ticket.position.y
    await tweens.tween({
      duration: 1.3,
      easing: ease.inOutCubic,
      onUpdate: (t) => {
        ticket.rotation.y = Math.PI * t
        ticket.position.y = lerp(y0, y0 + 0.25, ease.outBack(Math.min(1, t * 1.2)))
      },
    })
    if (stage.disposed) return
    stage.later(0.3, () => confetti.burst(new THREE.Vector3(0, 2.6, 0.6), new THREE.Vector3(0, -0.2, 0), { n: 20, speed: 1.2, spread: 1.6 }))
    stage.view.distanceScale = 0.9
    await tweens.wait(0.6)
  }

  let opening: Promise<void> | null = null
  return {
    open() {
      opening ??= play()
      return opening
    },
    dispose: stage.dispose,
  }
}
