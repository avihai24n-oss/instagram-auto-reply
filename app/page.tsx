"use client";

import { useState, useEffect, useCallback } from "react";
import "./globals.css";

interface FlowButton {
  type: "url" | "postback";
  title: string;
  url?: string;
  nextStepIndex?: number;
}

interface FlowStep {
  text: string;
  buttons: FlowButton[];
}

interface PostConfig {
  id: string;
  mediaId: string;
  permalink?: string;
  name: string;
  enabled: boolean;
  keywords: string[];
  replyMessages: string[];
  dmMessage: string;
  dmFlow: FlowStep[];
  sendDM: boolean;
  quickReplies: { title: string; payload: string }[];
}

interface KeywordTrigger {
  id: string;
  keyword: string;
  enabled: boolean;
  replyMessage: string;
  dmMessage: string;
  dmFlow: FlowStep[];
  sendDM: boolean;
  matchExact: boolean;
}

interface AppConfig {
  globalSettings: {
    botEnabled: boolean;
    defaultReplyMessage: string;
    defaultDMMessage: string;
  };
  posts: PostConfig[];
  keywordTriggers: KeywordTrigger[];
  quickReplies: {
    enabled: boolean;
    options: { title: string; payload: string }[];
  };
  welcomeMessage: {
    enabled: boolean;
    message: string;
  };
}

const TABS = [
  { id: "manage", label: "ניהול" },
  { id: "general", label: "הגדרות כלליות" },
  { id: "posts", label: "פוסטים ספציפיים" },
  { id: "keywords", label: "מילות מפתח" },
  { id: "quickreplies", label: "Quick Replies" },
  { id: "welcome", label: "הודעת ברוכים הבאים" },
];

