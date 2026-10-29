import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "plandosee-api",
    schemaVersion: "2.0.0",
    commitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.APP_COMMIT_SHA ?? "local",
  });
}
