import { NextRequest, NextResponse } from "next/server";
import { triggerRules, TriggerRule } from "@/app/config/triggers";

const VERIFY_TOKEN = process.env.VERIFY_TOKEN!;
const ACCESS_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN!;
const GRAPH_API = "https://graph.instagram.com/v21.0";
const BOT_ENABLED = process.env.BOT_ENABLED !== "false"; // enabled by default

// Track processed comment IDs to prevent duplicate replies
const processedComments = new Set<string>();

// GET — Webhook verification (Meta sends this to verify your endpoint)
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("Webhook verified successfully");
    return new NextResponse(challenge, { status: 200 });
  }

  console.warn("Webhook verification failed", { mode, token });
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

// POST — Handle incoming webhook events
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log("Webhook event received:", JSON.stringify(body, null, 2));

    if (!BOT_ENABLED) {
      console.log("Bot is disabled");
      return NextResponse.json({ status: "disabled" }, { status: 200 });
    }

    // Process each entry from the webhook payload
    if (body.entry) {
      for (const entry of body.entry) {
        // Handle comment events
        if (entry.changes) {
          for (const change of entry.changes) {
            if (change.field === "comments") {
              await handleComment(change.value);
            }
          }
        }
      }
    }

    // Always return 200 quickly to acknowledge receipt
    return NextResponse.json({ status: "ok" }, { status: 200 });
  } catch (error) {
    console.error("Error processing webhook:", error);
    // Still return 200 to prevent Meta from retrying
    return NextResponse.json({ status: "ok" }, { status: 200 });
  }
}

// Find the first matching trigger rule for a comment
function findMatchingRule(
  commentText: string,
  mediaId: string
): TriggerRule | null {
  const lowerText = commentText.toLowerCase();

  for (const rule of triggerRules) {
    if (!rule.enabled) continue;

    // Check if mediaId matches (if specified)
    if (rule.mediaId && rule.mediaId !== mediaId) continue;

    // Check keywords (empty keywords = match any comment)
    if (rule.keywords.length === 0) return rule;

    const hasKeyword = rule.keywords.some((keyword) =>
      lowerText.includes(keyword.toLowerCase())
    );
    if (hasKeyword) return rule;
  }

  return null;
}

async function handleComment(commentData: {
  id: string;
  text: string;
  from: { id: string; username: string };
  media: { id: string };
  parent_id?: string;
}) {
  const { id: commentId, text: commentText, from, media } = commentData;
  const senderId = from.id;
  const senderUsername = from.username;

  console.log(
    `New comment from @${senderUsername}: "${commentText}" on media ${media.id}`
  );

  // Skip if this is a reply to another comment (not a top-level comment)
  if (commentData.parent_id) {
    console.log("Skipping — this is a reply to a comment, not a top-level comment");
    return;
  }

  // Skip if we already processed this comment
  if (processedComments.has(commentId)) {
    console.log("Skipping — already processed this comment");
    return;
  }
  processedComments.add(commentId);

  // Don't reply to our own comments
  const myUserId = await getMyUserId();
  if (senderId === myUserId) {
    console.log("Skipping — this is our own comment");
    return;
  }

  // Find a matching trigger rule
  const rule = findMatchingRule(commentText, media.id);
  if (!rule) {
    console.log("No matching trigger rule found — skipping");
    return;
  }

  console.log(`Matched trigger rule: "${rule.id}"`);

  // Run both actions in parallel: reply to comment + send DM
  await Promise.allSettled([
    replyToComment(commentId, senderUsername, rule.commentReply),
    sendDirectMessage(senderId, rule.dmMessage),
  ]);
}

async function getMyUserId(): Promise<string> {
  const res = await fetch(`${GRAPH_API}/me?fields=id&access_token=${ACCESS_TOKEN}`);
  const data = await res.json();
  return data.id;
}

async function replyToComment(commentId: string, username: string, message: string) {
  try {
    const res = await fetch(`${GRAPH_API}/${commentId}/replies`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        access_token: ACCESS_TOKEN,
      }),
    });

    const data = await res.json();
    if (data.error) {
      console.error("Error replying to comment:", data.error);
    } else {
      console.log(`Replied to comment ${commentId} for @${username}`);
    }
  } catch (error) {
    console.error("Failed to reply to comment:", error);
  }
}

async function sendDirectMessage(recipientId: string, message: string) {
  try {
    const myUserId = await getMyUserId();

    const res = await fetch(`${GRAPH_API}/${myUserId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: { id: recipientId },
        message: { text: message },
        access_token: ACCESS_TOKEN,
      }),
    });

    const data = await res.json();
    if (data.error) {
      console.error("Error sending DM:", data.error);
    } else {
      console.log(`DM sent to user ${recipientId}`);
    }
  } catch (error) {
    console.error("Failed to send DM:", error);
  }
}
