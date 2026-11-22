// The three.js scene of wedding-invite-3d: a folded invitation card that opens
// upwards like a pop-up book. As the cover lifts, three layers of cut paper
// unfold from the fold into a tunnel of arches around the words, and a few
// petals drift down. Every shape and word is drawn in code: no model files,
// no textures or fonts from other sites.
//
// Only ../wedding-invite-3d.tsx loads this module, and only with import().
import * as THREE from "three"
import { fitDistance } from "../three-kit/fit"
import { drawStack, loadFaces, paperCanvas, type PaperColors, type PaperFonts } from "../three-kit/paper"
import type { InviteWords } from "./words"
import { addPaperLights, blobShadow, createFlakes, createStage, ease, lerp, textureOf } from "../three-kit/stage"


export type InviteSceneOptions = {
  colors: PaperColors
  fonts: PaperFonts
  words: InviteWords
  onTap: () => void
  onLost: () => void
}

export type InviteScene = { open: () => Promise<void>; dispose: () => void }

// One page of the card, in scene units: landscape, so the open card (two
// pages, one above the other) is tall like a phone.
const W = 1.6
const H = 1.12
const THICK = 0.012
const PX = 900

function pageCanvas(c: PaperColors, double: boolean) {
  const w = PX
  const h = Math.round((PX * H) / W)
  const { canvas, ctx } = paperCanvas(w, h, c.paper)
  ctx.strokeStyle = c.paperAccent
  ctx.globalAlpha = 0.7
  ctx.lineWidth = 4
  ctx.strokeRect(30, 30, w - 60, h - 60)
  if (double) {
    ctx.lineWidth = 1.5
    ctx.strokeRect(42, 42, w - 84, h - 84)
  }
  ctx.globalAlpha = 1
  return { canvas, ctx, w, h }
}

function coverTexture(words: InviteWords, c: PaperColors, f: PaperFonts) {
  const { canvas, ctx, w, h } = pageCanvas(c, true)
  drawStack(
    ctx,
    [
      { kind: "text", text: words.occasion, font: `600 26px ${f.body}`, color: c.paperMuted, lineHeight: 40, spacing: "8px", upper: true, maxLines: 1 },
      { kind: "gap", height: 18 },
      { kind: "text", text: words.names, font: `500 ${f.script ? 96 : 84}px ${f.formal}`, color: c.paperAccent, lineHeight: f.script ? 100 : 92, maxLines: 2 },
      { kind: "gap", height: 22 },
      { kind: "rule", color: c.paperAccent, width: 220 },
      { kind: "gap", height: 22 },
      { kind: "text", text: words.forName, font: `${f.script ? "" : "italic "}400 34px ${f.body}`, color: c.paperMuted, lineHeight: 46, maxLines: 1 },
    ],
    w / 2,
    50,
    h - 50,
    w - 160,
  )
  return canvas
}

// The inside of the cover becomes the top page once the card is open.
function topTexture(words: InviteWords, c: PaperColors, f: PaperFonts) {
  const { canvas, ctx, w, h } = pageCanvas(c, false)
  drawStack(
    ctx,
    [
      { kind: "text", text: words.names, font: `500 60px ${f.formal}`, color: c.paperAccent, lineHeight: 70, maxLines: 2 },
      { kind: "gap", height: 18 },
      { kind: "text", text: words.headline, font: `${f.script ? "" : "italic "}${f.displayWeight} 46px ${f.display}`, color: c.paperInk, lineHeight: 56, maxLines: 3 },
    ],
    w / 2,
    90,
    h - 60,
    w - 330,
  )
  return canvas
}

function bottomTexture(words: InviteWords, c: PaperColors, f: PaperFonts) {
  const { canvas, ctx, w, h } = pageCanvas(c, false)
  const blocks = words.date
    ? ([
        { kind: "text", text: words.weekday, font: `600 24px ${f.body}`, color: c.paperMuted, lineHeight: 36, spacing: "8px", upper: true, maxLines: 1 },
        { kind: "gap", height: 6 },
        { kind: "text", text: words.date, font: `500 58px ${f.formal}`, color: c.paperInk, lineHeight: 66, maxLines: 1 },
        { kind: "text", text: words.time, font: `400 30px ${f.body}`, color: c.paperMuted, lineHeight: 42, maxLines: 1 },
        { kind: "gap", height: 18 },
        { kind: "text", text: words.place, font: `500 40px ${f.formal}`, color: c.paperInk, lineHeight: 48, maxLines: 2 },
        { kind: "text", text: words.address, font: `400 24px ${f.body}`, color: c.paperMuted, lineHeight: 32, maxLines: 2 },
      ] as const)
    : ([{ kind: "text", text: words.forName, font: `500 52px ${f.formal}`, color: c.paperInk, lineHeight: 64, maxLines: 2 }] as const)
  // Narrower than the page: the arches of cut paper stand in front of it.
  drawStack(ctx, [...blocks], w / 2, 40, h - 130, w - 420)
  return canvas
}

