import { defineConfig } from "@playwright/test";
import { join } from "node:path";
import { tmpdir } from "node:os";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  outputDir: join(tmpdir(), "hhr-playwright-artifacts"),
  reporter: "line",
  use: {
    headless: true,
    locale: "es-CL",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
