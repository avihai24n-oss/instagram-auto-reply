export interface TriggerRule {
  // Unique ID for this rule
  id: string;
  // Instagram media/post ID (leave empty to match ALL posts)
  mediaId?: string;
  // Keywords that trigger this rule (if empty, triggers on ANY comment)
  keywords: string[];
  // Reply message to post as a comment reply
  commentReply: string;
  // DM message to send
  dmMessage: string;
  // Is this rule active?
  enabled: boolean;
}

// Define your trigger rules here
// The bot checks rules in order and uses the FIRST match
export const triggerRules: TriggerRule[] = [
  // Example: reply only when someone writes "מחיר" on any post
  {
    id: "price-inquiry",
    keywords: ["מחיר", "כמה עולה", "עלות", "price"],
    commentReply: "שלחתי לך הודעה בפרטי עם כל הפרטים! 🙏",
    dmMessage: "היי! שמחתי שאתה מתעניין. הנה הפרטים על המחירים שלנו: ...",
    enabled: true,
  },

  // Example: reply to a specific post when someone writes "קישור" or "לינק"
  // {
  //   id: "link-request",
  //   mediaId: "YOUR_POST_ID_HERE",
  //   keywords: ["קישור", "לינק", "link"],
  //   commentReply: "שלחתי לך את הקישור בהודעה פרטית! ✨",
  //   dmMessage: "הנה הקישור שביקשת: https://example.com",
  //   enabled: true,
  // },

  // Catch-all: reply to any comment on any post (put this LAST)
  // {
  //   id: "default",
  //   keywords: [],
  //   commentReply: "תודה על התגובה! שלחתי לך הודעה בפרטי 🙏",
  //   dmMessage: "היי! תודה שהגבת על הפוסט שלי. אם יש לך שאלות, אני כאן 🚀",
  //   enabled: true,
  // },
];
