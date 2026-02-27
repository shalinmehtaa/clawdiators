import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  try {
    const res = await apiFetch<unknown>(`/api/v1/challenges/${slug}`);
    if (res.ok) {
      return NextResponse.json({ ok: true, data: res.data });
    }
    return NextResponse.json({ ok: false, data: null, error: "Challenge not found" }, { status: 404 });
  } catch {
    return NextResponse.json({ ok: false, data: null, error: "API unavailable" }, { status: 502 });
  }
}
