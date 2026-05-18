import { NextRequest, NextResponse } from "next/server";
import { bumpPostStat } from "@/lib/config";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const postId = searchParams.get("p");
  const target = searchParams.get("u");

  if (!target) {
    return NextResponse.json({ error: "Missing target URL" }, { status: 400 });
  }

  let decodedTarget: string;
  try {
    decodedTarget = decodeURIComponent(target);
    const parsed = new URL(decodedTarget);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw new Error("Invalid protocol");
    }
  } catch {
    return NextResponse.json({ error: "Invalid target URL" }, { status: 400 });
  }

  if (postId) {
    try {
      await bumpPostStat(postId, "linkClicks");
    } catch (err) {
      console.error("Failed to record link click:", err);
    }
  }

  return NextResponse.redirect(decodedTarget, 302);
}
