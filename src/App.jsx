import { useState, useRef, useCallback } from "react";

const INITIAL_FORM = {
  name: "",
  company: "",
  address: "",
  feedback: "",
  photo: null,
  photoPreview: null,
  websiteUrl: "",
};

// ── helpers ────────────────────────────────────────────────────────────────
function dataURLtoFile(dataurl, filename) {
  const arr = dataurl.split(",");
  const mime = arr[0].match(/:(.*?);/)[1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) u8arr[n] = bstr.charCodeAt(n);
  return new File([u8arr], filename, { type: mime });
}

// ── Compact Spinner ────────────────────────────────────────────────────────
function Spinner({ size = 20 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      style={{ animation: "spin 0.9s linear infinite", display: "inline-block" }}
    >
      <circle cx="12" cy="12" r="10" stroke="#C8B8A2" strokeWidth="3" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="#4A3728" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

// ── Toast ──────────────────────────────────────────────────────────────────
function Toast({ msg, type }) {
  if (!msg) return null;
  const bg = type === "error" ? "#B94040" : "#3A7D5A";
  return (
    <div style={{
      position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
      background: bg, color: "#fff", padding: "12px 22px", borderRadius: 10,
      fontSize: 14, fontFamily: "Inter, sans-serif", zIndex: 999,
      boxShadow: "0 4px 20px rgba(0,0,0,0.25)", maxWidth: "88vw", textAlign: "center"
    }}>
      {msg}
    </div>
  );
}

// ── Camera / Photo Picker ──────────────────────────────────────────────────
function PhotoCapture({ photoPreview, onPhoto }) {
  const fileRef = useRef();
  const videoRef = useRef();
  const canvasRef = useRef();
  const [mode, setMode] = useState(null); // null | "camera" | "preview"
  const [stream, setStream] = useState(null);

  const openCamera = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      setStream(s);
      setMode("camera");
      setTimeout(() => { if (videoRef.current) videoRef.current.srcObject = s; }, 100);
    } catch {
      fileRef.current?.click();
    }
  };

  const snap = () => {
    const v = videoRef.current;
    const c = canvasRef.current;
    if (!v || !c) return;
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext("2d").drawImage(v, 0, 0);
    const dataUrl = c.toDataURL("image/jpeg", 0.85);
    stream?.getTracks().forEach(t => t.stop());
    setStream(null);
    setMode(null);
    onPhoto(dataUrl);
  };

  const closeCamera = () => {
    stream?.getTracks().forEach(t => t.stop());
    setStream(null);
    setMode(null);
  };

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => onPhoto(ev.target.result);
    reader.readAsDataURL(file);
  };

  return (
    <div>
      {/* hidden inputs */}
      <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleFile} />
      <canvas ref={canvasRef} style={{ display: "none" }} />

      {/* camera overlay */}
      {mode === "camera" && (
        <div style={{
          position: "fixed", inset: 0, background: "#000", zIndex: 900,
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center"
        }}>
          <video ref={videoRef} autoPlay playsInline muted
            style={{ width: "100%", maxHeight: "70vh", objectFit: "cover" }} />
          <div style={{ display: "flex", gap: 16, marginTop: 20 }}>
            <button onClick={snap} style={snapBtn}>📸 Capture</button>
            <button onClick={closeCamera} style={{ ...snapBtn, background: "#555" }}>✕ Cancel</button>
          </div>
        </div>
      )}

      {/* photo display / buttons */}
      {photoPreview ? (
        <div style={{ position: "relative", width: "100%", maxWidth: 320, margin: "0 auto" }}>
          <img src={photoPreview} alt="Captured"
            style={{ width: "100%", borderRadius: 12, border: "2px solid #D4C4B0", display: "block" }} />
          <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
            <button onClick={openCamera} style={secondaryBtn}>📷 Retake</button>
            <button onClick={() => fileRef.current?.click()} style={secondaryBtn}>🖼 Change</button>
          </div>
        </div>
      ) : (
        <div style={{
          border: "2px dashed #C8B8A2", borderRadius: 12, padding: "32px 16px",
          textAlign: "center", background: "#FAF7F3", cursor: "pointer"
        }}
          onClick={openCamera}
        >
          <div style={{ fontSize: 40, marginBottom: 8 }}>📷</div>
          <p style={{ color: "#7A6855", fontFamily: "Inter, sans-serif", margin: 0, fontSize: 14 }}>
            Tap to take a photo or choose from gallery
          </p>
          <button onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }}
            style={{ ...secondaryBtn, marginTop: 12 }}>Browse Gallery</button>
        </div>
      )}
    </div>
  );
}

