import { NextResponse } from "next/server";
import { clearSession } from "@/lib/session";

export async function POST(request: Request) {
  await clearSession(request);
  const target = new URL(request.url).searchParams.get("target") === "admin"
    ? "/admin/login"
    : "/login";
  return NextResponse.redirect(new URL(target, request.url), 303);
}
