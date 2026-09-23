import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { inflateRawSync } from "node:zlib";
import { createZip } from "@/lib/zip";

/** Read entries back out of a zip by walking its local file headers. */
function readZip(zip: Buffer) {
  const entries: { name: string; data: Buffer }[] = [];
  let at = 0;
  while (zip.readUInt32LE(at) === 0x04034b50) {
    const size = zip.readUInt32LE(at + 18);
    const nameLength = zip.readUInt16LE(at + 26);
    const name = zip.subarray(at + 30, at + 30 + nameLength).toString("utf8");
    const start = at + 30 + nameLength;
    entries.push({ name, data: inflateRawSync(zip.subarray(start, start + size)) });
    at = start + size;
  }
  return entries;
}

describe("createZip", () => {
  const files = [
    { path: "server.js", data: Buffer.from("console.log('hi');\n".repeat(50)) },
    { path: "src/nested/ünïcode.md", data: Buffer.from("# Hello ✓\n") },
    { path: "empty.txt", data: Buffer.alloc(0) },
  ];

  it("round-trips file names and contents", () => {
    const entries = readZip(createZip(files));
    expect(entries.map((e) => e.name)).toEqual(files.map((f) => f.path));
    entries.forEach((e, i) => expect(e.data.equals(files[i].data)).toBe(true));
  });

  it("produces a zip that the system unzip accepts", () => {
    let hasUnzip = true;
    try {
      execFileSync("unzip", ["-v"], { stdio: "ignore" });
    } catch {
      hasUnzip = false;
    }
    if (!hasUnzip) return; // e.g. Windows without unzip
    const dir = mkdtempSync(path.join(tmpdir(), "zip-test-"));
    try {
      const file = path.join(dir, "p.zip");
      writeFileSync(file, createZip(files));
      expect(execFileSync("unzip", ["-t", file]).toString()).toMatch(/No errors detected/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