// ── Website Extractor ──────────────────────────────────────────────────────
function WebsiteExtractor({ onExtracted, apiLoading, setApiLoading, setToast }) {
  const [url, setUrl] = useState("");

  const extract = async () => {
    if (!url.trim()) return;
    let cleanUrl = url.trim();
    if (!/^https?:\/\//i.test(cleanUrl)) cleanUrl = "https://" + cleanUrl;

    setApiLoading(true);
    try {
      const prompt = `Visit this website URL and extract the following information as JSON (no markdown):
URL: ${cleanUrl}

Extract:
- name: person or contact name shown on the site (string)
- company: company or organization name (string)
- address: full address listed (string)
- feedback: a short 1–2 sentence description / tagline about the business shown (string)
- websiteUrl: the URL itself (string)

If any field is not found, return an empty string for it.
Return only valid JSON, no explanation.`;

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json",
  "x-api-key": import.meta.env.VITE_ANTHROPIC_API_KEY,
  "anthropic-version": "2023-06-01",
  "anthropic-dangerous-direct-browser-access": "true" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 1000,
          tools: [{ type: "web_search_20250305", name: "web_search" }],
          messages: [{ role: "user", content: prompt }]
        })
      });

      const data = await res.json();
      const text = (data.content || [])
        .filter(b => b.type === "text")
        .map(b => b.text)
        .join("\n");

      const cleaned = text.replace(/```json|```/g, "").trim();
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON found");
      const parsed = JSON.parse(jsonMatch[0]);
      onExtracted({ ...parsed, websiteUrl: cleanUrl });
      setToast({ msg: "✅ Website data extracted!", type: "success" });
    } catch (err) {
      setToast({ msg: "Could not extract website data. Fill fields manually.", type: "error" });
    } finally {
      setApiLoading(false);
    }
  };

  return (
    <div style={{ marginBottom: 24 }}>
      <label style={labelStyle}>🌐 Auto-fill from Website</label>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          type="url"
          placeholder="https://example.com"
          value={url}
          onChange={e => setUrl(e.target.value)}
          onKeyDown={e => e.key === "Enter" && extract()}
          style={{ ...inputStyle, flex: 1 }}
        />
        <button onClick={extract} disabled={apiLoading || !url.trim()}
          style={{
            ...primaryBtn, minWidth: 80, opacity: (apiLoading || !url.trim()) ? 0.6 : 1,
            display: "flex", alignItems: "center", gap: 6
          }}>
          {apiLoading ? <Spinner size={16} /> : "Fetch"}
        </button>
      </div>
      <p style={{ fontSize: 12, color: "#9A8878", marginTop: 4, fontFamily: "Inter, sans-serif" }}>
        Paste any website URL — we'll auto-fill the form fields below.
      </p>
    </div>
  );
}

// ── Card Preview ───────────────────────────────────────────────────────────
function CardPreview({ card, onClose }) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(30,20,10,0.65)", zIndex: 800,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16
    }} onClick={onClose}>
      <div style={{
        background: "#FBF8F4", borderRadius: 18, maxWidth: 380, width: "100%",
        padding: 24, boxShadow: "0 8px 40px rgba(0,0,0,0.3)", position: "relative"
      }} onClick={e => e.stopPropagation()}>
        <button onClick={onClose} style={{
          position: "absolute", top: 12, right: 12, background: "none", border: "none",
          fontSize: 20, cursor: "pointer", color: "#7A6855"
        }}>✕</button>

        {card.photoPreview && (
          <img src={card.photoPreview} alt={card.name}
            style={{ width: "100%", borderRadius: 12, marginBottom: 16, maxHeight: 200, objectFit: "cover" }} />
        )}
        <h2 style={{ ...display, fontSize: 20, margin: "0 0 4px" }}>{card.name || "—"}</h2>
        <p style={{ color: "#C87941", fontFamily: "Inter, sans-serif", fontSize: 14, margin: "0 0 12px", fontWeight: 600 }}>
          {card.company || "—"}
        </p>
        {card.address && <p style={metaRow}>📍 {card.address}</p>}
        {card.websiteUrl && (
          <p style={metaRow}>
            🌐 <a href={card.websiteUrl} target="_blank" rel="noreferrer"
              style={{ color: "#4A7CAA", textDecoration: "none" }}>{card.websiteUrl}</a>
          </p>
        )}
        {card.feedback && (
          <div style={{
            background: "#F0E8DC", borderRadius: 8, padding: "10px 14px", marginTop: 10
          }}>
            <p style={{ margin: 0, fontFamily: "Inter, sans-serif", fontSize: 13, color: "#5A4030", fontStyle: "italic" }}>
              "{card.feedback}"
            </p>
          </div>
        )}
        <p style={{ fontSize: 11, color: "#B0A090", marginTop: 12, fontFamily: "Inter, sans-serif" }}>
          Registered {new Date(card.createdAt).toLocaleDateString()}
        </p>
      </div>
    </div>
  );
}

