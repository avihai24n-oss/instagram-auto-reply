import { kv } from "@vercel/kv";

const CONFIG_KEY = "app-config";

export interface PostConfig {
  id: string;
  mediaId: string;
  name: string;
  enabled: boolean;
  keywords: string[];
  replyMessage: string;
  dmMessage: string;
  sendDM: boolean;
  quickReplies: QuickReplyOption[];
}

export interface KeywordTrigger {
  id: string;
  keyword: string;
  enabled: boolean;
  replyMessage: string;
  dmMessage: string;
  sendDM: boolean;
  matchExact: boolean;
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
  const config = await kv.get<AppConfig>(CONFIG_KEY);
  if (!config) {
    await kv.set(CONFIG_KEY, DEFAULT_CONFIG);
    return DEFAULT_CONFIG;
  }
  return config;
}

export async function saveConfig(config: AppConfig): Promise<void> {
  await kv.set(CONFIG_KEY, config);
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
