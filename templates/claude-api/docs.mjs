import fs from "node:fs";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();
const MODEL = "claude-haiku-4-5";

// samples/receipt.png and samples/policy.pdf are small files to try these on.

/** Ask a question about a PNG image on disk. Returns the text answer. */
export async function describeImage(path, question) {
  // TODO: an `image` content block with a base64 source (and its media_type), plus the question as text.
  throw new Error("describeImage isn't written yet");
}

/** Ask a question about a PDF on disk, sending the file in the request. */
export async function askPdf(path, question) {
  // TODO: a `document` content block with a base64 PDF source.
  throw new Error("askPdf isn't written yet");
}

/** Upload a file once with the Files API. Returns its file_id. */
export async function uploadFile(path) {
  // TODO: client.files.upload(...)
  throw new Error("uploadFile isn't written yet");
}

/** Ask about a file you uploaded earlier, by its file_id, without sending its bytes again. */
export async function askUploaded(fileId, question) {
  // TODO: a `document` block whose source points at the file_id.
  throw new Error("askUploaded isn't written yet");
}
