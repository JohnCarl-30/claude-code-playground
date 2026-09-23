import { rejectNonLocal } from "@/lib/local-only";

const req = (method: string, headers: Record<string, string>) => new Request("http://localhost:3000/api/run", { method, headers });

describe("rejectNonLocal", () => {
  it("allows the page's own requests", () => {
    expect(rejectNonLocal(req("GET", { host: "localhost:3000" }))).toBeNull();
    expect(rejectNonLocal(req("POST", { host: "127.0.0.1:3000", "content-type": "application/json" }))).toBeNull();
    expect(
      rejectNonLocal(req("POST", { host: "localhost:3000", origin: "http://localhost:3000", "content-type": "application/json" })),
    ).toBeNull();
  });

  it("blocks other hosts (other devices, DNS rebinding)", () => {
    expect(rejectNonLocal(req("GET", { host: "evil.example:3000" }))?.status).toBe(403);
    expect(rejectNonLocal(req("GET", { host: "192.168.1.20:3000" }))?.status).toBe(403);
  });

  it("blocks other websites", () => {
    const res = rejectNonLocal(req("POST", { host: "localhost:3000", origin: "https://evil.example", "content-type": "application/json" }));
    expect(res?.status).toBe(403);
  });

  it("requires JSON for POSTs so other sites can't skip the CORS preflight", () => {
    expect(rejectNonLocal(req("POST", { host: "localhost:3000", "content-type": "text/plain" }))?.status).toBe(415);
  });

  it("lets DELETE through without a body (browsers always preflight it)", () => {
    expect(rejectNonLocal(req("DELETE", { host: "localhost:3000" }))).toBeNull();
  });
});
