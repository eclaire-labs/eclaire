import type { APIRequestContext, Page } from "@playwright/test";
import { expect } from "@playwright/test";

export interface TestUser {
	name: string;
	email: string;
	password: string;
}

let counter = 0;

export function generateTestUser(): TestUser {
	const ts = Date.now();
	const id = `${ts}-${++counter}`;
	return {
		name: "E2E Test",
		email: `e2e-${id}@test.local`,
		password: "TestPass123!",
	};
}

/**
 * Register a user via the API and return the cookies for authenticated requests.
 */
export async function registerViaAPI(
	request: APIRequestContext,
	user: TestUser,
): Promise<void> {
	const response = await request.post("/api/auth/sign-up/email", {
		data: {
			name: user.name,
			email: user.email,
			password: user.password,
		},
	});
	expect(response.ok(), `Registration failed: ${response.status()}`).toBe(
		true,
	);
}

/**
 * Register a user through the browser UI.
 * After registration, the app may auto-sign-in to /dashboard
 * or redirect to the login page. This helper handles both cases.
 */
export async function registerViaUI(page: Page, user: TestUser): Promise<void> {
	await page.goto("/auth/register");

	await page.getByLabel("Name").fill(user.name);
	await page.getByLabel("Email").fill(user.email);
	await page.getByLabel("Password", { exact: true }).fill(user.password);
	await page.getByLabel("Confirm Password").fill(user.password);
	await page.getByRole("button", { name: "Create account" }).click();

	// Wait for navigation to either dashboard (auto-sign-in) or login page
	// Registration can be slow if the backend is under load from processing
	await page.waitForURL(/\/(dashboard|auth\/login)/, { timeout: 30_000 });

	// If redirected to login, sign in
	if (page.url().includes("/auth/login")) {
		await page.getByLabel("Email").fill(user.email);
		await page.getByLabel("Password").fill(user.password);
		await page.getByRole("button", { name: "Sign in" }).click();
		await page.waitForURL("**/dashboard", { timeout: 15_000 });
	}
}
