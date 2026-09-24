import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

// A long, unchanging document sent with every question: a good fit for prompt caching.
// (Real caching needs a minimum prefix length, e.g. 4096 tokens on Haiku 4.5; this one is
// shorter, but the practice API reports cache usage anyway so you can see the fields.)
export const FAQ = `Tiny Shop FAQ

Shipping: Orders ship within 2 business days. Shipping is free over $50; otherwise it's $5.
Returns: Unused items can be returned within 30 days for a full refund. Mugs must be unbroken.
Discount codes: SAVE10 gives 10% off. HALFOFF gives 50% off one order per customer. Codes can't be combined.
Payment: We accept cards and bank transfers. Prices include 8% tax.
Hours: Support answers email Monday to Friday, 9am to 6pm Singapore time.
Products: Mugs ($12), tea ($6), tea sets ($30). Tea sets include two mugs.
Gift cards: Sold in $10, $25 and $50 amounts. They never expire.
Accounts: You can order as a guest. Accounts keep your order history.`;

/**
 * Answer a question from the FAQ.
 * Returns { answer, usage: { input, cacheWrite, cacheRead, output, totalInput } }.
 */
export async function answerFaq(question) {
  // TODO:
  // 1. Put the FAQ in the system prompt and mark it for caching with cache_control.
  // 2. Keep that system prompt byte-identical between calls (no dates, ids, or the question).
  // 3. Return the answer and the usage numbers. input_tokens is only the *uncached* part.
  throw new Error("answerFaq isn't written yet");
}
