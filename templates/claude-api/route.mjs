import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

// The jobs this app does. Some are simple and high-volume; some need real reasoning.
export const TASKS = {
  "tag-ticket": "Label this support ticket as billing, shipping or other. Reply with the label only.",
  "extract-order": "Find the order number in this email. Reply with the number only.",
  "plan-migration": "Plan this database migration step by step, with rollback steps and the main risks.",
  "review-design": "Review this system design for scaling, security and cost problems, most important first.",
};

/**
 * Pick the model for a task: fast and low-cost where that's enough,
 * more capable where the task needs reasoning. Returns a model ID.
 */
export function chooseModel(taskId) {
  // TODO: return a model ID for each task in TASKS, and throw for a task you don't know.
  // Model IDs: https://platform.claude.com/docs/en/about-claude/models/overview
  throw new Error("chooseModel isn't written yet");
}

/** Run a task on some input, on the model chooseModel picks. Returns the text answer. */
export async function runTask(taskId, input) {
  // TODO: send the task's instructions and the input to the chosen model.
  throw new Error("runTask isn't written yet");
}
