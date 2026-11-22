// The three.js scene of gift-3d: a round keepsake tin with a label on its lid.
// Tapping unscrews the lid, which lifts away; a warm glow rises from inside,
// sparks float up, and the gift card spins up out of the tin to face them.
// The card names the gift; the code is never drawn here (the page shows it
// after the tin is open). Every shape and word is drawn in code: no model
// files, no textures or fonts from other sites.
//
// Only ../gift-3d.tsx loads this module, and only with import().
import * as THREE from "three"
import { fitDistance } from "../three-kit/fit"
import { drawStack, loadFaces, paperCanvas, type PaperColors, type PaperFonts } from "../three-kit/paper"
import { addPaperLights, blobShadow, createFlakes, createStage, ease, fitTexture, glowSprite, lerp, roundedRect, slab, textureOf } from "../three-kit/stage"
import type { TinWords } from "./words"

export type TinSceneOptions = {
  colors: PaperColors
  fonts: PaperFonts
  words: TinWords
  onTap: () => void
  onLost: () => void
}

export type TinScene = { open: () => Promise<void>; dispose: () => void }

const R = 0.78
const BODY_H = 0.86
const LID_H = 0.24
const CARD_W = 1.26
const CARD_H = 0.8

// The tin's side: the palette's wrap colour with rows of little stars and a
// band in the accent at top and bottom.
function sideTexture(c: PaperColors) {
  const w = 1024
  const h = 192
  const { canvas, ctx } = paperCanvas(w, h, c.wrap)
  ctx.fillStyle = c.accent
  ctx.fillRect(0, 0, w, 14)
  ctx.fillRect(0, h - 14, w, 14)
  ctx.fillStyle = c.accentSoft
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 16; col++) {
      const x = col * 64 + (row % 2 ? 32 : 0) + 16
      const y = 46 + row * 50
      const s = 9
      ctx.beginPath()
      ctx.moveTo(x, y - s)
      ctx.quadraticCurveTo(x, y, x + s, y)
      ctx.quadraticCurveTo(x, y, x, y + s)
      ctx.quadraticCurveTo(x, y, x - s, y)
      ctx.quadraticCurveTo(x, y, x, y - s)
      ctx.fill()
    }
  }
  return canvas
}

