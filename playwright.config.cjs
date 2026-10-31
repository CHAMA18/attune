const { defineConfig, devices } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests/e2e', timeout: 30000, fullyParallel: false,
  use: { baseURL: 'http://127.0.0.1:18780', headless: true },
  projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'] } }, { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } }],
  webServer: { command: 'node tests/e2e/server.cjs', url: 'http://127.0.0.1:18780', reuseExistingServer: false, timeout: 10000 }
});
