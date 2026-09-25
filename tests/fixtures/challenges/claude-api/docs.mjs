import fs from "node:fs";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();
const MODEL = "claude-haiku-4-5";
const textOf = (response) => response.content.filter((b) => b.type === "text").map((b) => b.text).join("");

export async function describeImage(path, question) {
  const data = fs.readFileSync(path).toString("base64");
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 500,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/png", data } },
          { type: "text", text: question },
        ],
      },
    ],
  });
  return textOf(response);
}

export async function askPdf(path, question) {
  const data = fs.readFileSync(path).toString("base64");
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 500,
    messages: [
      {
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data } },
          { type: "text", text: question },
        ],
      },
    ],
  });
  return textOf(response);
}

export async function uploadFile(path) {
  const file = await client.files.upload({ file: fs.createReadStream(path) });
  return file.id;
}

export async function askUploaded(fileId, question) {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 500,
    messages: [
      {
        role: "user",
        content: [
          { type: "document", source: { type: "file", file_id: fileId } },
          { type: "text", text: question },
        ],
      },
    ],
  });
  return textOf(response);
}