// The round label on the lid.
function labelTexture(words: TinWords, c: PaperColors, f: PaperFonts) {
  const size = 768
  const canvas = document.createElement("canvas")
  canvas.width = canvas.height = size
  const ctx = canvas.getContext("2d")!
  // The lid's UVs mirror the canvas; drawing it mirrored makes it read true.
  ctx.translate(size, 0)
  ctx.scale(-1, 1)
  ctx.fillStyle = c.accent
  ctx.fillRect(0, 0, size, size)
  ctx.fillStyle = c.paper
  ctx.beginPath()
  ctx.arc(size / 2, size / 2, size * 0.39, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = c.paperAccent
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.arc(size / 2, size / 2, size * 0.36, 0, Math.PI * 2)
  ctx.stroke()
  drawStack(
    ctx,
    [
      { kind: "text", text: words.occasion, font: `600 28px ${f.body}`, color: c.paperMuted, lineHeight: 40, spacing: "7px", upper: true, maxLines: 1 },
      { kind: "gap", height: 12 },
      { kind: "text", text: words.forName, font: `${f.displayWeight} ${f.script ? 84 : 72}px ${f.display}`, color: c.paperAccent, lineHeight: f.script ? 88 : 78, maxLines: 2 },
      { kind: "gap", height: 14 },
      { kind: "text", text: words.from, font: `${f.script ? "" : "italic "}400 30px ${f.body}`, color: c.paperMuted, lineHeight: 40, maxLines: 1 },
    ],
    size / 2,
    size * 0.2,
    size * 0.8,
    size * 0.6,
  )
  return canvas
}

// The gift card's face: what the gift is, never its code.
function cardTexture(words: TinWords, c: PaperColors, f: PaperFonts) {
  const w = 1008
  const h = Math.round((w * CARD_H) / CARD_W)
  const canvas = document.createElement("canvas")
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext("2d")!
  // The accent colour, with the palette's own ink for it, so the words read
  // on every palette.
  ctx.fillStyle = c.accent
  ctx.fillRect(0, 0, w, h)
  // A soft sheen across the card.
  const sheen = ctx.createLinearGradient(0, 0, w, 0)
  sheen.addColorStop(0.3, "rgba(255,255,255,0)")
  sheen.addColorStop(0.5, "rgba(255,255,255,0.18)")
  sheen.addColorStop(0.7, "rgba(255,255,255,0)")
  ctx.fillStyle = sheen
  ctx.fillRect(0, 0, w, h)
  ctx.textAlign = "left"
  ctx.textBaseline = "alphabetic"
  ctx.fillStyle = c.accentInk
  ctx.font = `700 30px ${f.body}`
  ctx.fillText(words.eyebrow.toUpperCase(), 64, 96)
  if (words.price) {
    ctx.textAlign = "right"
    ctx.font = `700 40px ${f.body}`
    ctx.fillText(words.price, w - 64, 100)
  }
  drawStack(
    ctx,
    [{ kind: "text", text: words.giftTitle, font: `${f.displayWeight} ${f.script ? 92 : 78}px ${f.display}`, color: c.accentInk, lineHeight: f.script ? 94 : 86, maxLines: 3 }],
    w / 2,
    140,
    h - 120,
    w - 140,
  )
  ctx.textAlign = "left"
  ctx.textBaseline = "alphabetic"
  ctx.fillStyle = c.accentInk
  ctx.globalAlpha = 0.75
  ctx.font = `600 30px ${f.body}`
  ctx.fillText(words.forName, 64, h - 64)
  ctx.globalAlpha = 1
  return canvas
}

function cardBackTexture(c: PaperColors) {
  const w = 512
  const h = Math.round((w * CARD_H) / CARD_W)
  const { canvas, ctx } = paperCanvas(w, h, c.deep)
  ctx.strokeStyle = c.accent
  ctx.globalAlpha = 0.5
  ctx.lineWidth = 2
  for (let x = -h; x < w; x += 22) {
    ctx.beginPath()
    ctx.moveTo(x, h)
    ctx.lineTo(x + h, 0)
    ctx.stroke()
  }
  ctx.globalAlpha = 1
  return canvas
}

export async function createTinScene(container: HTMLElement, opts: TinSceneOptions): Promise<TinScene> {
  const { colors: c, fonts: f, words } = opts
  const stage = createStage(container, {
    onTap: opts.onTap,
    onLost: opts.onLost,
    lift: 0.9,
    lookAt: new THREE.Vector3(0, 0.05, 0),
    distance: (aspect) => fitDistance(R + 0.45, 1.5, aspect, 4.4),
  })
  const { scene, renderer, tweens, camera } = stage
  const lights = addPaperLights(scene, c.wrapShade, c.accentSoft)

  await loadFaces(f)
  if (stage.disposed) throw new Error("disposed")

  const tin = new THREE.Group()
  tin.position.y = -0.75
  scene.add(tin)

  const sideTex = textureOf(sideTexture(c), renderer)
  sideTex.wrapS = THREE.RepeatWrapping
  const metal = (color: string, map?: THREE.Texture) => new THREE.MeshStandardMaterial({ color: map ? 0xffffff : color, map, roughness: 0.38, metalness: 0.55 })
  const side = metal(c.wrap, sideTex)
  const inside = new THREE.MeshStandardMaterial({ color: c.wrapShade, roughness: 0.7, metalness: 0.3, side: THREE.BackSide })
  const walls = new THREE.Mesh(new THREE.CylinderGeometry(R, R, BODY_H, 64, 1, true), side)
  walls.position.y = BODY_H / 2
  const inner = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.99, R * 0.99, BODY_H, 64, 1, true), inside)
  inner.position.y = BODY_H / 2
  const base = new THREE.Mesh(new THREE.CircleGeometry(R, 64), new THREE.MeshStandardMaterial({ color: c.wrapShade, roughness: 0.8 }))
  base.rotation.x = -Math.PI / 2
  base.position.y = 0.02
  const rimMat = metal(c.accent)
  const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.022, 10, 64), rimMat)
  rim.rotation.x = Math.PI / 2
  rim.position.y = BODY_H
  tin.add(walls, inner, base, rim)

  // The lid: a shallow cylinder, the label on top, a rolled edge.
  const lid = new THREE.Group()
  lid.position.y = BODY_H - 0.08
  const labelTex = textureOf(labelTexture(words, c, f), renderer)
  // The cap's UVs run round the circle; turn the label to read from the front.
  labelTex.center.set(0.5, 0.5)
  labelTex.rotation = -Math.PI / 2
  labelTex.flipY = false
  const lidBody = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.035, R + 0.035, LID_H, 64), [
    metal(c.accent),
    new THREE.MeshStandardMaterial({ map: labelTex, roughness: 0.55, metalness: 0.15 }),
    metal(c.wrapShade),
  ])
  lidBody.position.y = LID_H / 2
  const lidRoll = new THREE.Mesh(new THREE.TorusGeometry(R + 0.035, 0.025, 10, 64), rimMat)
  lidRoll.rotation.x = Math.PI / 2
  lidRoll.position.y = LID_H
  lid.add(lidBody, lidRoll)
  tin.add(lid)

  // The card waits inside, upright.
  const cardTex = textureOf(cardTexture(words, c, f), renderer)
  fitTexture(cardTex, CARD_W, CARD_H)
  const backTex = textureOf(cardBackTexture(c), renderer)
  fitTexture(backTex, CARD_W, CARD_H)
  const card = slab({
    shape: roundedRect(CARD_W, CARD_H, 0.07),
    depth: 0.014,
    front: new THREE.MeshStandardMaterial({ map: cardTex, roughness: 0.35, metalness: 0.25 }),
    back: new THREE.MeshStandardMaterial({ map: backTex, roughness: 0.5 }),
    edge: new THREE.MeshStandardMaterial({ color: c.paperAccent, roughness: 0.4, metalness: 0.4 }),
  })
  card.scale.setScalar(0.5)
  card.position.set(0, 0.35, 0)
  card.visible = false
  tin.add(card)

  // The glow from inside, and a light that goes with it.
  const glow = glowSprite(c.accent, 2.6)
  glow.position.set(0, BODY_H, 0)
  tin.add(glow)
  const inLight = new THREE.PointLight(new THREE.Color(c.accent), 0, 6)
  inLight.position.set(0, BODY_H + 0.2, 0.4)
  tin.add(inLight)

  const shadow = blobShadow(1.25, 0.34)
  shadow.position.set(0, -0.74, 0)
  shadow.scale.set(1, 0.55, 1)
  scene.add(shadow)

  const sparkShape = new THREE.OctahedronGeometry(0.03)
  const sparks = createFlakes({ count: 120, colors: [c.accent, c.paper, "#fff4c2", c.accentSoft], geometry: sparkShape, gravity: 0.5, drag: 1.4, flutter: 0.5, floor: -10 })
  scene.add(sparks.mesh)

  // Idle: the tin turns slowly and tips a touch towards the visitor.
  let idle = true
  tin.rotation.x = 0.22
  stage.onFrame((dt, time) => {
    sparks.update(dt, time)
    if (idle) {
      tin.rotation.y = Math.sin(time * 0.6) * 0.35
      lid.position.y = BODY_H - 0.08 + Math.max(0, Math.sin(time * 2.2)) * 0.012
    }
  })
  stage.start()

  async function play() {
    idle = false
    const ry = tin.rotation.y
    await tweens.tween({ duration: 0.35, onUpdate: (t) => (tin.rotation.y = lerp(ry, 0, t)) })
    if (stage.disposed) return
    // Unscrew: a turn and a half, rising as it goes.
    const y0 = lid.position.y
    await tweens.tween({
      duration: 0.9,
      easing: ease.inOutCubic,
      onUpdate: (t) => {
        lid.rotation.y = -Math.PI * 3 * t
        lid.position.y = y0 + 0.12 * t
      },
    })
    if (stage.disposed) return
    // The lid lifts away to the side; the glow rises.
    card.visible = true
    const ly = lid.position.y
    void tweens.tween({
      duration: 1.1,
      easing: ease.inOutCubic,
      onUpdate: (t) => {
        lid.position.set(2.8 * t, ly + Math.sin(t * Math.PI) * 0.9 - t * 0.5, -0.6 * t)
        lid.rotation.z = -0.9 * t
      },
    })
    void tweens.tween({
      duration: 0.8,
      easing: ease.outCubic,
      onUpdate: (t) => {
        ;(glow.material as THREE.SpriteMaterial).opacity = 0.85 * t
        inLight.intensity = 10 * t
      },
    })
    const mouth = new THREE.Vector3(0, tin.position.y + BODY_H, 0)
    sparks.burst(mouth, new THREE.Vector3(0, 1, 0), { n: 70, speed: 1.6, spread: 0.7 })
    stage.later(0.5, () => sparks.burst(mouth, new THREE.Vector3(0, 1, 0), { n: 50, speed: 1.3, spread: 0.9 }))
    await tweens.wait(0.35)
    if (stage.disposed) return
    // The card spins up out of the tin, then comes forward to face them.
    scene.attach(card)
    const p0 = card.position.clone()
    const q0 = card.quaternion.clone()
    const target = new THREE.Vector3(0, 0.85, 1.6)
    const q1 = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(camera.position.clone(), target, camera.up))
    // Two turns about the vertical, unwound as it settles.
    const spin = new THREE.Quaternion()
    const up = new THREE.Vector3(0, 1, 0)
    await tweens.tween({
      duration: 1.7,
      easing: (t) => t,
      onUpdate: (t) => {
        const e = ease.inOutCubic(t)
        card.position.set(lerp(p0.x, target.x, e), lerp(p0.y, target.y, ease.outBack(Math.min(1, t * 1.15))), lerp(p0.z, target.z, e))
        card.quaternion.slerpQuaternions(q0, q1, e)
        spin.setFromAxisAngle(up, (1 - ease.outCubic(t)) * Math.PI * 4)
        card.quaternion.premultiply(spin)
        card.scale.setScalar(lerp(0.5, 1, e))
      },
    })
    if (stage.disposed) return
    void tweens.tween({
      duration: 0.8,
      onUpdate: (t) => {
        ;(glow.material as THREE.SpriteMaterial).opacity = 0.85 * (1 - t * 0.5)
        lights.back.intensity = 14 + 6 * t
      },
    })
    await tweens.wait(0.5)
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
