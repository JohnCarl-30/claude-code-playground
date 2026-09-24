import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

// Does this model support effort and adaptive thinking? Check before you use them:
// https://platform.claude.com/docs/en/build-with-claude/effort
const MODEL = "claude-haiku-4-5";

/**
 * Answer a problem at the depth it needs.
 *   depth "quick": a fast answer that spends few tokens
 *   depth "deep":  more effort, and a summary of Claude's thinking you can show
 * Returns { answer, thoughts }. thoughts is the thinking summary, or "" when there is none.
 */
export async function solve(problem, depth) {
  // TODO:
  // - Set how hard Claude works with output_config.effort.
  // - For "deep", also ask to see a summary of the thinking (thinking.display).
  // - Keep thinking blocks and text blocks apart in what you return.
  throw new Error("solve isn't written yet");
}
