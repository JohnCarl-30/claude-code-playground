// getAccountStatus in every mode, with the SDKs replaced by fakes (no network, no Claude).
let accountInfo: Record<string, unknown> = {};
let modelsList: () => Promise<unknown> = async () => ({ data: [] });

jest.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: () => ({ accountInfo: async () => accountInfo, close: () => {} }),
}));
jest.mock("@anthropic-ai/sdk", () => {
  class AuthenticationError extends Error {}
  class PermissionDeniedError extends Error {}
  class Anthropic {
    static AuthenticationError = AuthenticationError;
    static PermissionDeniedError = PermissionDeniedError;
    models = { list: () => modelsList() };
  }
  return { __esModule: true, default: Anthropic };
});

import Anthropic from "@anthropic-ai/sdk";
import { getAccountStatus } from "@/lib/account";

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

describe("getAccountStatus: login mode", () => {
  beforeEach(() => {
    delete process.env.PLAYGROUND_AUTH;
  });

  it("is ready with a Claude subscription", async () => {
    accountInfo = { email: "a@b.c", subscriptionType: "Claude Pro", apiProvider: "firstParty" };
    expect(await getAccountStatus()).toEqual({ ready: true, mode: "login", label: "Claude Pro" });
  });

  it("is ready through a cloud provider, even without a Claude login", async () => {
    accountInfo = { apiProvider: "bedrock" };
    expect(await getAccountStatus()).toEqual({ ready: true, mode: "cloud", label: "Amazon Bedrock" });
  });

  it("is not ready when nobody is signed in", async () => {
    accountInfo = { tokenSource: "none", apiProvider: "firstParty" };
    expect(await getAccountStatus()).toMatchObject({ ready: false, mode: "login", reason: expect.stringMatching(/not signed in/) });
  });
});

describe("getAccountStatus: API-key mode", () => {
  beforeEach(() => {
    process.env.PLAYGROUND_AUTH = "api-key";
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
  });

  it("is ready when the key works", async () => {
    modelsList = async () => ({ data: [] });
    expect(await getAccountStatus()).toEqual({ ready: true, mode: "api-key", label: "API key" });
  });

  it("says so right away when the key is rejected", async () => {
    modelsList = async () => {
      throw new (Anthropic as unknown as { AuthenticationError: new () => Error }).AuthenticationError();
    };
    expect(await getAccountStatus()).toMatchObject({ ready: false, reason: expect.stringMatching(/rejected \(401\)/) });
  });

  it("lets you try anyway when the key can't be checked (offline)", async () => {
    modelsList = async () => {
      throw new Error("fetch failed");
    };
    expect(await getAccountStatus()).toMatchObject({ ready: true, warning: expect.stringMatching(/Couldn't verify/) });
  });

  it("explains a missing key", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect(await getAccountStatus()).toMatchObject({ ready: false, reason: expect.stringMatching(/ANTHROPIC_API_KEY isn't/) });
  });
});
