"use client"

// The reveal every newer 3D template plays, as a hook: closed, then opening
// while the scene animates, then open, when the page takes over and the GPU is
// freed. No three.js here.
//
// The scene arrives through `load`, which each template writes as an import()
// of its own scene module, so three.js downloads only on that template's page
// and only when it will run: never with reduced motion, never without WebGL.
// Until the scene is up, and whenever it cannot run, the template shows its
// still drawing and the button opens it straight away.
import { useCallback, useEffect, useRef, useState } from "react"
import { hasWebGL } from "../gift-box-3d/layout"

export type RevealStage = "closed" | "opening" | "open"

export type RevealScene = {
  // Plays the reveal; resolves when it has finished.
  open: () => Promise<void>
  dispose: () => void
}

export type SceneHandlers = { onTap: () => void; onLost: () => void }

export function useThreeReveal<S extends RevealScene>({
  load,
  holdMs,
}: {
  // Builds the scene in the given element. Changes identity when the content does.
  load: (el: HTMLElement, handlers: SceneHandlers) => Promise<S>
  // How long the finished scene stays on screen before the page takes over.
  holdMs: number
}) {
  const [stage, setStage] = useState<RevealStage>("closed")
  // True once the 3D scene is drawing over the still picture.
  const [live, setLive] = useState(false)
  const stageRef = useRef<HTMLDivElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const sceneRef = useRef<S | null>(null)
  const stageNow = useRef<RevealStage>("closed")
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  const go = useCallback((next: RevealStage) => {
    stageNow.current = next
    setStage(next)
  }, [])

  const open = useCallback(async () => {
    if (stageNow.current !== "closed") return
    const scene = sceneRef.current
    if (!scene || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      go("open")
      return
    }
    go("opening")
    try {
      await scene.open()
    } catch {
      // Whatever went wrong in the scene, the letter still opens.
    }
    timers.current.push(setTimeout(() => go("open"), holdMs))
  }, [go, holdMs])
  const openRef = useRef(open)
  openRef.current = open

  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !hasWebGL()) return
    let cancelled = false
    let created: S | null = null
    const stop = () => {
      created?.dispose()
      created = null
      sceneRef.current = null
      setLive(false)
    }
    load(el, {
      onTap: () => void openRef.current(),
      onLost: () => {
        stop()
        if (stageNow.current === "opening") go("open")
      },
    })
      .then((scene) => {
        if (cancelled || stageNow.current !== "closed") {
          scene.dispose()
          return
        }
        created = scene
        sceneRef.current = scene
        setLive(true)
      })
      .catch(() => {
        // No WebGL after all, or the chunk did not load: the still drawing stays.
      })
    return () => {
      cancelled = true
      stop()
    }
  }, [load, go])

  // Once the page has taken over, free the GPU and move focus to the heading.
  useEffect(() => {
    if (stage !== "open") return
    sceneRef.current?.dispose()
    sceneRef.current = null
    headingRef.current?.focus({ preventScroll: true })
  }, [stage])

  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  return { stage, live, stageRef, headingRef, open }
}
