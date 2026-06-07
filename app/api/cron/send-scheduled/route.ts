import { NextRequest, NextResponse } from "next/server";
import {
  fetchDueMessages,
  markSent,
  markSkipped,
  markFailed,
} from "@/lib/scheduledMessages";

const ACCESS_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN!;
const CRON_SECRET = process.env.CRON_SECRET;
const GRAPH_API = "https://graph.instagram.com/v21.0";

// Hard upper bound — Instagram's window is 24h, we keep a 30-min safety margin.
const MAX_WINDOW_MS = 23.5 * 60 * 60 * 1000;

let cachedUserId: string | null = null;

async function getMyUserId(): Promise<string> {
  if (cachedUserId) return cachedUserId;
  const res = await fetch(`${GRAPH_API}/me?fields=id&access_token=${ACCESS_TOKEN}`);
  const data = await res.json();
  cachedUserId = data.id;
  return data.id;
}

async function sendDM(recipientId: string, text: string): Promise<{ ok: boolean; error?: string }> {
  const myUserId = await getMyUserId();
  const res = await fetch(`${GRAPH_API}/${myUserId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { text },
      access_token: ACCESS_TOKEN,
    }),
  });
  const data = await res.json();
  if (data.error) {
    return { ok: false, error: data.error.message || JSON.stringify(data.error) };
  }
  return { ok: true };
}

// GET — invoked by Vercel Cron. Auth: Vercel sends Authorization: Bearer <CRON_SECRET>.
export async function GET(request: NextRequest) {
  if (CRON_SECRET) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const due = await fetchDueMessages(50);
  console.log(`Cron: ${due.length} due messages`);

  const results = { sent: 0, skipped: 0, failed: 0 };

  for (const msg of due) {
    const elapsedMs =
      Date.now() - new Date(msg.trigger_postback_at).getTime();
    if (elapsedMs > MAX_WINDOW_MS) {
      await markSkipped(
        msg.id,
        `24h window exceeded (elapsed ${Math.round(elapsedMs / 3600000)}h)`
      );
      results.skipped++;
      continue;
    }

    const send = await sendDM(msg.recipient_id, msg.message_text);
    if (send.ok) {
      await markSent(msg.id);
      results.sent++;
    } else {
      const outsideWindow = /outside.*window|24.?hour/i.test(send.error || "");
      if (outsideWindow) {
        await markSkipped(msg.id, send.error || "outside window");
        results.skipped++;
      } else {
        await markFailed(msg.id, send.error || "unknown");
        results.failed++;
      }
    }

    // Respect Meta's 200/hour rate limit — 200ms between sends = ~5/sec
    await new Promise((r) => setTimeout(r, 200));
  }

  return NextResponse.json({ processed: due.length, ...results });
}
