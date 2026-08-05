import { test as base } from "@playwright/test";
import { startLocalApp } from "../integration/local-app.mjs";
import { historySeedSql } from "./helpers.mjs";

export const test = base.extend({
  app: [async ({ browser }, use) => {
    void browser;
    const app = await startLocalApp({ seedSql: historySeedSql() });
    await use(app);
    await app.close();
  }, { scope: "worker", timeout: 90_000 }],
});

export { expect } from "@playwright/test";
