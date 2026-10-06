export function clearOldToolResults(messages, keep = 3) {
  const ids = messages.flatMap((m) => (Array.isArray(m.content) ? m.content.filter((b) => b.type === "tool_result").map((b) => b.tool_use_id) : []));
  const clear = new Set(ids.slice(0, Math.max(0, ids.length - keep)));
  return messages.map((m) =>
    Array.isArray(m.content)
      ? {
          ...m,
          content: m.content.map((b) => (b.type === "tool_result" && clear.has(b.tool_use_id) ? { ...b, content: "[cleared to save context]" } : b)),
        }
      : m,
  );
}