export default function Dashboard() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [activeTab, setActiveTab] = useState("manage");
  const [toast, setToast] = useState("");

  const loadConfig = useCallback(async () => {
    const res = await fetch("/api/config");
    const data = await res.json();
    setConfig(data);
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  };

  const saveGlobal = async (updates: Partial<AppConfig>) => {
    await fetch("/api/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    await loadConfig();
    showToast("נשמר בהצלחה!");
  };

  if (!config) return <div className="dashboard"><p>טוען...</p></div>;

  return (
    <div className="dashboard">
      <div className="header">
        <h1>Instagram Bot Dashboard</h1>
        <div className="bot-toggle">
          <span>{config.globalSettings.botEnabled ? "פעיל" : "כבוי"}</span>
          <label className="switch">
            <input
              type="checkbox"
              checked={config.globalSettings.botEnabled}
              onChange={(e) =>
                saveGlobal({ globalSettings: { ...config.globalSettings, botEnabled: e.target.checked } })
              }
            />
            <span className="slider" />
          </label>
        </div>
      </div>

      <div className="tabs">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`tab ${activeTab === tab.id ? "active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "manage" && (
        <ManageTab
          posts={config.posts}
          keywords={config.keywordTriggers}
          onRefresh={loadConfig}
          onToast={showToast}
          onGoTo={(tab) => setActiveTab(tab)}
        />
      )}
      {activeTab === "general" && (
        <GeneralTab config={config} onSave={saveGlobal} />
      )}
      {activeTab === "posts" && (
        <PostsTab posts={config.posts} onRefresh={loadConfig} onToast={showToast} />
      )}
      {activeTab === "keywords" && (
        <KeywordsTab keywords={config.keywordTriggers} onRefresh={loadConfig} onToast={showToast} />
      )}
      {activeTab === "quickreplies" && (
        <QuickRepliesTab config={config.quickReplies} onSave={saveGlobal} />
      )}
      {activeTab === "welcome" && (
        <WelcomeTab config={config.welcomeMessage} onSave={saveGlobal} />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

// ========== General Tab ==========
function GeneralTab({
  config,
  onSave,
}: {
  config: AppConfig;
  onSave: (u: Partial<AppConfig>) => void;
}) {
  const [reply, setReply] = useState(config.globalSettings.defaultReplyMessage);
  const [dm, setDm] = useState(config.globalSettings.defaultDMMessage);

  return (
    <div className="card">
      <h3 style={{ marginBottom: 16, color: "#fff" }}>הגדרות ברירת מחדל</h3>
      <p className="section-desc">
        הודעות אלו ישלחו כשאין הגדרה ספציפית לפוסט או מילת מפתח
      </p>
      <div className="form-group">
        <label>תגובה ברירת מחדל (Reply לתגובה)</label>
        <textarea value={reply} onChange={(e) => setReply(e.target.value)} />
      </div>
      <div className="form-group">
        <label>הודעה פרטית ברירת מחדל (DM)</label>
        <textarea value={dm} onChange={(e) => setDm(e.target.value)} />
      </div>
      <button
        className="btn btn-primary"
        onClick={() =>
          onSave({
            globalSettings: {
              ...config.globalSettings,
              defaultReplyMessage: reply,
              defaultDMMessage: dm,
            },
          })
        }
      >
        שמור שינויים
      </button>
    </div>
  );
}

// ========== Flow Builder — reusable component ==========
function FlowBuilder({
  flow,
  onChange,
  maxSteps = 3,
}: {
  flow: FlowStep[];
  onChange: (newFlow: FlowStep[]) => void;
  maxSteps?: number;
}) {
  // Ensure we always have at least step 0
  const steps = flow.length > 0 ? flow : [{ text: "", buttons: [] }];

  const updateStep = (index: number, updates: Partial<FlowStep>) => {
    const newSteps = [...steps];
    newSteps[index] = { ...newSteps[index], ...updates };
    onChange(newSteps);
  };

  const addStep = () => {
    if (steps.length >= maxSteps) return;
    onChange([...steps, { text: "", buttons: [] }]);
  };

  const removeStep = (index: number) => {
    if (index === 0) return; // can't remove first step
    const newSteps = steps.filter((_, i) => i !== index);
    // Fix any buttons pointing to this removed step
    newSteps.forEach((s) => {
      s.buttons = s.buttons.map((b) => {
        if (b.type === "postback" && b.nextStepIndex !== undefined) {
          if (b.nextStepIndex === index) return { ...b, nextStepIndex: undefined };
          if (b.nextStepIndex > index)
            return { ...b, nextStepIndex: b.nextStepIndex - 1 };
        }
        return b;
      });
    });
    onChange(newSteps);
  };

  const addButton = (stepIndex: number) => {
    const step = steps[stepIndex];
    if (step.buttons.length >= 3) return;
    updateStep(stepIndex, {
      buttons: [...step.buttons, { type: "postback", title: "", nextStepIndex: undefined }],
    });
  };

  const updateButton = (
    stepIndex: number,
    btnIndex: number,
    updates: Partial<FlowButton>
  ) => {
    const step = steps[stepIndex];
    const newButtons = [...step.buttons];
    newButtons[btnIndex] = { ...newButtons[btnIndex], ...updates };
    updateStep(stepIndex, { buttons: newButtons });
  };

  const removeButton = (stepIndex: number, btnIndex: number) => {
    const step = steps[stepIndex];
    updateStep(stepIndex, { buttons: step.buttons.filter((_, i) => i !== btnIndex) });
  };

  return (
    <div>
      {steps.map((step, stepIdx) => (
        <div className="flow-step" key={stepIdx}>
          <div className="flow-step-header">
            <span>שלב {stepIdx + 1}{stepIdx === 0 ? " (הודעה ראשונה)" : ""}</span>
            {stepIdx > 0 && (
              <button
                className="btn btn-danger btn-sm"
                onClick={() => removeStep(stepIdx)}
                type="button"
              >
                מחק שלב
              </button>
            )}
          </div>
          <div className="form-group" style={{ marginBottom: 8 }}>
            <label>טקסט ההודעה (עד 640 תווים)</label>
            <textarea
              value={step.text}
              maxLength={640}
              onChange={(e) => updateStep(stepIdx, { text: e.target.value })}
              placeholder="תוכן ההודעה שתישלח"
            />
          </div>

          {step.buttons.map((btn, btnIdx) => (
            <div className="flow-button" key={btnIdx}>
              <div className="flow-button-row">
                <select
                  value={btn.type}
                  onChange={(e) =>
                    updateButton(stepIdx, btnIdx, {
                      type: e.target.value as "url" | "postback",
                      url: undefined,
                      nextStepIndex: undefined,
                    })
                  }
                >
                  <option value="postback">כפתור שלב הבא</option>
                  <option value="url">כפתור קישור</option>
                </select>
                <input
                  placeholder="טקסט הכפתור (עד 20 תווים)"
                  maxLength={20}
                  value={btn.title}
                  onChange={(e) =>
                    updateButton(stepIdx, btnIdx, { title: e.target.value })
                  }
                />
                {btn.type === "url" ? (
                  <input
                    placeholder="https://..."
                    value={btn.url || ""}
                    onChange={(e) =>
                      updateButton(stepIdx, btnIdx, { url: e.target.value })
                    }
                  />
                ) : (
                  <select
                    value={btn.nextStepIndex ?? ""}
                    onChange={(e) =>
                      updateButton(stepIdx, btnIdx, {
                        nextStepIndex:
                          e.target.value === "" ? undefined : Number(e.target.value),
                      })
                    }
                  >
                    <option value="">בחר שלב...</option>
                    {steps.map((_, i) =>
                      i !== stepIdx ? (
                        <option key={i} value={i}>
                          שלב {i + 1}
                        </option>
                      ) : null
                    )}
                  </select>
                )}
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={() => removeButton(stepIdx, btnIdx)}
                >
                  x
                </button>
              </div>
            </div>
          ))}

          {step.buttons.length < 3 && (
            <button
              type="button"
              className="flow-add-btn"
              style={{ marginTop: 8 }}
              onClick={() => addButton(stepIdx)}
            >
              + הוסף כפתור (עד 3)
            </button>
          )}
        </div>
      ))}

      {steps.length < maxSteps && (
        <button type="button" className="flow-add-btn" onClick={addStep}>
          + הוסף שלב הבא (עד {maxSteps} שלבים)
        </button>
      )}
    </div>
  );
}

// ========== Message Editor — chooses between simple text or flow ==========
function MessageEditor({
  dmMessage,
  dmFlow,
  onChangeText,
  onChangeFlow,
}: {
  dmMessage: string;
  dmFlow: FlowStep[];
  onChangeText: (t: string) => void;
  onChangeFlow: (f: FlowStep[]) => void;
}) {
  const [mode, setMode] = useState<"text" | "flow">(
    dmFlow.length > 0 ? "flow" : "text"
  );

  return (
    <div>
      <div className="flow-toggle">
        <button
          type="button"
          className={mode === "text" ? "active" : ""}
          onClick={() => {
            setMode("text");
            onChangeFlow([]);
          }}
        >
          טקסט פשוט
        </button>
        <button
          type="button"
          className={mode === "flow" ? "active" : ""}
          onClick={() => {
            setMode("flow");
            if (dmFlow.length === 0) onChangeFlow([{ text: dmMessage, buttons: [] }]);
          }}
        >
          הודעה עם כפתורים
        </button>
      </div>

      {mode === "text" ? (
        <div className="form-group">
          <label>הודעה פרטית (DM)</label>
          <textarea
            value={dmMessage}
            onChange={(e) => onChangeText(e.target.value)}
            placeholder="ההודעה שתישלח בפרטי"
          />
        </div>
      ) : (
        <FlowBuilder flow={dmFlow} onChange={onChangeFlow} />
      )}
    </div>
  );
}

// ========== Instagram Post type ==========
interface InstagramPost {
  id: string;
  caption: string;
  mediaType: string;
  mediaUrl: string;
  timestamp: string;
  permalink: string;
}

// ========== Posts Tab ==========
function PostsTab({
  posts,
  onRefresh,
  onToast,
}: {
  posts: PostConfig[];
  onRefresh: () => void;
  onToast: (m: string) => void;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const [selectedPost, setSelectedPost] = useState<InstagramPost | null>(null);
  const [editingPost, setEditingPost] = useState<PostConfig | null>(null);

  const deletePost = async (id: string) => {
    await fetch("/api/config/posts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    onRefresh();
    onToast("נמחק!");
  };

  const togglePost = async (post: PostConfig) => {
    await fetch("/api/config/posts", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...post, enabled: !post.enabled }),
    });
    onRefresh();
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <h3 style={{ color: "#fff" }}>פוסטים ספציפיים</h3>
          <p className="section-desc">בחר פוסט מהאינסטגרם שלך והגדר תגובה אוטומטית</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowPicker(true)}>
          + בחר פוסט
        </button>
      </div>

      {showPicker && !selectedPost && (
        <PostPicker
          existingMediaIds={posts.map((p) => p.mediaId)}
          onSelect={(post) => setSelectedPost(post)}
          onCancel={() => setShowPicker(false)}
        />
      )}

      {selectedPost && (
        <PostForm
          igPost={selectedPost}
          onSave={() => {
            setSelectedPost(null);
            setShowPicker(false);
            onRefresh();
            onToast("פוסט נוסף!");
          }}
          onCancel={() => {
            setSelectedPost(null);
            setShowPicker(false);
          }}
        />
      )}

      {editingPost && (
        <PostEditForm
          post={editingPost}
          onSave={() => {
            setEditingPost(null);
            onRefresh();
            onToast("עודכן!");
          }}
          onCancel={() => setEditingPost(null)}
        />
      )}

      {posts.length === 0 && !showPicker && !selectedPost && (
        <div className="empty">
          <p>אין פוסטים מוגדרים עדיין</p>
          <p style={{ fontSize: 13, marginTop: 8 }}>
            לחץ על &quot;בחר פוסט&quot; כדי לבחור פוסט מהאינסטגרם שלך
          </p>
        </div>
      )}

      {posts.map((post) => (
        <div className="card" key={post.id}>
          <div className="card-header">
            <div>
              <h3>{post.name}</h3>
              <span style={{ fontSize: 12, color: "#666" }}>Media ID: {post.mediaId}</span>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span className={`status ${post.enabled ? "status-on" : "status-off"}`}>
                {post.enabled ? "פעיל" : "כבוי"}
              </span>
              <label className="switch">
                <input type="checkbox" checked={post.enabled} onChange={() => togglePost(post)} />
                <span className="slider" />
              </label>
            </div>
          </div>
          {post.keywords.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: "#999" }}>מילות מפתח: </span>
              <div className="tags">
                {post.keywords.map((kw) => (
                  <span className="tag" key={kw}>{kw}</span>
                ))}
              </div>
            </div>
          )}
          <RepliesSummary messages={post.replyMessages || []} />
          {post.sendDM && <FlowSummary dmMessage={post.dmMessage} dmFlow={post.dmFlow || []} />}
          <div className="actions">
            <button className="btn btn-ghost btn-sm" onClick={() => setEditingPost(post)}>
              ערוך
            </button>
            <button className="btn btn-danger btn-sm" onClick={() => deletePost(post.id)}>
              מחק
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function RepliesEditor({
  messages,
  onChange,
}: {
  messages: string[];
  onChange: (m: string[]) => void;
}) {
  const update = (i: number, v: string) => {
    const next = [...messages];
    next[i] = v;
    onChange(next);
  };
  const add = () => {
    if (messages.length < 3) onChange([...messages, ""]);
  };
  const remove = (i: number) => {
    const next = messages.filter((_, idx) => idx !== i);
    onChange(next.length === 0 ? [""] : next);
  };

  return (
    <div className="form-group">
      <label>הודעת תגובה (Reply) — עד 3 ווריאציות, המערכת בוחרת אחת באקראי</label>
      {messages.map((m, i) => (
        <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
          <textarea
            value={m}
            onChange={(e) => update(i, e.target.value)}
            placeholder={`ווריאציה ${i + 1}`}
            style={{ flex: 1 }}
          />
          {messages.length > 1 && (
            <button className="btn btn-ghost btn-sm" onClick={() => remove(i)}>
              מחק
            </button>
          )}
        </div>
      ))}
      {messages.length < 3 && (
        <button className="flow-add-btn" onClick={add}>
          + הוסף ווריאציה
        </button>
      )}
    </div>
  );
}

function RepliesSummary({ messages }: { messages: string[] }) {
  const valid = messages.filter((m) => m && m.trim().length > 0);
  if (valid.length === 0) return null;
  if (valid.length === 1) {
    return (
      <div style={{ fontSize: 13, color: "#aaa", marginBottom: 4 }}>
        תגובה: {valid[0]}
      </div>
    );
  }
  return (
    <div style={{ fontSize: 13, color: "#aaa", marginBottom: 4 }}>
      <div style={{ color: "#888", fontSize: 12, marginBottom: 2 }}>
        {valid.length} תגובות (נבחרת אחת באקראי):
      </div>
      {valid.map((m, i) => (
        <div key={i} style={{ paddingRight: 8 }}>• {m}</div>
      ))}
    </div>
  );
}

// ========== Flow summary for list views ==========
function FlowSummary({ dmMessage, dmFlow }: { dmMessage: string; dmFlow: FlowStep[] }) {
  if (dmFlow && dmFlow.length > 0) {
    return (
      <div style={{ fontSize: 13, color: "#aaa" }}>
        <div>DM: {dmFlow[0].text}</div>
        {dmFlow[0].buttons.length > 0 && (
          <div style={{ marginTop: 4 }}>
            {dmFlow[0].buttons.map((b, i) => (
              <span key={i} className="flow-preview-btn">
                {b.type === "url" ? "🔗 " : "▶ "}
                {b.title}
              </span>
            ))}
          </div>
        )}
        {dmFlow.length > 1 && (
          <div style={{ fontSize: 11, color: "#666", marginTop: 4 }}>
            {dmFlow.length} שלבי flow
          </div>
        )}
      </div>
    );
  }
  return <div style={{ fontSize: 13, color: "#aaa" }}>DM: {dmMessage}</div>;
}

// ========== Post Picker ==========
function PostPicker({
  existingMediaIds,
  onSelect,
  onCancel,
}: {
  existingMediaIds: string[];
  onSelect: (post: InstagramPost) => void;
  onCancel: () => void;
}) {
  const [posts, setPosts] = useState<InstagramPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchPosts = async () => {
      try {
        const res = await fetch("/api/instagram-posts");
        const data = await res.json();
        if (data.error) {
          setError(data.error);
        } else {
          setPosts(data.posts || []);
        }
      } catch {
        setError("Failed to load posts");
      } finally {
        setLoading(false);
      }
    };
    fetchPosts();
  }, []);

  if (loading) {
    return (
      <div className="card" style={{ textAlign: "center", padding: 40 }}>
        <p style={{ color: "#aaa" }}>טוען פוסטים מאינסטגרם...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card" style={{ borderColor: "#f87171" }}>
        <p style={{ color: "#f87171" }}>שגיאה: {error}</p>
        <button className="btn btn-ghost" onClick={onCancel}>סגור</button>
      </div>
    );
  }

  return (
    <div className="card" style={{ borderColor: "#2563eb" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
        <h3 style={{ color: "#fff" }}>בחר פוסט מהאינסטגרם שלך</h3>
        <button className="btn btn-ghost btn-sm" onClick={onCancel}>x סגור</button>
      </div>
      <div className="post-grid">
        {posts.map((post) => {
          const alreadyAdded = existingMediaIds.includes(post.id);
          return (
            <div
              key={post.id}
              className={`post-card ${alreadyAdded ? "post-card-disabled" : ""}`}
              onClick={() => !alreadyAdded && onSelect(post)}
              title={alreadyAdded ? "כבר הוגדר" : "לחץ לבחור"}
            >
              {post.mediaUrl ? (
                <img src={post.mediaUrl} alt={post.caption} className="post-image" />
              ) : (
                <div className="post-image post-image-placeholder">
                  {post.mediaType === "VIDEO" ? "Video" : "No image"}
                </div>
              )}
              <div className="post-caption">
                {post.caption ? post.caption.slice(0, 60) + (post.caption.length > 60 ? "..." : "") : "ללא כיתוב"}
              </div>
              <div className="post-date">
                {new Date(post.timestamp).toLocaleDateString("he-IL")}
              </div>
              {alreadyAdded && <div className="post-badge">כבר מוגדר</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ========== Post Form ==========
function PostForm({
  igPost,
  onSave,
  onCancel,
}: {
  igPost: InstagramPost;
  onSave: () => void;
  onCancel: () => void;
}) {
  const postName = igPost.caption
    ? igPost.caption.slice(0, 30) + (igPost.caption.length > 30 ? "..." : "")
    : `Post ${igPost.id}`;
  const [replyMessages, setReplyMessages] = useState<string[]>([""]);
  const [dmMessage, setDmMessage] = useState("");
  const [dmFlow, setDmFlow] = useState<FlowStep[]>([]);
  const [sendDM, setSendDM] = useState(true);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [kwInput, setKwInput] = useState("");

  const addKeyword = () => {
    if (kwInput.trim() && !keywords.includes(kwInput.trim())) {
      setKeywords([...keywords, kwInput.trim()]);
      setKwInput("");
    }
  };

  const submit = async () => {
    await fetch("/api/config/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mediaId: igPost.id,
        permalink: igPost.permalink,
        name: postName,
        enabled: true,
        keywords,
        replyMessages: replyMessages.filter((m) => m.trim().length > 0),
        dmMessage,
        dmFlow,
        sendDM,
        quickReplies: [],
      }),
    });
    onSave();
  };

  return (
    <div className="card" style={{ borderColor: "#2563eb" }}>
      <div style={{ display: "flex", gap: 16, marginBottom: 16 }}>
        {igPost.mediaUrl && (
          <img
            src={igPost.mediaUrl}
            alt=""
            style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 8 }}
          />
        )}
        <div>
          <h3 style={{ color: "#fff" }}>{postName}</h3>
          <span style={{ fontSize: 12, color: "#666" }}>Media ID: {igPost.id}</span>
        </div>
      </div>

      <div className="form-group">
        <label>מילות מפתח (אופציונלי - תגובה רק כשמישהו כותב את המילה)</label>
        <div className="keyword-input">
          <input
            value={kwInput}
            onChange={(e) => setKwInput(e.target.value)}
            placeholder="הקלד מילה ולחץ הוסף"
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addKeyword())}
          />
          <button className="btn btn-ghost btn-sm" onClick={addKeyword}>הוסף</button>
        </div>
        {keywords.length > 0 && (
          <div className="tags">
            {keywords.map((kw) => (
              <span className="tag" key={kw}>
                {kw}
                <button onClick={() => setKeywords(keywords.filter((k) => k !== kw))}>x</button>
              </span>
            ))}
          </div>
        )}
      </div>
      <RepliesEditor messages={replyMessages} onChange={setReplyMessages} />
      <div className="checkbox-group">
        <input type="checkbox" checked={sendDM} onChange={(e) => setSendDM(e.target.checked)} />
        <label>שלח גם הודעה פרטית (DM)</label>
      </div>
      {sendDM && (
        <MessageEditor
          dmMessage={dmMessage}
          dmFlow={dmFlow}
          onChangeText={setDmMessage}
          onChangeFlow={setDmFlow}
        />
      )}
      <div className="actions">
        <button className="btn btn-primary" onClick={submit}>שמור פוסט</button>
        <button className="btn btn-ghost" onClick={onCancel}>ביטול</button>
      </div>
    </div>
  );
}

// ========== Keywords Tab ==========
function KeywordsTab({
  keywords,
  onRefresh,
  onToast,
}: {
  keywords: KeywordTrigger[];
  onRefresh: () => void;
  onToast: (m: string) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [editingKeyword, setEditingKeyword] = useState<KeywordTrigger | null>(null);

  const deleteKeyword = async (id: string) => {
    await fetch("/api/config/keywords", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    onRefresh();
    onToast("נמחק!");
  };

  const toggleKeyword = async (kw: KeywordTrigger) => {
    await fetch("/api/config/keywords", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...kw, enabled: !kw.enabled }),
    });
    onRefresh();
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <h3 style={{ color: "#fff" }}>מילות מפתח גלובליות</h3>
          <p className="section-desc">תגובה אוטומטית כשמישהו כותב מילה מסוימת בכל פוסט</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>
          + הוסף מילת מפתח
        </button>
      </div>

      {showForm && (
        <KeywordForm
          onSave={() => {
            setShowForm(false);
            onRefresh();
            onToast("מילת מפתח נוספה!");
          }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {editingKeyword && (
        <KeywordEditForm
          kw={editingKeyword}
          onSave={() => {
            setEditingKeyword(null);
            onRefresh();
            onToast("עודכן!");
          }}
          onCancel={() => setEditingKeyword(null)}
        />
      )}

      {keywords.length === 0 && !showForm && (
        <div className="empty">
          <p>אין מילות מפתח מוגדרות</p>
        </div>
      )}

      {keywords.map((kw) => (
        <div className="card" key={kw.id}>
          <div className="card-header">
            <div>
              <h3>
                <span className="tag" style={{ fontSize: 14 }}>{kw.keyword}</span>
                {kw.matchExact && (
                  <span style={{ fontSize: 11, color: "#666", marginRight: 8 }}>התאמה מדויקת</span>
                )}
              </h3>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span className={`status ${kw.enabled ? "status-on" : "status-off"}`}>
                {kw.enabled ? "פעיל" : "כבוי"}
              </span>
              <label className="switch">
                <input type="checkbox" checked={kw.enabled} onChange={() => toggleKeyword(kw)} />
                <span className="slider" />
              </label>
            </div>
          </div>
          <div style={{ fontSize: 13, color: "#aaa", marginBottom: 4 }}>
            תגובה: {kw.replyMessage}
          </div>
          {kw.sendDM && <FlowSummary dmMessage={kw.dmMessage} dmFlow={kw.dmFlow || []} />}
          <div className="actions">
            <button className="btn btn-ghost btn-sm" onClick={() => setEditingKeyword(kw)}>ערוך</button>
            <button className="btn btn-danger btn-sm" onClick={() => deleteKeyword(kw.id)}>מחק</button>
          </div>
        </div>
      ))}
    </div>
  );
}

function KeywordForm({ onSave, onCancel }: { onSave: () => void; onCancel: () => void }) {
  const [keyword, setKeyword] = useState("");
  const [replyMessage, setReplyMessage] = useState("");
  const [dmMessage, setDmMessage] = useState("");
  const [dmFlow, setDmFlow] = useState<FlowStep[]>([]);
  const [sendDM, setSendDM] = useState(true);
  const [matchExact, setMatchExact] = useState(false);

  const submit = async () => {
    await fetch("/api/config/keywords", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        keyword,
        enabled: true,
        replyMessage,
        dmMessage,
        dmFlow,
        sendDM,
        matchExact,
      }),
    });
    onSave();
  };

  return (
    <div className="card" style={{ borderColor: "#2563eb" }}>
      <h3 style={{ marginBottom: 16, color: "#fff" }}>מילת מפתח חדשה</h3>
      <div className="form-group">
        <label>מילת מפתח</label>
        <input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder='למשל: מחיר, לינק, פרטים' />
      </div>
      <div className="checkbox-group">
        <input type="checkbox" checked={matchExact} onChange={(e) => setMatchExact(e.target.checked)} />
        <label>התאמה מדויקת בלבד (המילה בדיוק, לא חלק ממילה)</label>
      </div>
      <div className="form-group">
        <label>הודעת תגובה (Reply)</label>
        <textarea value={replyMessage} onChange={(e) => setReplyMessage(e.target.value)} />
      </div>
      <div className="checkbox-group">
        <input type="checkbox" checked={sendDM} onChange={(e) => setSendDM(e.target.checked)} />
        <label>שלח גם הודעה פרטית (DM)</label>
      </div>
      {sendDM && (
        <MessageEditor
          dmMessage={dmMessage}
          dmFlow={dmFlow}
          onChangeText={setDmMessage}
          onChangeFlow={setDmFlow}
        />
      )}
      <div className="actions">
        <button className="btn btn-primary" onClick={submit}>שמור</button>
        <button className="btn btn-ghost" onClick={onCancel}>ביטול</button>
      </div>
    </div>
  );
}

// ========== Quick Replies Tab ==========
function QuickRepliesTab({
  config,
  onSave,
}: {
  config: { enabled: boolean; options: { title: string; payload: string }[] };
  onSave: (u: Partial<AppConfig>) => void;
}) {
  const [enabled, setEnabled] = useState(config.enabled);
  const [options, setOptions] = useState(config.options);
  const [newTitle, setNewTitle] = useState("");
  const [newPayload, setNewPayload] = useState("");

  const addOption = () => {
    if (newTitle.trim()) {
      setOptions([...options, { title: newTitle.trim(), payload: newPayload.trim() || newTitle.trim() }]);
      setNewTitle("");
      setNewPayload("");
    }
  };

  const removeOption = (index: number) => {
    setOptions(options.filter((_, i) => i !== index));
  };

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <h3>Quick Replies</h3>
          <p className="section-desc">כפתורים אינטראקטיביים שנשלחים בהודעה הפרטית</p>
        </div>
        <label className="switch">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          <span className="slider" />
        </label>
      </div>

      <p style={{ fontSize: 12, color: "#666", marginBottom: 16 }}>
        עד 13 כפתורים, כל כפתור עד 20 תווים. כשהמשתמש לוחץ, הטקסט נשלח כהודעה.
      </p>

      {options.map((opt, i) => (
        <div className="qr-item" key={i}>
          <span>{opt.title}</span>
          <span style={{ fontSize: 11, color: "#666" }}>payload: {opt.payload}</span>
          <button className="btn btn-danger btn-sm" onClick={() => removeOption(i)}>x</button>
        </div>
      ))}

      {options.length < 13 && (
        <div style={{ marginTop: 12 }}>
          <div className="form-row">
            <div className="form-group">
              <label>טקסט הכפתור</label>
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="למשל: מחירון"
                maxLength={20}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addOption())}
              />
            </div>
            <div className="form-group">
              <label>Payload (מזהה פנימי)</label>
              <input
                value={newPayload}
                onChange={(e) => setNewPayload(e.target.value)}
                placeholder="למשל: PRICE_LIST"
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addOption())}
              />
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={addOption}>+ הוסף כפתור</button>
        </div>
      )}

      <div className="actions" style={{ marginTop: 16 }}>
        <button
          className="btn btn-primary"
          onClick={() => onSave({ quickReplies: { enabled, options } })}
        >
          שמור שינויים
        </button>
      </div>
    </div>
  );
}

// ========== Welcome Message Tab ==========
function WelcomeTab({
  config,
  onSave,
}: {
  config: { enabled: boolean; message: string };
  onSave: (u: Partial<AppConfig>) => void;
}) {
  const [enabled, setEnabled] = useState(config.enabled);
  const [message, setMessage] = useState(config.message);

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <h3>הודעת ברוכים הבאים</h3>
          <p className="section-desc">הודעה אוטומטית שנשלחת לעוקבים חדשים</p>
        </div>
        <label className="switch">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          <span className="slider" />
        </label>
      </div>

      <p style={{ fontSize: 12, color: "#f87171", marginBottom: 16 }}>
        שים לב: Instagram API מאפשר לשלוח DM רק למי שפנה אליך קודם (חלון 24 שעות).
        הודעת ברוכים הבאים תעבוד רק אם העוקב החדש שלח לך הודעה.
      </p>

      <div className="form-group">
        <label>הודעת ברוכים הבאים</label>
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} />
      </div>

      <button
        className="btn btn-primary"
        onClick={() => onSave({ welcomeMessage: { enabled, message } })}
      >
        שמור שינויים
      </button>
    </div>
  );
}

// ========== Post Edit Form ==========
function PostEditForm({
  post,
  onSave,
  onCancel,
}: {
  post: PostConfig;
  onSave: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(post.name);
  const [replyMessages, setReplyMessages] = useState<string[]>(
    post.replyMessages && post.replyMessages.length > 0 ? post.replyMessages : [""]
  );
  const [dmMessage, setDmMessage] = useState(post.dmMessage);
  const [dmFlow, setDmFlow] = useState<FlowStep[]>(post.dmFlow || []);
  const [sendDM, setSendDM] = useState(post.sendDM);
  const [keywords, setKeywords] = useState<string[]>(post.keywords);
  const [kwInput, setKwInput] = useState("");

  const addKeyword = () => {
    if (kwInput.trim() && !keywords.includes(kwInput.trim())) {
      setKeywords([...keywords, kwInput.trim()]);
      setKwInput("");
    }
  };

  const submit = async () => {
    await fetch("/api/config/posts", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...post,
        name,
        keywords,
        replyMessages: replyMessages.filter((m) => m.trim().length > 0),
        dmMessage,
        dmFlow,
        sendDM,
      }),
    });
    onSave();
  };

  return (
    <div className="card" style={{ borderColor: "#f59e0b" }}>
      <h3 style={{ color: "#fff", marginBottom: 16 }}>עריכת פוסט</h3>
      <div className="form-group">
        <label>שם הפוסט</label>
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="form-group">
        <label>מילות מפתח (אופציונלי)</label>
        <div className="keyword-input">
          <input
            value={kwInput}
            onChange={(e) => setKwInput(e.target.value)}
            placeholder="הקלד מילה ולחץ הוסף"
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addKeyword())}
          />
          <button className="btn btn-ghost btn-sm" onClick={addKeyword}>הוסף</button>
        </div>
        {keywords.length > 0 && (
          <div className="tags">
            {keywords.map((kw) => (
              <span className="tag" key={kw}>
                {kw}
                <button onClick={() => setKeywords(keywords.filter((k) => k !== kw))}>x</button>
              </span>
            ))}
          </div>
        )}
      </div>
      <RepliesEditor messages={replyMessages} onChange={setReplyMessages} />
      <div className="checkbox-group">
        <input type="checkbox" checked={sendDM} onChange={(e) => setSendDM(e.target.checked)} />
        <label>שלח גם הודעה פרטית (DM)</label>
      </div>
      {sendDM && (
        <MessageEditor
          dmMessage={dmMessage}
          dmFlow={dmFlow}
          onChangeText={setDmMessage}
          onChangeFlow={setDmFlow}
        />
      )}
      <div className="actions">
        <button className="btn btn-primary" onClick={submit}>שמור שינויים</button>
        <button className="btn btn-ghost" onClick={onCancel}>ביטול</button>
      </div>
    </div>
  );
}

// ========== Keyword Edit Form ==========
function KeywordEditForm({
  kw,
  onSave,
  onCancel,
}: {
  kw: KeywordTrigger;
  onSave: () => void;
  onCancel: () => void;
}) {
  const [keyword, setKeyword] = useState(kw.keyword);
  const [replyMessage, setReplyMessage] = useState(kw.replyMessage);
  const [dmMessage, setDmMessage] = useState(kw.dmMessage);
  const [dmFlow, setDmFlow] = useState<FlowStep[]>(kw.dmFlow || []);
  const [sendDM, setSendDM] = useState(kw.sendDM);
  const [matchExact, setMatchExact] = useState(kw.matchExact);

  const submit = async () => {
    await fetch("/api/config/keywords", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...kw,
        keyword,
        replyMessage,
        dmMessage,
        dmFlow,
        sendDM,
        matchExact,
      }),
    });
    onSave();
  };

  return (
    <div className="card" style={{ borderColor: "#f59e0b" }}>
      <h3 style={{ color: "#fff", marginBottom: 16 }}>עריכת מילת מפתח</h3>
      <div className="form-group">
        <label>מילת מפתח</label>
        <input value={keyword} onChange={(e) => setKeyword(e.target.value)} />
      </div>
      <div className="checkbox-group">
        <input type="checkbox" checked={matchExact} onChange={(e) => setMatchExact(e.target.checked)} />
        <label>התאמה מדויקת בלבד</label>
      </div>
      <div className="form-group">
        <label>הודעת תגובה (Reply)</label>
        <textarea value={replyMessage} onChange={(e) => setReplyMessage(e.target.value)} />
      </div>
      <div className="checkbox-group">
        <input type="checkbox" checked={sendDM} onChange={(e) => setSendDM(e.target.checked)} />
        <label>שלח גם הודעה פרטית (DM)</label>
      </div>
      {sendDM && (
        <MessageEditor
          dmMessage={dmMessage}
          dmFlow={dmFlow}
          onChangeText={setDmMessage}
          onChangeFlow={setDmFlow}
        />
      )}
      <div className="actions">
        <button className="btn btn-primary" onClick={submit}>שמור שינויים</button>
        <button className="btn btn-ghost" onClick={onCancel}>ביטול</button>
      </div>
    </div>
  );
}

// ========== Manage Tab — unified view ==========
function ManageTab({
  posts,
  keywords,
  onRefresh,
  onToast,
  onGoTo,
}: {
  posts: PostConfig[];
  keywords: KeywordTrigger[];
  onRefresh: () => void;
  onToast: (m: string) => void;
  onGoTo: (tab: string) => void;
}) {
  const [filter, setFilter] = useState<"all" | "active" | "inactive">("all");
  const [editingPost, setEditingPost] = useState<PostConfig | null>(null);
  const [editingKeyword, setEditingKeyword] = useState<KeywordTrigger | null>(null);

  const togglePost = async (post: PostConfig) => {
    await fetch("/api/config/posts", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...post, enabled: !post.enabled }),
    });
    onRefresh();
    onToast(post.enabled ? "הושהה" : "הופעל");
  };

  const toggleKeyword = async (kw: KeywordTrigger) => {
    await fetch("/api/config/keywords", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...kw, enabled: !kw.enabled }),
    });
    onRefresh();
    onToast(kw.enabled ? "הושהה" : "הופעל");
  };

  const deletePost = async (id: string) => {
    if (!confirm("למחוק את הפוסט?")) return;
    await fetch("/api/config/posts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    onRefresh();
    onToast("נמחק!");
  };

  const deleteKeyword = async (id: string) => {
    if (!confirm("למחוק את מילת המפתח?")) return;
    await fetch("/api/config/keywords", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    onRefresh();
    onToast("נמחק!");
  };

  const passFilter = (enabled: boolean) => {
    if (filter === "all") return true;
    if (filter === "active") return enabled;
    return !enabled;
  };

  const filteredPosts = posts.filter((p) => passFilter(p.enabled));
  const filteredKeywords = keywords.filter((k) => passFilter(k.enabled));
  const total = posts.length + keywords.length;
  const active = posts.filter((p) => p.enabled).length + keywords.filter((k) => k.enabled).length;

  return (
    <div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <div>
            <h3>סקירה כללית</h3>
            <p className="section-desc">
              {active} פעילים מתוך {total} חוקים
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => onGoTo("posts")}>+ פוסט</button>
            <button className="btn btn-ghost btn-sm" onClick={() => onGoTo("keywords")}>+ מילת מפתח</button>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button
            className={`btn btn-sm ${filter === "all" ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setFilter("all")}
          >
            הכל ({total})
          </button>
          <button
            className={`btn btn-sm ${filter === "active" ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setFilter("active")}
          >
            פעילים ({active})
          </button>
          <button
            className={`btn btn-sm ${filter === "inactive" ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setFilter("inactive")}
          >
            כבויים ({total - active})
          </button>
        </div>
      </div>

      {editingPost && (
        <PostEditForm
          post={editingPost}
          onSave={() => {
            setEditingPost(null);
            onRefresh();
            onToast("עודכן!");
          }}
          onCancel={() => setEditingPost(null)}
        />
      )}

      {editingKeyword && (
        <KeywordEditForm
          kw={editingKeyword}
          onSave={() => {
            setEditingKeyword(null);
            onRefresh();
            onToast("עודכן!");
          }}
          onCancel={() => setEditingKeyword(null)}
        />
      )}

      {filteredPosts.length === 0 && filteredKeywords.length === 0 && (
        <div className="empty">
          <p>אין חוקים להצגה</p>
        </div>
      )}

      {filteredPosts.map((post) => (
        <div className="card" key={`post-${post.id}`}>
          <div className="card-header">
            <div>
              <span className="tag" style={{ fontSize: 11, marginLeft: 8 }}>פוסט</span>
              <strong style={{ color: "#fff" }}>{post.name}</strong>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span className={`status ${post.enabled ? "status-on" : "status-off"}`}>
                {post.enabled ? "פעיל" : "מושהה"}
              </span>
              <label className="switch">
                <input type="checkbox" checked={post.enabled} onChange={() => togglePost(post)} />
                <span className="slider" />
              </label>
            </div>
          </div>
          <div style={{ marginTop: 8 }}>
            <RepliesSummary messages={post.replyMessages || []} />
          </div>
          {post.sendDM && <FlowSummary dmMessage={post.dmMessage} dmFlow={post.dmFlow || []} />}
          <div className="actions">
            <button className="btn btn-ghost btn-sm" onClick={() => setEditingPost(post)}>ערוך</button>
            <button className="btn btn-ghost btn-sm" onClick={() => togglePost(post)}>
              {post.enabled ? "השהה" : "הפעל"}
            </button>
            <button className="btn btn-danger btn-sm" onClick={() => deletePost(post.id)}>מחק</button>
          </div>
        </div>
      ))}

      {filteredKeywords.map((kw) => (
        <div className="card" key={`kw-${kw.id}`}>
          <div className="card-header">
            <div>
              <span className="tag" style={{ fontSize: 11, marginLeft: 8 }}>מילת מפתח</span>
              <strong style={{ color: "#fff" }}>{kw.keyword}</strong>
              {kw.matchExact && (
                <span style={{ fontSize: 11, color: "#666", marginRight: 8 }}>התאמה מדויקת</span>
              )}
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span className={`status ${kw.enabled ? "status-on" : "status-off"}`}>
                {kw.enabled ? "פעיל" : "מושהה"}
              </span>
              <label className="switch">
                <input type="checkbox" checked={kw.enabled} onChange={() => toggleKeyword(kw)} />
                <span className="slider" />
              </label>
            </div>
          </div>
          <div style={{ fontSize: 13, color: "#aaa", marginTop: 8 }}>
            תגובה: {kw.replyMessage}
          </div>
          {kw.sendDM && <FlowSummary dmMessage={kw.dmMessage} dmFlow={kw.dmFlow || []} />}
          <div className="actions">
            <button className="btn btn-ghost btn-sm" onClick={() => setEditingKeyword(kw)}>ערוך</button>
            <button className="btn btn-ghost btn-sm" onClick={() => toggleKeyword(kw)}>
              {kw.enabled ? "השהה" : "הפעל"}
            </button>
            <button className="btn btn-danger btn-sm" onClick={() => deleteKeyword(kw.id)}>מחק</button>
          </div>
        </div>
      ))}
    </div>
  );
}
