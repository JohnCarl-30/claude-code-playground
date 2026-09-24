import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

export const TASKS = {
  "tag-ticket": "Label this support ticket as billing, shipping or other. Reply with the label only.",
  "extract-order": "Find the order number in this email. Reply with the number only.",
  "plan-migration": "Plan this database migration step by step, with rollback steps and the main risks.",
  "review-design": "Review this system design for scaling, security and cost problems, most important first.",
};

// One place for model choices, so upgrading is a one-line change.
const MODELS = { fast: "claude-haiku-4-5", capable: "claude-sonnet-5" };
const TIER = { "tag-ticket": "fast", "extract-order": "fast", "plan-migration": "capable", "review-design": "capable" };

export function chooseModel(taskId) {
  const tier = TIER[taskId];
  if (!tier) throw new Error(`Unknown task: ${taskId}`);
  return MODELS[tier];
}

export async function runTask(taskId, input) {
  const response = await client.messages.create({
    model: chooseModel(taskId),
    max_tokens: 1000,
    system: TASKS[taskId],
    messages: [{ role: "user", content: input }],
  });
  return response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
}
