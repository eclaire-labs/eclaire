import { NextResponse } from "next/server";

export async function GET() {
  const buildInfo = {
    version: process.env.APP_VERSION || "N/A",
    fullVersion: process.env.APP_FULL_VERSION || "N/A",
    gitHash: process.env.APP_GIT_HASH || "N/A",
    buildTimestamp: process.env.APP_BUILD_TIMESTAMP || "N/A",
  };

  return NextResponse.json({
    status: "healthy",
    service: "eclaire-frontend",
    version: buildInfo.version,
    fullVersion: buildInfo.fullVersion,
    gitHash: buildInfo.gitHash,
    buildTimestamp: buildInfo.buildTimestamp,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || "development",
  });
}
