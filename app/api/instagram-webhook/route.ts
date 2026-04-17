import { NextRequest, NextResponse } from "next/server";
import { getConfig, saveConfig, AppConfig, KeywordTrigger, FlowStep } from "@/lib/config";

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
        if (entry.changes) {
          for (const change of entry.changes) {
            if (change.field === "comments") {
              await handleComment(change.value, config);
            }
            if (change.field === "mentions") {
              console.log("Story mention received:", change.value);
            }
          }
        }

        if (entry.messaging) {
          for (const event of entry.messaging) {
            if (event.postback) {
              await handlePostback(event, config);
            } else if (event.message) {
              await handleIncomingMessage(event, config);
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

  if (commentData.parent_id) return;
  if (processedComments.has(commentId)) return;
  processedComments.add(commentId);

  const myUserId = await getMyUserId();
  if (from.id === myUserId) return;

  console.log(`Comment from @${from.username} on media ${media.id}: "${text}"`);

  // Match by mediaId first, then fallback to permalink
  let postConfig = config.posts.find((p) => p.enabled && p.mediaId === media.id);

  if (!postConfig) {
    const permalink = await getMediaPermalink(media.id);
    if (permalink) {
      postConfig = config.posts.find(
        (p) => p.enabled && p.permalink && p.permalink === permalink
      );
      if (postConfig) {
        postConfig.mediaId = media.id;
        await saveConfig(config);
      }
    }
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

    const flowId = `post:${postConfig.id}`;
    console.log(`Matched post "${postConfig.name}" (id=${postConfig.id}) sendDM=${postConfig.sendDM} flowSteps=${postConfig.dmFlow?.length ?? 0} dmMessage="${postConfig.dmMessage}"`);
    const actions: Promise<void>[] = [];
    const picked = pickRandomReply(postConfig.replyMessages);
    if (picked) {
      actions.push(replyToComment(commentId, picked, from.username));
    } else {
      console.log("No reply message configured — skipping comment reply");
    }
    if (postConfig.sendDM) {
      actions.push(
        sendFlowOrText(
          { commentId },
          postConfig.dmFlow,
          postConfig.dmMessage,
          flowId
        )
      );
    } else {
      console.log("sendDM is false on this post — skipping DM");
    }
    await Promise.allSettled(actions);
    return;
  }

  // Check global keyword triggers
  const matchedKeyword = findMatchingKeyword(text, config.keywordTriggers);
  if (matchedKeyword) {
    const flowId = `keyword:${matchedKeyword.id}`;
    const actions: Promise<void>[] = [
      replyToComment(commentId, matchedKeyword.replyMessage, from.username),
    ];
    if (matchedKeyword.sendDM) {
      actions.push(
        sendFlowOrText(
          { commentId },
          matchedKeyword.dmFlow,
          matchedKeyword.dmMessage,
          flowId
        )
      );
    }
    await Promise.allSettled(actions);
    return;
  }

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

  if (message.text) {
    const matchedKeyword = findMatchingKeyword(message.text, config.keywordTriggers);
    if (matchedKeyword) {
      const flowId = `keyword:${matchedKeyword.id}`;
      await sendFlowOrText(
        { userId: sender.id },
        matchedKeyword.dmFlow,
        matchedKeyword.dmMessage,
        flowId
      );
      return;
    }
  }

  // Welcome message for new conversations
  if (config.welcomeMessage.enabled && message.text) {
    await sendPlainText({ userId: sender.id }, config.welcomeMessage.message);
  }
}

// ========== Postback Handler (button click) ==========
async function handlePostback(
  event: {
    sender: { id: string };
    postback: { title: string; payload: string };
  },
  config: AppConfig
) {
  const { sender, postback } = event;
  console.log(`Postback from ${sender.id}: ${postback.payload}`);

  // Payload format: flow:${flowId}:${stepIndex}
  // e.g. "flow:post:abc123:2" means flowId="post:abc123", stepIndex=2
  const match = postback.payload.match(/^flow:(.+):(\d+)$/);
  if (!match) {
    console.log("Postback payload does not match flow pattern, ignoring");
    return;
  }

  const flowId = match[1];
  const stepIndex = parseInt(match[2], 10);

  const flow = getFlowById(flowId, config);
  if (!flow || !flow[stepIndex]) {
    console.log(`Flow step not found: ${flowId} step ${stepIndex}`);
    return;
  }

  await sendFlowStep({ userId: sender.id }, flow[stepIndex], flowId);
}

// ========== Flow helpers ==========

function getFlowById(flowId: string, config: AppConfig): FlowStep[] | null {
  const [type, id] = flowId.split(":");
  if (type === "post") {
    const post = config.posts.find((p) => p.id === id);
    return post?.dmFlow || null;
  }
  if (type === "keyword") {
    const kw = config.keywordTriggers.find((k) => k.id === id);
    return kw?.dmFlow || null;
  }
  return null;
}

type Recipient = { userId: string } | { commentId: string };

function buildRecipient(r: Recipient): Record<string, string> {
  if ("commentId" in r) return { comment_id: r.commentId };
  return { id: r.userId };
}

async function sendFlowOrText(
  recipient: Recipient,
  flow: FlowStep[] | undefined,
  fallbackText: string,
  flowId: string
) {
  if (flow && flow.length > 0) {
    console.log(`Sending flow step 0 of ${flow.length} (flowId=${flowId})`);
    await sendFlowStep(recipient, flow[0], flowId);
  } else if (fallbackText) {
    console.log(`Sending plain DM text (flowId=${flowId})`);
    await sendPlainText(recipient, fallbackText);
  } else {
    console.log(`No flow and no dmMessage — nothing to send (flowId=${flowId})`);
  }
}

async function sendFlowStep(
  recipient: Recipient,
  step: FlowStep,
  flowId: string
) {
  if (!step.text || step.text.trim().length === 0) {
    console.error(`Flow step has empty text (flowId=${flowId}) — skipping`);
    return;
  }

  if (!step.buttons || step.buttons.length === 0) {
    await sendPlainText(recipient, step.text);
    return;
  }

  // Build buttons for Instagram API — skip any with missing required fields
  const buttons = step.buttons
    .filter((btn) => btn.title && btn.title.trim().length > 0)
    .filter((btn) => btn.type !== "url" || (btn.url && btn.url.trim().length > 0))
    .map((btn) => {
      if (btn.type === "url" && btn.url) {
        return {
          type: "web_url",
          url: btn.url,
          title: btn.title,
        };
      }
      return {
        type: "postback",
        title: btn.title,
        payload: `flow:${flowId}:${btn.nextStepIndex ?? 0}`,
      };
    });

  if (buttons.length === 0) {
    console.log("All buttons were invalid — falling back to plain text");
    await sendPlainText(recipient, step.text);
    return;
  }

  const messagePayload = {
    attachment: {
      type: "template",
      payload: {
        template_type: "button",
        text: step.text,
        buttons,
      },
    },
  };

  await sendMessage(recipient, messagePayload);
}

async function sendPlainText(recipient: Recipient, text: string) {
  await sendMessage(recipient, { text });
}

async function sendMessage(recipient: Recipient, message: Record<string, unknown>) {
  try {
    const myUserId = await getMyUserId();
    const payload = {
      recipient: buildRecipient(recipient),
      message,
      access_token: ACCESS_TOKEN,
    };
    console.log("Sending message payload:", JSON.stringify(payload));
    const res = await fetch(`${GRAPH_API}/${myUserId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.error) {
      console.error("Error sending message:", JSON.stringify(data.error));
    } else {
      console.log(`Message sent to ${JSON.stringify(recipient)}:`, JSON.stringify(data));
    }
  } catch (error) {
    console.error("Failed to send message:", error);
  }
}

// ========== Other helpers ==========

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

function pickRandomReply(messages: string[] | undefined): string | null {
  if (!messages) return null;
  const valid = messages.filter((m) => m && m.trim().length > 0);
  if (valid.length === 0) return null;
  return valid[Math.floor(Math.random() * valid.length)];
}

async function getMediaPermalink(mediaId: string): Promise<string | null> {
  try {
    const res = await fetch(
      `${GRAPH_API}/${mediaId}?fields=permalink&access_token=${ACCESS_TOKEN}`
    );
    const data = await res.json();
    if (data.error) return null;
    return data.permalink || null;
  } catch {
    return null;
  }
}

async function getMyUserId(): Promise<string> {
  if (cachedUserId) return cachedUserId;
  const res = await fetch(
    `${GRAPH_API}/me?fields=id&access_token=${ACCESS_TOKEN}`
  );
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
