import { NextRequest, NextResponse } from "next/server";

const JSON_REWRITE_MAP: Record<string, string> = {
  "/": "/_api/status",
  "/challenges": "/_api/challenges",
  "/leaderboard": "/_api/leaderboard",
  "/about": "/_api/about",
  "/protocol": "/_api/protocol",
};

const CHALLENGE_DETAIL_PATTERN = /^\/challenges\/([a-z][a-z0-9-]*[a-z0-9])$/;

export function middleware(request: NextRequest) {
  const accept = request.headers.get("accept") || "";
  if (!accept.includes("application/json")) {
    return NextResponse.next();
  }

  const path = request.nextUrl.pathname;

  // Static rewrites
  const rewrite = JSON_REWRITE_MAP[path];
  if (rewrite) {
    const url = request.nextUrl.clone();
    url.pathname = rewrite;
    return NextResponse.rewrite(url);
  }

  // Dynamic: /challenges/:slug
  const challengeMatch = CHALLENGE_DETAIL_PATTERN.exec(path);
  if (challengeMatch) {
    const url = request.nextUrl.clone();
    url.pathname = `/_api/challenges/${challengeMatch[1]}`;
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/challenges", "/challenges/:slug*", "/leaderboard", "/about", "/protocol"],
};
