import { NextResponse } from "next/server";
import { getScheduledStats, getRecentScheduled } from "@/lib/scheduledMessages";

export async function GET() {
  const [stats, recent] = await Promise.all([
    getScheduledStats(),
    getRecentScheduled(50),
  ]);
  return NextResponse.json({ stats, recent });
}
