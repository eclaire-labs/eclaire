import type { APIRequestContext } from "@playwright/test";

interface PollOptions {
	timeout?: number;
	interval?: number;
}

/**
 * Poll a bookmark's processing status until it reaches "completed".
 * Returns the final bookmark data.
 */
export async function waitForProcessingComplete(
	request: APIRequestContext,
	bookmarkId: string,
	options: PollOptions = {},
): Promise<Record<string, unknown>> {
	const { timeout = 90_000, interval = 2_000 } = options;
	const deadline = Date.now() + timeout;
	let lastStatus = "unknown";

	while (Date.now() < deadline) {
		const response = await request.get(`/api/bookmarks/${bookmarkId}`);
		if (!response.ok()) {
			throw new Error(
				`Failed to fetch bookmark ${bookmarkId}: ${response.status()}`,
			);
		}

		const data = (await response.json()) as Record<string, unknown>;
		lastStatus = data.processingStatus as string;

		if (lastStatus === "completed") {
			return data;
		}
		if (lastStatus === "failed") {
			throw new Error(
				`Bookmark processing failed for ${bookmarkId}: ${JSON.stringify(data)}`,
			);
		}

		await new Promise((r) => setTimeout(r, interval));
	}

	throw new Error(
		`Bookmark ${bookmarkId} processing timed out after ${timeout}ms. Last status: ${lastStatus}`,
	);
}
