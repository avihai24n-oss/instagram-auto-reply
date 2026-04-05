import { NextRequest, NextResponse } from "next/server";
import { getConfig, AppConfig, KeywordTrigger } from "@/lib/config";

const ACCESS_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN!;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN!;
const GRAPH_API = "https://graph.instagram.com/v21.0";

// Track processed IDs to prevent duplicate replies
const processedComments = new Set<string>();
const processedMessages = new Set<string>();

let cachedUserId: string | null = null;

// GET — Webhook verification
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
    console.log("Webhook event:", JSON.stringify(body, null, 2));

    const config = await getConfig();

    if (!config.globalSettings.botEnabled) {
      console.log("Bot is disabled");
      return NextResponse.json({ status: "disabled" }, { status: 200 });
    }

    if (body.entry) {
      for (const entry of body.entry) {
        // Handle comment & mention events
        if (entry.changes) {
          for (const change of entry.changes) {
            if (change.field === "comments") {
              console.log("COMMENT DATA:", JSON.stringify(change.value));
              await handleComment(change.value, config);
            }
            if (change.field === "mentions") {
              console.log("Story mention received:", change.value);
            }
          }
        }

        // Handle messaging events (DMs, postbacks)
        if (entry.messaging) {
          for (const event of entry.messaging) {
            if (event.message) {
              await handleIncomingMessage(event, config);
            }
            if (event.postback) {
              await handlePostback(event, config);
            }
          }
        }
      }
    }

    return NextResponse.json({ status: "ok" }, { status: 200 });
  } catch (error) {
    console.error("Error processing webhook:", error);
    return NextResponse.json({ status: "ok" }, { status: 200 });
  }
}

// ========== Comment Handler ==========
async function handleComment(
  commentData: {
    id: string;
    text: string;
    from: { id: string; username: string };
    media: { id: string };
    parent_id?: string;
  },
  config: AppConfig
) {
  const { id: commentId, text, from, media } = commentData;

  // Skip replies to comments
  if (commentData.parent_id) return;

  // Skip already processed
  if (processedComments.has(commentId)) return;
  processedComments.add(commentId);

  // Don't reply to ourselves
  const myUserId = await getMyUserId();
  if (from.id === myUserId) return;

  console.log(`Comment from @${from.username} on media ${media.id}: "${text}"`);
  console.log(`Config has ${config.posts.length} posts, ${config.keywordTriggers.length} keyword triggers`);
  console.log(`Configured post mediaIds: ${config.posts.map(p => p.mediaId).join(", ")}`);
  console.log(`Webhook media.id: "${media.id}"`);

  // 1. Check if there's a specific post config for this media
  // Try matching by mediaId first, then by permalink
  let postConfig = config.posts.find(
    (p) => p.enabled && p.mediaId === media.id
  );

  // If no match by mediaId, fetch permalink from API and match by that
  if (!postConfig) {
    const permalink = await getMediaPermalink(media.id);
    if (permalink) {
      postConfig = config.posts.find(
        (p) => p.enabled && p.permalink && p.permalink === permalink
      );
      // If matched, update the stored mediaId for faster future matching
      if (postConfig) {
        console.log(`Matched by permalink, updating stored mediaId from ${postConfig.mediaId} to ${media.id}`);
        postConfig.mediaId = media.id;
        const { saveConfig } = await import("@/lib/config");
        await saveConfig(config);
      }
    }
  }

  console.log(`Post config match: ${postConfig ? postConfig.name : "NONE"}`);
  if (postConfig) {
    console.log(`Post keywords: ${JSON.stringify(postConfig.keywords)}, replyMessage: "${postConfig.replyMessage}"`);
  }

  if (postConfig) {
    // If post has keywords, check if comment matches
    if (postConfig.keywords.length > 0) {
      const lowerText = text.toLowerCase();
      const matched = postConfig.keywords.some((kw) =>
        lowerText.includes(kw.toLowerCase())
      );
      if (!matched) {
        console.log("Comment doesn't match post keywords, skipping");
        return;
      }
    }

    // Use post-specific messages
    const actions: Promise<void>[] = [
      replyToComment(commentId, postConfig.replyMessage, from.username),
    ];
    if (postConfig.sendDM) {
      actions.push(
        sendDirectMessage(from.id, postConfig.dmMessage, config.quickReplies)
      );
    }
    await Promise.allSettled(actions);
    return;
  }

  // 2. Check global keyword triggers
  const matchedKeyword = findMatchingKeyword(text, config.keywordTriggers);
  if (matchedKeyword) {
    const actions: Promise<void>[] = [
      replyToComment(commentId, matchedKeyword.replyMessage, from.username),
    ];
    if (matchedKeyword.sendDM) {
      actions.push(
        sendDirectMessage(from.id, matchedKeyword.dmMessage, config.quickReplies)
      );
    }
    await Promise.allSettled(actions);
    return;
  }

  // No matching post config or keyword — do nothing
  console.log(`No matching rule for comment ${commentId}, skipping`);
}

