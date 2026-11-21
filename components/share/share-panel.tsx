"use client"

// Share a letter's link: copy, QR code, WhatsApp. Part of the contract; the real
// panel replaces this placeholder (issue #21). `locked` shows the upgrade state
// instead of the link, and `onUnlock` starts the upgrade.
export function SharePanel({ url, locked = false, onUnlock }: { url: string; locked?: boolean; onUnlock?: () => void }) {
  if (locked) {
    return (
      <button type="button" onClick={onUnlock} className="rounded-full bg-[#EAB394] px-5 py-3 font-semibold text-[#1B1226]">
        Choose Full moon to share
      </button>
    )
  }
  return (
    <div className="rounded-2xl bg-white/5 p-4 text-sm">
      <a href={url} className="break-all underline">
        {url}
      </a>
    </div>
  )
}
