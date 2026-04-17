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

export interface PostConfig {
  id: string;
  mediaId: string;
  permalink?: string;
  name: string;
  enabled: boolean;
  keywords: string[];
  replyMessage: string;
  dmMessage: string;       // used when dmFlow is empty
  dmFlow: FlowStep[];      // step[0] is sent first, postback buttons navigate to other step indexes
  sendDM: boolean;
  quickReplies: QuickReplyOption[];
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
  const { data, error } = await supabase
    .from("bot_config")
    .select("config")
    .eq("id", CONFIG_ID)
    .single();

  if (error || !data) {
    // First time — insert default config
    await supabase
      .from("bot_config")
      .upsert({ id: CONFIG_ID, config: DEFAULT_CONFIG });
    return DEFAULT_CONFIG;
  }

  return data.config as AppConfig;
}

export async function saveConfig(config: AppConfig): Promise<void> {
  await supabase
    .from("bot_config")
    .upsert({ id: CONFIG_ID, config });
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