// ========== Incoming DM Handler ==========
async function handleIncomingMessage(
  event: {
    sender: { id: string };
    recipient: { id: string };
    message: { mid: string; text?: string };
  },
  config: AppConfig
) {
  const { sender, message } = event;

  if (processedMessages.has(message.mid)) return;
  processedMessages.add(message.mid);

  const myUserId = await getMyUserId();
  if (sender.id === myUserId) return;

  console.log(`DM from ${sender.id}: "${message.text}"`);

  // Check if message matches any keyword trigger
  if (message.text) {
    const matchedKeyword = findMatchingKeyword(message.text, config.keywordTriggers);
    if (matchedKeyword) {
      await sendDirectMessage(sender.id, matchedKeyword.dmMessage, config.quickReplies);
      return;
    }
  }

  // Welcome message for new conversations
  if (config.welcomeMessage.enabled && message.text) {
    await sendDirectMessage(sender.id, config.welcomeMessage.message, config.quickReplies);
  }
}

// ========== Postback Handler (Quick Reply clicks) ==========
async function handlePostback(
  event: {
    sender: { id: string };
    postback: { title: string; payload: string };
  },
  config: AppConfig
) {
  const { sender, postback } = event;
  console.log(`Postback from ${sender.id}: ${postback.payload}`);

  // Match payload to a keyword trigger
  const matchedKeyword = config.keywordTriggers.find(
    (k) => k.enabled && k.keyword.toLowerCase() === postback.payload.toLowerCase()
  );

  if (matchedKeyword) {
    await sendDirectMessage(sender.id, matchedKeyword.dmMessage, config.quickReplies);
  }
}

// ========== Helper Functions ==========

function findMatchingKeyword(
  text: string,
  triggers: KeywordTrigger[]
): KeywordTrigger | undefined {
  const lowerText = text.toLowerCase();
  return triggers.find((trigger) => {
    if (!trigger.enabled) return false;
    const kw = trigger.keyword.toLowerCase();
    if (trigger.matchExact) {
      const regex = new RegExp(`(^|\\s)${escapeRegex(kw)}($|\\s)`);
      return regex.test(lowerText);
    }
    return lowerText.includes(kw);
  });
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function getMediaPermalink(mediaId: string): Promise<string | null> {
  try {
    const res = await fetch(`${GRAPH_API}/${mediaId}?fields=permalink&access_token=${ACCESS_TOKEN}`);
    const data = await res.json();
    if (data.error) {
      console.error("Error fetching media permalink:", data.error);
      return null;
    }
    console.log(`Media ${mediaId} permalink: ${data.permalink}`);
    return data.permalink || null;
  } catch (error) {
    console.error("Failed to fetch media permalink:", error);
    return null;
  }
}

async function getMyUserId(): Promise<string> {
  if (cachedUserId) return cachedUserId;
  const res = await fetch(`${GRAPH_API}/me?fields=id&access_token=${ACCESS_TOKEN}`);
  const data = await res.json();
  cachedUserId = data.id;
  return data.id;
}

async function replyToComment(commentId: string, message: string, username: string) {
  try {
    const res = await fetch(`${GRAPH_API}/${commentId}/replies`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, access_token: ACCESS_TOKEN }),
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

async function sendDirectMessage(
  recipientId: string,
  message: string,
  quickRepliesConfig: AppConfig["quickReplies"]
) {
  try {
    const myUserId = await getMyUserId();

    // Build message payload
    const messagePayload: Record<string, unknown> = { text: message };

    // Add quick replies if enabled
    if (quickRepliesConfig.enabled && quickRepliesConfig.options.length > 0) {
      messagePayload.quick_replies = quickRepliesConfig.options.map((opt) => ({
        content_type: "text",
        title: opt.title,
        payload: opt.payload,
      }));
    }

    const res = await fetch(`${GRAPH_API}/${myUserId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: { id: recipientId },
        message: messagePayload,
        access_token: ACCESS_TOKEN,
      }),
    });

    const data = await res.json();
    if (data.error) {
      console.error("Error sending DM:", data.error);
    } else {
      console.log(`DM sent to ${recipientId}`);
    }
  } catch (error) {
    console.error("Failed to send DM:", error);
  }
}
