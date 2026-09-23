import "server-only";
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

// Notes survive between runs for as long as the dev server is running.
const notes: string[] = [];

const text = (value: string) => ({ content: [{ type: "text" as const, text: value }] });

/**
 * A small MCP server that runs inside this Next.js process. Claude sees its
 * tools as mcp__demo__roll_dice, mcp__demo__get_weather, and so on.
 */
export function createDemoMcpServer() {
  return createSdkMcpServer({
    name: "demo",
    version: "1.0.0",
    // Always show these tools to the model instead of hiding them behind tool search.
    alwaysLoad: true,
    tools: [
      tool(
        "roll_dice",
        "Roll one die with the given number of sides and return the result.",
        { sides: z.number().int().min(2).max(1000).describe("How many sides the die has") },
        async ({ sides }) => text(String(1 + Math.floor(Math.random() * sides))),
      ),
      tool(
        "get_weather",
        "Get today's (made-up) weather for a city. Demo data only.",
        { city: z.string().describe("City name, e.g. Singapore") },
        async ({ city }) => {
          // Deterministic fake data so the same city gives the same answer.
          const seed = [...city.toLowerCase()].reduce((n, c) => n + c.charCodeAt(0), 0);
          const conditions = ["sunny", "cloudy", "rainy", "windy", "stormy"][seed % 5];
          return text(JSON.stringify({ city, conditions, temperature_c: 18 + (seed % 16) }));
        },
      ),
      tool(
        "save_note",
        "Save a short note to the playground's notebook.",
        { note: z.string().min(1).max(500) },
        async ({ note }) => {
          notes.push(note);
          return text(`Saved. The notebook now has ${notes.length} note(s).`);
        },
      ),
      tool("list_notes", "List every note in the playground's notebook.", {}, async () =>
        text(notes.length ? notes.map((n, i) => `${i + 1}. ${n}`).join("\n") : "The notebook is empty."),
      ),
    ],
  });
}

export const DEMO_MCP_TOOLS = ["roll_dice", "get_weather", "save_note", "list_notes"].map((t) => `mcp__demo__${t}`);
