// Runs one file with sample input: node run.mjs <name>
// The playground's Run & test panel points this at the practice API.
const demos = {
  ask: async (m) => m.ask("What is the Model Context Protocol?"),
  tools: async (m) => m.runWithTools("What's the weather like in Tokyo?"),
  extract: async (m) => m.extractContact("Hi, I'm Ada Lovelace from Analytical Engines. Write to ada@example.com."),
  faq: async (m) => [await m.answerFaq("Is shipping free?"), await m.answerFaq("Can I combine codes?")],
  batch: async (m) => {
    const id = await m.submitReviews([
      { id: "review-1", text: "Love the mugs, arrived fast." },
      { id: "review-2", text: "Tea was stale and support never replied." },
    ]);
    console.log("batch id:", id);
    return m.collectResults(id);
  },
  errors: async (m) => m.safeAsk("Say hello."),
  stream: async (m) => m.streamAnswer("Explain streaming in one sentence.", (chunk) => process.stdout.write(`[${chunk}]`)),
  workflow: async (m) => m.summarizeThenTranslate("The Message Batches API processes large jobs asynchronously at half the price.", "French"),
};

const name = process.argv[2];
if (!demos[name]) {
  console.error(`Usage: node run.mjs <${Object.keys(demos).join("|")}>`);
  process.exit(1);
}
const result = await demos[name](await import(`./${name}.mjs`));
console.log(`\n${name}.mjs returned:`);
console.log(typeof result === "string" ? result : JSON.stringify(result, null, 2));