// ── Main App ───────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState("register"); // "register" | "records"
  const [form, setForm] = useState(INITIAL_FORM);
  const [records, setRecords] = useState([]);
  const [saving, setSaving] = useState(false);
  const [apiLoading, setApiLoading] = useState(false);
  const [toast, setToast] = useState({ msg: "", type: "success" });
  const [preview, setPreview] = useState(null);

  const showToast = useCallback((msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast({ msg: "", type: "success" }), 3200);
  }, []);

  const handlePhoto = (dataUrl) => {
    setForm(f => ({ ...f, photo: dataURLtoFile(dataUrl, "photo.jpg"), photoPreview: dataUrl }));
  };

  const handleExtracted = (data) => {
    setForm(f => ({
      ...f,
      name: data.name || f.name,
      company: data.company || f.company,
      address: data.address || f.address,
      feedback: data.feedback || f.feedback,
      websiteUrl: data.websiteUrl || f.websiteUrl,
    }));
  };

  const handleSave = async () => {
    if (!form.name.trim()) { showToast("Name is required.", "error"); return; }
    setSaving(true);
    await new Promise(r => setTimeout(r, 600));
    const record = { ...form, id: Date.now(), createdAt: new Date().toISOString() };
    setRecords(prev => [record, ...prev]);
    setForm(INITIAL_FORM);
    setSaving(false);
    showToast("✅ Contact registered successfully!");
    setTab("records");
  };

  return (
    <div style={{ minHeight: "100vh", background: "#F5F0EB", fontFamily: "Inter, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Playfair+Display:wght@700&display=swap');
        * { box-sizing: border-box; }
        body { margin: 0; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        input:focus, textarea:focus { outline: none; border-color: #C87941 !important; box-shadow: 0 0 0 3px rgba(200,121,65,0.15); }
        ::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-thumb { background: #D4C4B0; border-radius: 3px; }
      `}</style>

      {/* Header */}
      <header style={{
        background: "#2E1F0F", padding: "18px 20px 0", position: "sticky", top: 0, zIndex: 100,
        boxShadow: "0 2px 12px rgba(0,0,0,0.25)"
      }}>
        <div style={{ maxWidth: 560, margin: "0 auto" }}>
          <h1 style={{ ...display, color: "#F5ECD8", fontSize: 22, margin: "0 0 16px", letterSpacing: 0.3 }}>
            📋 ContactVault
          </h1>
          <div style={{ display: "flex", gap: 4 }}>
            {["register", "records"].map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: tab === t ? "#C87941" : "transparent",
                color: tab === t ? "#fff" : "#B0A090",
                border: "none", borderRadius: "8px 8px 0 0", padding: "8px 20px",
                fontFamily: "Inter, sans-serif", fontWeight: 600, fontSize: 13,
                cursor: "pointer", transition: "all 0.2s", textTransform: "capitalize",
                letterSpacing: 0.4
              }}>
                {t === "register" ? "➕ Register" : `📁 Records (${records.length})`}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 560, margin: "0 auto", padding: "24px 16px 80px" }}>

        {/* REGISTER TAB */}
        {tab === "register" && (
          <div style={{ animation: "fadeUp 0.3s ease" }}>
            <p style={{ color: "#7A6855", fontSize: 14, marginTop: 0, marginBottom: 20 }}>
              Take a photo, paste a website URL, or fill fields manually.
            </p>

            {/* Photo */}
            <section style={sectionCard}>
              <h3 style={sectionTitle}>📸 Photo</h3>
              <PhotoCapture photoPreview={form.photoPreview} onPhoto={handlePhoto} />
            </section>

            {/* Website auto-fill */}
            <section style={sectionCard}>
              <WebsiteExtractor
                onExtracted={handleExtracted}
                apiLoading={apiLoading}
                setApiLoading={setApiLoading}
                setToast={({ msg, type }) => showToast(msg, type)}
              />
            </section>

            {/* Manual fields */}
            <section style={sectionCard}>
              <h3 style={sectionTitle}>📝 Contact Details</h3>
              {[
                { key: "name", label: "Full Name *", placeholder: "Jane Doe", icon: "👤" },
                { key: "company", label: "Company / Organization", placeholder: "Acme Corp", icon: "🏢" },
                { key: "websiteUrl", label: "Website URL", placeholder: "https://acme.com", icon: "🌐" },
                { key: "address", label: "Address", placeholder: "123 Main St, City, Country", icon: "📍" },
              ].map(({ key, label, placeholder, icon }) => (
                <div key={key} style={{ marginBottom: 16 }}>
                  <label style={labelStyle}>{icon} {label}</label>
                  <input
                    type={key === "websiteUrl" ? "url" : "text"}
                    placeholder={placeholder}
                    value={form[key]}
                    onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                    style={inputStyle}
                  />
                </div>
              ))}

              <div style={{ marginBottom: 4 }}>
                <label style={labelStyle}>💬 Feedback / Notes</label>
                <textarea
                  rows={3}
                  placeholder="Add notes about this contact or business…"
                  value={form.feedback}
                  onChange={e => setForm(f => ({ ...f, feedback: e.target.value }))}
                  style={{ ...inputStyle, resize: "vertical" }}
                />
              </div>
            </section>

            <button onClick={handleSave} disabled={saving}
              style={{ ...primaryBtn, width: "100%", fontSize: 16, padding: "14px", marginTop: 8,
                opacity: saving ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
              {saving ? <><Spinner /> Saving…</> : "💾 Register Contact"}
            </button>
          </div>
        )}

        {/* RECORDS TAB */}
        {tab === "records" && (
          <div style={{ animation: "fadeUp 0.3s ease" }}>
            {records.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 20px", color: "#9A8878" }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>📂</div>
                <p style={{ fontSize: 15 }}>No contacts yet.<br />Register your first one!</p>
                <button onClick={() => setTab("register")} style={{ ...primaryBtn, marginTop: 8 }}>
                  ➕ Register Contact
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {records.map(r => (
                  <div key={r.id} onClick={() => setPreview(r)}
                    style={{
                      background: "#fff", borderRadius: 14, padding: 16,
                      display: "flex", gap: 14, alignItems: "center",
                      boxShadow: "0 2px 10px rgba(0,0,0,0.07)", cursor: "pointer",
                      border: "1px solid #EDE3D8", transition: "transform 0.15s",
                    }}
                    onMouseEnter={e => e.currentTarget.style.transform = "translateY(-2px)"}
                    onMouseLeave={e => e.currentTarget.style.transform = "translateY(0)"}
                  >
                    {r.photoPreview
                      ? <img src={r.photoPreview} alt={r.name}
                          style={{ width: 56, height: 56, borderRadius: 10, objectFit: "cover", flexShrink: 0 }} />
                      : <div style={{
                          width: 56, height: 56, borderRadius: 10, background: "#F0E4D4",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 24, flexShrink: 0
                        }}>👤</div>
                    }
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: "0 0 2px", fontWeight: 700, color: "#2E1F0F", fontSize: 15,
                        fontFamily: "Playfair Display, serif", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {r.name}
                      </p>
                      <p style={{ margin: 0, fontSize: 13, color: "#C87941", fontWeight: 600 }}>{r.company}</p>
                      {r.address && <p style={{ margin: "2px 0 0", fontSize: 12, color: "#9A8878",
                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>📍 {r.address}</p>}
                    </div>
                    <span style={{ color: "#C8B8A2", fontSize: 18 }}>›</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {preview && <CardPreview card={preview} onClose={() => setPreview(null)} />}
      <Toast msg={toast.msg} type={toast.type} />
    </div>
  );
}

// ── Shared styles ──────────────────────────────────────────────────────────
const display = { fontFamily: "Playfair Display, serif", fontWeight: 700, color: "#2E1F0F" };

const inputStyle = {
  width: "100%", padding: "11px 14px", border: "1.5px solid #D4C4B0",
  borderRadius: 9, fontSize: 15, fontFamily: "Inter, sans-serif",
  background: "#FBF8F4", color: "#2E1F0F", transition: "border-color 0.2s",
};

const labelStyle = {
  display: "block", marginBottom: 6, fontSize: 13, fontWeight: 600,
  color: "#5A4030", fontFamily: "Inter, sans-serif",
};

const primaryBtn = {
  background: "linear-gradient(135deg, #C87941 0%, #A85E28 100%)",
  color: "#fff", border: "none", borderRadius: 10, padding: "11px 20px",
  fontFamily: "Inter, sans-serif", fontWeight: 700, fontSize: 14,
  cursor: "pointer", transition: "opacity 0.2s",
};

const secondaryBtn = {
  background: "#F0E4D4", color: "#5A4030", border: "none", borderRadius: 8,
  padding: "8px 14px", fontFamily: "Inter, sans-serif", fontWeight: 600,
  fontSize: 13, cursor: "pointer",
};

const snapBtn = {
  background: "#C87941", color: "#fff", border: "none", borderRadius: 10,
  padding: "12px 24px", fontFamily: "Inter, sans-serif", fontWeight: 700,
  fontSize: 15, cursor: "pointer",
};

const sectionCard = {
  background: "#fff", borderRadius: 14, padding: 18,
  boxShadow: "0 2px 10px rgba(0,0,0,0.06)", marginBottom: 16,
  border: "1px solid #EDE3D8",
};

const sectionTitle = {
  ...display, fontSize: 16, margin: "0 0 14px", paddingBottom: 10,
  borderBottom: "1px solid #EDE3D8",
};

const metaRow = {
  margin: "4px 0", fontFamily: "Inter, sans-serif", fontSize: 13, color: "#5A4030",
};
