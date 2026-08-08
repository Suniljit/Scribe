export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
}

/**
 * No chat backend is wired up yet (FR-05/FR-06 are unimplemented
 * server-side), so this returns a canned placeholder reply instead of a
 * real grounded answer.
 */
export function placeholderReply(): ChatMessage {
  return {
    role: "assistant",
    text: "Chat isn't connected to a model yet — this is a UI preview. Once notes generation is wired up on the backend, answers here will be grounded in this transcript.",
  };
}
