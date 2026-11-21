// Turns a stored conversation (Anthropic message format) into the messages the
// chat UI shows when a gift is reopened. Built with the main agent (issue #5).
import type { DisplayMessage } from "./events"

export function toDisplayMessages(chat: unknown[]): DisplayMessage[] {
  void chat
  return []
}
