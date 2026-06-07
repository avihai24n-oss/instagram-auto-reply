import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

const CONFIG_ID = "main";

// A single button in a flow step - either opens a URL or triggers another step
export interface FlowButton {
  type: "url" | "postback";
  title: string;          // button label, up to 20 chars
  url?: string;           // for URL buttons
  nextStepIndex?: number; // for postback buttons - which step comes next in the flow
}

// One step in a message flow = text + 0-3 buttons
export interface FlowStep {
  text: string;           // message text, up to 640 chars
  buttons: FlowButton[];  // 0-3 buttons
}

export interface PostStats {
  organicReplies: number;
  adReplies: number;
  storyReplies?: number;  // replies to a sponsored story whose original_media_id matches this post
  dmsSent: number;
  linkClicks: number;
  seenClickUserIds?: string[]; // IG-scoped user IDs that already counted a click
  lastActivityAt?: string;
}

// Scheduled follow-up message — sent X hours after user clicks a postback button
// on the FIRST step of the dmFlow. Only valid when dmFlow has >= 2 steps.
export interface FollowUpMessage {
  id: string;
  delayHours: number;  // 1–23 (hard cap below 24h to stay inside messaging window)
  text: string;        // up to 640 chars
  enabled: boolean;
}

export interface PostConfig {
  id: string;
  mediaId: string;
  permalink?: string;
  name: string;
  enabled: boolean;
  keywords: string[];
  replyMessages: string[]; // up to 3 options — one is picked randomly per comment
  dmMessage: string;       // used when dmFlow is empty
  dmFlow: FlowStep[];      // step[0] is sent first, postback buttons navigate to other step indexes
  sendDM: boolean;
  includeSponsoredStories?: boolean; // also handle replies to a sponsored story whose original_media_id == this post
  quickReplies: QuickReplyOption[];
  stats?: PostStats;
  followUps?: FollowUpMessage[]; // scheduled DMs sent after user clicks postback (requires dmFlow.length >= 2)
}

export interface KeywordTrigger {
  id: string;
  keyword: string;
  enabled: boolean;
  replyMessage: string;
  dmMessage: string;       // used when dmFlow is empty
  dmFlow: FlowStep[];      // step[0] is sent first, postback buttons navigate to other step indexes
  sendDM: boolean;
  matchExact: boolean;
  followUps?: FollowUpMessage[]; // scheduled DMs sent after user clicks postback (requires dmFlow.length >= 2)
}

export interface QuickReplyOption {
  title: string;
  payload: string;
}

export interface QuickRepliesConfig {
  enabled: boolean;
  options: QuickReplyOption[];
}

export interface WelcomeMessageConfig {
  enabled: boolean;
  message: string;
}

export interface GlobalSettings {
  botEnabled: boolean;
  defaultReplyMessage: string;
  defaultDMMessage: string;
}

export interface AppConfig {
  globalSettings: GlobalSettings;
  posts: PostConfig[];
  keywordTriggers: KeywordTrigger[];
  storyKeywordTriggers?: KeywordTrigger[]; // reserved for upcoming per-story keyword UI
  quickReplies: QuickRepliesConfig;
  welcomeMessage: WelcomeMessageConfig;
}

const DEFAULT_CONFIG: AppConfig = {
  globalSettings: {
    botEnabled: true,
    defaultReplyMessage: "תודה על התגובה! 🙏",
    defaultDMMessage: "היי! תודה שהגבת 💬 איך אפשר לעזור?",
  },
  posts: [],
  keywordTriggers: [],
  quickReplies: {
    enabled: false,
    options: [],
  },
  welcomeMessage: {
    enabled: false,
    message: "היי! תודה שעקבת 🎉 איך אפשר לעזור?",
  },
};

export async function getConfig(): Promise<AppConfig> {
  const { data, error } = await supabase
    .from("bot_config")
    .select("config")
    .eq("id", CONFIG_ID)
    .single();

  if (error || !data) {
    await supabase
      .from("bot_config")
      .upsert({ id: CONFIG_ID, config: DEFAULT_CONFIG });
    return DEFAULT_CONFIG;
  }

  return migrateConfig(data.config as AppConfig);
}

function migrateConfig(config: AppConfig): AppConfig {
  if (!config.posts) return config;
  for (const post of config.posts) {
    const legacy = (post as unknown as { replyMessage?: string }).replyMessage;
    if (!post.replyMessages) {
      post.replyMessages = legacy ? [legacy] : [];
    }
    delete (post as unknown as { replyMessage?: string }).replyMessage;
    if (!post.stats) {
      post.stats = { organicReplies: 0, adReplies: 0, dmsSent: 0, linkClicks: 0 };
    }
    if (typeof post.includeSponsoredStories !== "boolean") {
      post.includeSponsoredStories = false;
    }
  }
  if (!config.storyKeywordTriggers) {
    config.storyKeywordTriggers = [];
  }
  return config;
}

// Atomic-ish stat increment. Reads latest config, mutates the post's stats,
// writes back. Best-effort under concurrent webhook events.
export async function bumpPostStat(
  postId: string,
  field: "organicReplies" | "adReplies" | "storyReplies" | "dmsSent" | "linkClicks",
  delta = 1
): Promise<void> {
  const config = await getConfig();
  const post = config.posts.find((p) => p.id === postId);
  if (!post) return;
  if (!post.stats) {
    post.stats = { organicReplies: 0, adReplies: 0, dmsSent: 0, linkClicks: 0 };
  }
  const current = (post.stats[field] as number | undefined) ?? 0;
  post.stats[field] = current + delta;
  post.stats.lastActivityAt = new Date().toISOString();
  await saveConfig(config);
}

// Records a unique click for a user. Returns true if this is the first time
// this user clicked any link on this post (i.e. the count should bump).
export async function recordUniqueLinkClick(
  postId: string,
  userId: string
): Promise<boolean> {
  const config = await getConfig();
  const post = config.posts.find((p) => p.id === postId);
  if (!post) return false;
  if (!post.stats) {
    post.stats = { organicReplies: 0, adReplies: 0, dmsSent: 0, linkClicks: 0 };
  }
  if (!post.stats.seenClickUserIds) {
    post.stats.seenClickUserIds = [];
  }
  if (post.stats.seenClickUserIds.includes(userId)) {
    return false;
  }
  post.stats.seenClickUserIds.push(userId);
  post.stats.linkClicks = (post.stats.linkClicks ?? 0) + 1;
  post.stats.lastActivityAt = new Date().toISOString();
  await saveConfig(config);
  return true;
}

export async function saveConfig(config: AppConfig): Promise<void> {
  await supabase
    .from("bot_config")
    .upsert({ id: CONFIG_ID, config });
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
