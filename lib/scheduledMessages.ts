import { createClient } from "@supabase/supabase-js";
import { generateId } from "./config";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

// Hard cap below 24h Instagram messaging window. We never schedule past this
// so the cron's safety check has buffer to catch edge cases (drift, slow runs).
export const MAX_DELAY_HOURS = 23;

export type ScheduledStatus =
  | "pending"
  | "processing"
  | "sent"
  | "failed"
  | "skipped";

export interface ScheduledMessage {
  id: string;
  recipient_id: string;
  message_text: string;
  send_at: string;
  source_type: "post" | "keyword";
  source_id: string;
  trigger_postback_at: string;
  status: ScheduledStatus;
  failure_reason?: string | null;
  sent_at?: string | null;
  created_at: string;
}

// Insert one scheduled message. Returns the inserted row id.
export async function scheduleMessage(input: {
  recipientId: string;
  messageText: string;
  delayHours: number;
  sourceType: "post" | "keyword";
  sourceId: string;
  triggerPostbackAt: Date;
}): Promise<string | null> {
  if (input.delayHours < 1 || input.delayHours > MAX_DELAY_HOURS) {
    console.warn(
      `scheduleMessage: delayHours ${input.delayHours} out of range, skipping`
    );
    return null;
  }
  const id = generateId();
  const sendAt = new Date(
    input.triggerPostbackAt.getTime() + input.delayHours * 60 * 60 * 1000
  );
  const { error } = await supabase.from("scheduled_messages").insert({
    id,
    recipient_id: input.recipientId,
    message_text: input.messageText,
    send_at: sendAt.toISOString(),
    source_type: input.sourceType,
    source_id: input.sourceId,
    trigger_postback_at: input.triggerPostbackAt.toISOString(),
    status: "pending",
  });
  if (error) {
    console.error("scheduleMessage insert failed:", error);
    return null;
  }
  return id;
}

// Has this recipient already been scheduled a follow-up from this source?
// Used to prevent duplicate scheduling if the user clicks the same postback twice.
export async function hasExistingSchedule(
  recipientId: string,
  sourceId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("scheduled_messages")
    .select("id")
    .eq("recipient_id", recipientId)
    .eq("source_id", sourceId)
    .limit(1);
  if (error) {
    console.error("hasExistingSchedule failed:", error);
    return false;
  }
  return !!data && data.length > 0;
}

// Atomically claim due messages: flips pending → processing in a single
// UPDATE filtered on status='pending', so two cron runs can never grab the
// same row. Whichever update lands first wins; the other's WHERE matches
// nothing. Prevents the double-send → spam → ban path entirely.
export async function claimDueMessages(
  limit = 50
): Promise<ScheduledMessage[]> {
  const now = new Date().toISOString();
  const { data: due, error: dueErr } = await supabase
    .from("scheduled_messages")
    .select("id")
    .eq("status", "pending")
    .lte("send_at", now)
    .order("send_at", { ascending: true })
    .limit(limit);
  if (dueErr) {
    console.error("claimDueMessages select failed:", dueErr);
    return [];
  }
  if (!due || due.length === 0) return [];

  const ids = due.map((d) => d.id);
  const { data: claimed, error: claimErr } = await supabase
    .from("scheduled_messages")
    .update({ status: "processing" })
    .in("id", ids)
    .eq("status", "pending") // double-check — only claim rows still pending
    .select();
  if (claimErr) {
    console.error("claimDueMessages claim failed:", claimErr);
    return [];
  }
  return (claimed || []) as ScheduledMessage[];
}

export async function markSent(id: string): Promise<void> {
  await supabase
    .from("scheduled_messages")
    .update({ status: "sent", sent_at: new Date().toISOString() })
    .eq("id", id);
}

export async function markSkipped(id: string, reason: string): Promise<void> {
  await supabase
    .from("scheduled_messages")
    .update({ status: "skipped", failure_reason: reason })
    .eq("id", id);
}

export async function markFailed(id: string, reason: string): Promise<void> {
  await supabase
    .from("scheduled_messages")
    .update({ status: "failed", failure_reason: reason })
    .eq("id", id);
}

// Stats for the dashboard: counts grouped by status.
export async function getScheduledStats(): Promise<
  Record<ScheduledStatus, number>
> {
  const { data, error } = await supabase
    .from("scheduled_messages")
    .select("status");
  if (error || !data) {
    return { pending: 0, processing: 0, sent: 0, failed: 0, skipped: 0 };
  }
  const counts: Record<ScheduledStatus, number> = {
    pending: 0,
    processing: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
  };
  for (const row of data as { status: ScheduledStatus }[]) {
    counts[row.status] = (counts[row.status] || 0) + 1;
  }
  return counts;
}

// Recent scheduled messages for the dashboard list view.
export async function getRecentScheduled(
  limit = 50
): Promise<ScheduledMessage[]> {
  const { data, error } = await supabase
    .from("scheduled_messages")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data as ScheduledMessage[];
}
