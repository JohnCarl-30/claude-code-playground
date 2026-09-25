/**
 * Keep a long agent conversation small. Old tool results (file contents, search
 * results…) are usually what fills the context window, and are rarely needed again.
 *
 * Return a copy of `messages` where every tool_result except the last `keep` has its
 * content replaced with a short placeholder. Everything else stays as it is, and the
 * conversation must stay valid: every tool_use still gets its tool_result.
 * Don't change the array you're given.
 */
export function clearOldToolResults(messages, keep = 3) {
  // TODO
  throw new Error("clearOldToolResults isn't written yet");
}
