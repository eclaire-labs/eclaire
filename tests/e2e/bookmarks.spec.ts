import { test, expect } from "@playwright/test";
import { generateTestUser, registerViaAPI, registerViaUI } from "./helpers/auth";
import { waitForProcessingComplete } from "./helpers/polling";

const BOOKMARK_URL = "https://news.ycombinator.com";

test.describe("Bookmarks - API @api", () => {
	const user = generateTestUser();
	let bookmarkId: string;

	test.beforeAll(async ({ request }) => {
		await registerViaAPI(request, user);
	});

	test("create bookmark returns 202", async ({ request }) => {
		const response = await request.post("/api/bookmarks", {
			data: { url: BOOKMARK_URL },
		});
		expect(response.status()).toBe(202);

		const body = (await response.json()) as Record<string, unknown>;
		bookmarkId = body.id as string;
		expect(bookmarkId).toBeTruthy();
	});

	test("processing completes successfully", async ({ request }) => {
		const bookmark = await waitForProcessingComplete(request, bookmarkId);
		expect(bookmark.processingStatus).toBe("completed");
		expect(bookmark.title).toBeTruthy();
	});

	test("bookmark details are populated", async ({ request }) => {
		const response = await request.get(`/api/bookmarks/${bookmarkId}`);
		expect(response.ok()).toBe(true);

		const bookmark = (await response.json()) as Record<string, unknown>;
		expect(bookmark.title).toBeTruthy();
		expect(bookmark.processingStatus).toBe("completed");
	});

	test.afterAll(async ({ request }) => {
		if (bookmarkId) {
			await request.delete(`/api/bookmarks/${bookmarkId}`);
		}
	});
});

test.describe("Bookmarks - Browser @browser", () => {
	const user = generateTestUser();

	test("full bookmark flow through UI", async ({ page }) => {
		// 1. Register via UI
		await registerViaUI(page, user);

		// 2. Navigate to bookmarks
		await page.goto("/bookmarks");
		await expect(page.getByText("Your bookmark collection is empty")).toBeVisible();

		// 3. Create bookmark
		await page.getByRole("button", { name: "New Bookmark" }).click();
		await page.getByRole("textbox", { name: "URL" }).fill(BOOKMARK_URL);
		await page.getByRole("button", { name: "Save" }).click();

		// 4. Wait for dialog to close and bookmark to appear in the list
		await expect(page.getByRole("dialog")).toBeHidden({ timeout: 30_000 });
		await expect(
			page.getByText("news.ycombinator.com", { exact: true }),
		).toBeVisible({ timeout: 15_000 });

		// 5. Wait for processing to complete via API polling
		// Use page.request which shares the browser's auth cookies
		const apiRequest = page.request;
		const listResponse = await apiRequest.get("/api/bookmarks");
		const listBody = (await listResponse.json()) as {
			items: Array<{ id: string }>;
		};
		const bookmarkId = listBody.items[0]?.id;
		expect(bookmarkId).toBeTruthy();

		await waitForProcessingComplete(apiRequest, bookmarkId);

		// 6. Reload and verify the bookmark card shows the title
		await page.reload();
		await expect(page.getByText("Hacker News")).toBeVisible({
			timeout: 10_000,
		});

		// 7. Click into detail page and verify
		await page.getByText("Hacker News").click();
		await page.waitForURL("**/bookmarks/**");

		await expect(
			page.getByRole("heading", { name: "Hacker News" }),
		).toBeVisible();
		await expect(page.getByText("completed")).toBeVisible();

		// Cleanup
		await apiRequest.delete(`/api/bookmarks/${bookmarkId}`);
	});
});
