import { defineConfig } from "@playwright/test";

export default defineConfig({
	testDir: ".",
	timeout: 120_000,
	expect: { timeout: 10_000 },
	fullyParallel: false,
	retries: process.env.CI ? 1 : 0,
	use: {
		baseURL: "http://localhost:3000",
		trace: "on-first-retry",
	},
	projects: [{ name: "chromium", use: { browserName: "chromium" } }],
	webServer: {
		command: "pnpm dev",
		url: "http://localhost:3000",
		reuseExistingServer: !process.env.CI,
		timeout: 30_000,
		cwd: "../..",
	},
	reporter: process.env.CI
		? "github"
		: [["html", { outputFolder: "playwright-report" }]],
	outputDir: "./test-results",
});
