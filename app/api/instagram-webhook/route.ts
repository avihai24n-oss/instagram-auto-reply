import { NextRequest, NextResponse } from "next/server";

const VERIFY_TOKEN = process.env.VERIFY_TOKEN!;
const ACCESS_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN!;
const GRAPH_API = "https://graph.instagram.com/v21.0";
const BOT_ENABLED = process.env.BOT_ENABLED !== "false"; // enabled by default

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

async function handleComment(commentData: {
  id: string;
  text: string;
  from: { id: string; username: string };
  media: { id: string };
}) {
  const { id: commentId, from, media } = commentData;
  const senderId = from.id;
  const senderUsername = from.username;

  console.log(
    `New comment from @${senderUsername} (${senderId}) on media ${media.id}`
  );

  // Don't reply to our own comments (get our own user ID first)
  const myUserId = await getMyUserId();
  if (senderId === myUserId) {
    console.log("Skipping — this is our own comment");
    return;
  }

  // Run both actions in parallel: reply to comment + send DM
  await Promise.allSettled([
    replyToComment(commentId, senderUsername),
    sendDirectMessage(senderId),
  ]);
}

async function getMyUserId(): Promise<string> {
  const res = await fetch(`${GRAPH_API}/me?fields=id&access_token=${ACCESS_TOKEN}`);
  const data = await res.json();
  return data.id;
}

async function replyToComment(commentId: string, username: string) {
  const message = `זוהי הודעת בדיקה`;

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

async function sendDirectMessage(recipientId: string) {
  const message = `זוהי הודעת בדיקה`;

  try {
    // Get our own ID for the messages endpoint
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
