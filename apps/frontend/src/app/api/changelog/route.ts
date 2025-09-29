import { readFile } from "fs/promises";
import { NextResponse } from "next/server";
import { join } from "path";

export async function GET() {
  try {
    // Try to read the changelog file from two possible locations:
    // 1. Development: project root (CHANGELOG.md)
    // 2. Production: public directory (moved by Dockerfile)
    let changelogContent: string;
    let changelogPath: string;

    try {
      // First, try the project root (development)
      changelogPath = join(process.cwd(), "CHANGELOG.md");
      changelogContent = await readFile(changelogPath, "utf-8");
    } catch {
      // If that fails, try the public directory (production)
      changelogPath = join(process.cwd(), "public", "changelog.md");
      changelogContent = await readFile(changelogPath, "utf-8");
    }

    return NextResponse.json({
      content: changelogContent,
      lastModified: new Date().toISOString(),
      status: "success",
    });
  } catch (error) {
    console.error("Error reading changelog:", error);

    return NextResponse.json(
      {
        error: "Changelog not found or could not be read",
        status: "error",
      },
      { status: 404 },
    );
  }
}
