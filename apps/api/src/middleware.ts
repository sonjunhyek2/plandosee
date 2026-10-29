import { NextRequest, NextResponse } from "next/server";

function allowedOrigins(): Set<string> {
  return new Set(
    (process.env.ALLOWED_ORIGINS ?? "http://localhost:3000")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  );
}

function corsHeaders(origin: string | null): Record<string, string> {
  if (!origin || !allowedOrigins().has(origin)) return {};

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export function middleware(request: NextRequest) {
  const headers = corsHeaders(request.headers.get("origin"));

  if (request.method === "OPTIONS") {
    return new NextResponse(null, {
      status: Object.keys(headers).length > 0 ? 204 : 403,
      headers,
    });
  }

  const response = NextResponse.next();
  for (const [key, value] of Object.entries(headers)) {
    response.headers.set(key, value);
  }
  return response;
}

export const config = {
  matcher: "/api/:path*",
};