// A layer of cut paper: the open card's outline with an arched window, its
// top and bottom ends round, so the words show through.
function archLayer(outerW: number, outerH: number, winW: number, winH: number): THREE.Shape {
  const s = new THREE.Shape()
  s.moveTo(-outerW / 2, -outerH / 2)
  s.lineTo(outerW / 2, -outerH / 2)
  s.lineTo(outerW / 2, outerH / 2)
  s.lineTo(-outerW / 2, outerH / 2)
  s.lineTo(-outerW / 2, -outerH / 2)
  const r = winW / 2
  const straight = Math.max(0, winH / 2 - r)
  const hole = new THREE.Path()
  hole.moveTo(-r, -straight)
  hole.lineTo(-r, straight)
  hole.absarc(0, straight, r, Math.PI, 0, true)
  hole.lineTo(r, -straight)
  hole.absarc(0, -straight, r, 0, Math.PI, true)
  s.holes.push(hole)
  return s
}

// Small leaves cut along a layer's inner edge, for the front layer.
function leaves(color: string, winW: number, winH: number): THREE.InstancedMesh {
  const leaf = new THREE.Shape()
  leaf.moveTo(0, -0.06)
  leaf.quadraticCurveTo(0.05, 0, 0, 0.06)
  leaf.quadraticCurveTo(-0.05, 0, 0, -0.06)
  const geo = new THREE.ShapeGeometry(leaf, 4)
  const n = 22
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.7, side: THREE.DoubleSide }), n)
  const d = new THREE.Object3D()
  const r = winW / 2
  const straight = Math.max(0, winH / 2 - r)
  for (let i = 0; i < n; i++) {
    // Along the side of the window, alternating left and right, upper and lower half.
    const side = i % 2 ? 1 : -1
    const k = Math.floor(i / 2) / (n / 2 - 1)
    const y = lerp(-straight - r * 0.6, straight + r * 0.6, k)
    const x = side * (y > straight ? Math.sqrt(Math.max(0, r * r - (y - straight) ** 2)) : y < -straight ? Math.sqrt(Math.max(0, r * r - (y + straight) ** 2)) : r)
    d.position.set(x + side * 0.025, y, 0.002)
    d.rotation.set(0, 0, side * (0.6 + 0.4 * Math.sin(i * 1.7)))
    d.scale.setScalar(0.8 + 0.4 * ((i * 37) % 10) / 10)
    d.updateMatrix()
    mesh.setMatrixAt(i, d.matrix)
  }
  return mesh
}

