// A click the page may take over: the main button with no modifier key, not
// already handled. Anything else (a middle click, Cmd or Ctrl for a new tab,
// Shift for a new window) is left to the browser, so a link still behaves like
// a link for people who want the page on its own.
export type ClickLike = {
  button: number
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
  defaultPrevented: boolean
}

export function isPlainClick(e: ClickLike): boolean {
  return !e.defaultPrevented && e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey
}
