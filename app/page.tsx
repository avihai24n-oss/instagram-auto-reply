"use client";

import { useState, useEffect, useCallback } from "react";
import "./globals.css";

interface PostConfig {
  id: string;
  mediaId: string;
  name: string;
  enabled: boolean;
  keywords: string[];
  replyMessage: string;
  dmMessage: string;
  sendDM: boolean;
  quickReplies: { title: string; payload: string }[];
}

interface KeywordTrigger {
  id: string;
  keyword: string;
  enabled: boolean;
  replyMessage: string;
  dmMessage: string;
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
  { id: "general", label: "הגדרות כלליות" },
  { id: "posts", label: "פוסטים ספציפיים" },
  { id: "keywords", label: "מילות מפתח" },
  { id: "quickreplies", label: "Quick Replies" },
  { id: "welcome", label: "הודעת ברוכים הבאים" },
];

export default function Dashboard() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [activeTab, setActiveTab] = useState("general");
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
  const [showForm, setShowForm] = useState(false);

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
          <p className="section-desc">הגדר תגובה והודעה שונה לכל פוסט</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>
          + הוסף פוסט
        </button>
      </div>

      {showForm && (
        <PostForm
          onSave={() => {
            setShowForm(false);
            onRefresh();
            onToast("פוסט נוסף!");
          }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {posts.length === 0 && !showForm && (
        <div className="empty">
          <p>אין פוסטים מוגדרים עדיין</p>
          <p style={{ fontSize: 13, marginTop: 8 }}>
            לחץ על &quot;הוסף פוסט&quot; כדי להגדיר תגובות לפוסט ספציפי
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
          <div style={{ fontSize: 13, color: "#aaa", marginBottom: 4 }}>
            תגובה: {post.replyMessage}
          </div>
          {post.sendDM && (
            <div style={{ fontSize: 13, color: "#aaa" }}>DM: {post.dmMessage}</div>
          )}
          <div className="actions">
            <button className="btn btn-danger btn-sm" onClick={() => deletePost(post.id)}>
              מחק
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function PostForm({ onSave, onCancel }: { onSave: () => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [mediaId, setMediaId] = useState("");
  const [replyMessage, setReplyMessage] = useState("");
  const [dmMessage, setDmMessage] = useState("");
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
        mediaId,
        name,
        enabled: true,
        keywords,
        replyMessage,
        dmMessage,
        sendDM,
        quickReplies: [],
      }),
    });
    onSave();
  };

  return (
    <div className="card" style={{ borderColor: "#2563eb" }}>
      <h3 style={{ marginBottom: 16, color: "#fff" }}>פוסט חדש</h3>
      <div className="form-row">
        <div className="form-group">
          <label>שם הפוסט (לזיהוי שלך)</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="למשל: מבצע קיץ" />
        </div>
        <div className="form-group">
          <label>Media ID (מזהה הפוסט באינסטגרם)</label>
          <input value={mediaId} onChange={(e) => setMediaId(e.target.value)} placeholder="12345678..." />
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
      <div className="form-group">
        <label>הודעת תגובה (Reply)</label>
        <textarea value={replyMessage} onChange={(e) => setReplyMessage(e.target.value)} placeholder="ההודעה שתופיע כתגובה בפוסט" />
      </div>
      <div className="checkbox-group">
        <input type="checkbox" checked={sendDM} onChange={(e) => setSendDM(e.target.checked)} />
        <label>שלח גם הודעה פרטית (DM)</label>
      </div>
      {sendDM && (
        <div className="form-group">
          <label>הודעה פרטית (DM)</label>
          <textarea value={dmMessage} onChange={(e) => setDmMessage(e.target.value)} placeholder="ההודעה שתישלח בפרטי" />
        </div>
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
          {kw.sendDM && (
            <div style={{ fontSize: 13, color: "#aaa" }}>DM: {kw.dmMessage}</div>
          )}
          <div className="actions">
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
  const [sendDM, setSendDM] = useState(true);
  const [matchExact, setMatchExact] = useState(false);

  const submit = async () => {
    await fetch("/api/config/keywords", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyword, enabled: true, replyMessage, dmMessage, sendDM, matchExact }),
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
        <div className="form-group">
          <label>הודעה פרטית (DM)</label>
          <textarea value={dmMessage} onChange={(e) => setDmMessage(e.target.value)} />
        </div>
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