export async function createInviteScene(container: HTMLElement, opts: InviteSceneOptions): Promise<InviteScene> {
  const { colors: c, fonts: f, words } = opts
  // Closed, the card is one page; open, two. The camera frames each.
  const closedFit = (aspect: number) => fitDistance(W / 2 + 0.25, H / 2 + 0.9, aspect, 4.2)
  const openFit = (aspect: number) => fitDistance(W / 2 + 0.12, H + 0.5, aspect, 4.2)
  let openness = 0
  const stage = createStage(container, {
    onTap: opts.onTap,
    onLost: opts.onLost,
    lift: 0.35,
    distance: (aspect) => lerp(closedFit(aspect), openFit(aspect), openness),
  })
  const { scene, renderer, tweens } = stage
  addPaperLights(scene, c.wrapShade, c.accentSoft)

  await loadFaces(f)
  if (stage.disposed) throw new Error("disposed")

  const edge = new THREE.MeshStandardMaterial({ color: c.paper, roughness: 0.9 })
  const coverTex = textureOf(coverTexture(words, c, f), renderer)
  const topTex = textureOf(topTexture(words, c, f), renderer)
  // The inside of the cover flips over the fold, so its words turn with it.
  topTex.center.set(0.5, 0.5)
  topTex.rotation = Math.PI
  const bottomTex = textureOf(bottomTexture(words, c, f), renderer)
  const paper = (map: THREE.Texture) => new THREE.MeshStandardMaterial({ map, roughness: 0.88 })

  const card = new THREE.Group()
  // The whole card tilts back a little, as if propped on a table.
  card.rotation.x = -0.12
  scene.add(card)
  const fold = new THREE.Group()
  fold.position.y = H / 2
  card.add(fold)

  const bottom = new THREE.Mesh(new THREE.BoxGeometry(W, H, THICK), [edge, edge, edge, edge, paper(bottomTex), edge])
  bottom.position.set(0, -H / 2, -THICK / 2)
  fold.add(bottom)

  const hinge = new THREE.Group()
  fold.add(hinge)
  const cover = new THREE.Mesh(new THREE.BoxGeometry(W, H, THICK), [edge, edge, edge, edge, paper(coverTex), paper(topTex)])
  cover.position.set(0, -H / 2, THICK * 0.75)
  hinge.add(cover)

  // The pop-up: three layers of cut paper, flat in the fold until it opens.
  const layerColors = [c.paperAccent, c.accentSoft, c.paper]
  const layers = [0, 1, 2].map((i) => {
    const winW = 1.0 + 0.12 * i
    const winH = 1.72 + 0.12 * i
    const shape = archLayer(W - 0.04 * (2 - i), 2 * H - 0.04 * (2 - i), winW, winH)
    const mat = new THREE.MeshStandardMaterial({ color: layerColors[i], roughness: 0.85, side: THREE.DoubleSide })
    const g = new THREE.Group()
    const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape, 24), mat)
    g.add(mesh)
    if (i === 2) g.add(leaves(c.accentSoft, winW, winH))
    g.scale.set(1, 0.001, 1)
    g.visible = false
    fold.add(g)
    return { g, depth: 0.1 + 0.11 * i }
  })

  const shadow = blobShadow(1.4, 0.2)
  shadow.position.set(0, -H - 0.35, 0.2)
  shadow.scale.set(1, 0.5, 1)
  scene.add(shadow)

  const petal = new THREE.Shape()
  petal.moveTo(0, -0.05)
  petal.bezierCurveTo(0.05, -0.03, 0.05, 0.04, 0, 0.06)
  petal.bezierCurveTo(-0.05, 0.04, -0.05, -0.03, 0, -0.05)
  const petals = createFlakes({
    count: 70,
    colors: [c.accentSoft, c.accent, c.paper],
    geometry: new THREE.ShapeGeometry(petal, 4),
    gravity: -0.5,
    drag: 0.9,
    flutter: 0.6,
    floor: -H - 0.35,
  })
  scene.add(petals.mesh)

  // Idle: the closed card breathes, turning a touch.
  let idle = true
  stage.onFrame((dt, time) => {
    petals.update(dt, time)
    if (idle) {
      card.rotation.y = Math.sin(time * 0.6) * 0.12
      card.position.y = Math.sin(time * 1.1) * 0.03
    }
  })
  stage.start()

  // Pop-up mechanics: each layer stands up a little after the cover passes it.
  function setOpen(t: number) {
    hinge.rotation.x = -Math.PI * t
    fold.position.y = lerp(H / 2, 0, ease.inOutCubic(t))
    openness = t
    layers.forEach(({ g, depth }, i) => {
      const k = Math.min(1, Math.max(0, (t - 0.35 - i * 0.08) / 0.5))
      const e = ease.outBack(k)
      g.visible = k > 0
      g.scale.y = Math.max(0.001, e)
      g.position.z = depth * Math.min(1, e)
    })
  }

  async function play() {
    const ry = card.rotation.y
    const py = card.position.y
    idle = false
    await tweens.tween({
      duration: 0.4,
      onUpdate: (t) => {
        card.rotation.y = lerp(ry, 0, t)
        card.position.y = lerp(py, 0, t)
      },
    })
    if (stage.disposed) return
    await tweens.tween({ duration: 1.9, easing: (t) => t, onUpdate: (t) => setOpen(ease.inOutCubic(t)) })
    if (stage.disposed) return
    petals.drift(70, 3, H + 0.8)
    // Settle upright to face the guest.
    const rx = card.rotation.x
    await tweens.tween({ duration: 0.9, onUpdate: (t) => (card.rotation.x = lerp(rx, 0, t)) })
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
