import type { Config } from "jest";
import nextJest from "next/jest.js";

const createJestConfig = nextJest({ dir: "./" });

const config: Config = {
  coverageProvider: "v8",
  // Logic tests run in Node; component tests opt into jsdom with a docblock.
  testEnvironment: "node",
  // `npm run test:e2e` runs only the real-Claude tests; `npm test` skips them.
  testMatch:
    process.env.npm_lifecycle_event === "test:e2e"
      ? ["<rootDir>/tests/e2e/**/*.e2e.test.ts"]
      : ["<rootDir>/tests/**/*.test.ts?(x)", "!**/e2e/**"],
  setupFilesAfterEnv: ["<rootDir>/tests/setup.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    // "server-only" throws outside a Next.js server bundle; it's a marker, so stub it.
    "^server-only$": "<rootDir>/tests/stubs/empty.ts",
  },
  modulePathIgnorePatterns: ["<rootDir>/workspace/", "<rootDir>/.workspaces/", "<rootDir>/templates/", "<rootDir>/.next/"],
};

export default createJestConfig(config);
