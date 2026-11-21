"use client"

import { useState } from "react"
import { SharePanel } from "@/components/share/share-panel"

// The share panel in both states, as the signed-in app shows it.
export function SharePreview({ url }: { url: string }) {
  const [clicked, setClicked] = useState(false)
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <p className="mb-2 text-[13px] text-night-lilac">Ready to share</p>
        <SharePanel url={url} />
      </div>
      <div>
        <p className="mb-2 text-[13px] text-night-lilac">Locked {clicked ? "(the upgrade would start now)" : ""}</p>
        <SharePanel url={url} locked onUnlock={() => setClicked(true)} />
      </div>
    </div>
  )
}
