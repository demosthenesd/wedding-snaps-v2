import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import "./styles.css";

const MAX_BYTES = 100_000;
const MAX_DIM = 1600;
const SWIPE_PX = 40;
const SLIDE_MS = 260;

// Local backend (hardcoded for now)
const API_BASE = "http://localhost:8080";

// Local expiring counter (UI-only; backend also enforces)
const UPLOAD_LIMIT_STATE_KEY = "wedding_snaps_upload_limit_state_v2";
const UPLOAD_LIMIT_TTL_MS_DEFAULT = 24 * 60 * 60 * 1000; // 1 day

// Device id (sent to backend for per-device limit)
const DEVICE_ID_KEY = "wedding_snaps_device_id_v1";

function bytesToHuman(n) {
  if (!Number.isFinite(n)) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function isProbablyDesktop() {
  return window.matchMedia("(pointer: fine)").matches && !("ontouchstart" in window);
}

function canvasToJpegBlob(canvas, quality = 0.82) {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

async function fileToResizedJpegBlob(file) {
  const img = await loadImageFromFile(file);

  const { width, height } = img;
  const scale = Math.min(1, MAX_DIM / Math.max(width, height));
  const outW = Math.max(1, Math.round(width * scale));
  const outH = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;

  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, outW, outH);

  try {
    URL.revokeObjectURL(img.src);
  } catch {}

  let blob = await canvasToJpegBlob(canvas, 0.82);
  if (!blob) throw new Error("Failed to encode image.");

  if (blob.size > MAX_BYTES) {
    blob = await canvasToJpegBlob(canvas, 0.65);
    if (!blob) throw new Error("Failed to encode image.");
  }

  return blob;
}

// ---------------------------
// Expiring upload counter helpers (local UI)
// ---------------------------
function safeJsonParse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function readUploadLimitState(ttlMs) {
  const raw = localStorage.getItem(UPLOAD_LIMIT_STATE_KEY);
  const parsed = raw ? safeJsonParse(raw) : null;

  const now = Date.now();
  const startedAt = Number(parsed?.startedAt);
  const count = Number(parsed?.count);

  if (!Number.isFinite(startedAt) || !Number.isFinite(count) || count < 0) {
    return { count: 0, startedAt: now };
  }
  if (now - startedAt >= ttlMs) {
    return { count: 0, startedAt: now };
  }
  return { count, startedAt };
}

function writeUploadLimitState(state) {
  localStorage.setItem(UPLOAD_LIMIT_STATE_KEY, JSON.stringify(state));
}

function msToHuman(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return "soon";
  const totalSeconds = Math.ceil(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (hours <= 0) return `${minutes}m`;
  if (minutes <= 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

function getOrCreateDeviceId() {
  const existing = localStorage.getItem(DEVICE_ID_KEY);
  if (existing) return existing;

  const id =
    (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`) + "";

  localStorage.setItem(DEVICE_ID_KEY, id);
  return id;
}

function getEventIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("e") || "";
}

function isCreateRoute() {
  return window.location.hash === "#/create";
}

function goCreateRoute() {
  window.location.hash = "#/create";
}

function goEventRoute(eventId) {
  // set query param and clear hash
  const url = new URL(window.location.href);
  url.hash = "";
  url.searchParams.set("e", eventId);
  window.location.href = url.toString();
}

// ---------------------------
// Create Event Page
// ---------------------------
function CreateEventPage() {
  const [name, setName] = useState("");
  const [driveFolderId, setDriveFolderId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const [success, setSuccess] = useState(false);
  const [eventId, setEventId] = useState("");
  const [joinUrl, setJoinUrl] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");

  const canSubmit = name.trim().length > 1 && driveFolderId.trim().length > 5 && !busy;

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;

    setBusy(true);
    setMessage("");

    try {
      // Expected backend contract:
      // POST /events { name, driveFolderId }
      // -> { ok: true, eventId } OR { ok: true, id } (handled below)
      const r = await fetch(`${API_BASE}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          driveFolderId: driveFolderId.trim(),
        }),
      });

      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.ok) throw new Error(j?.error || `Create failed (${r.status})`);

      const id = j.eventId || j.id;
      if (!id) throw new Error("Backend did not return eventId.");

      const origin = window.location.origin;
      const url = `${origin}/?e=${encodeURIComponent(id)}`;

      setEventId(id);
      setJoinUrl(url);

      const qr = await QRCode.toDataURL(url, {
        margin: 1,
        width: 280,
        errorCorrectionLevel: "M",
      });
      setQrDataUrl(qr);

      setSuccess(true);
      setMessage("Success ✅ Event created.");
    } catch (err) {
      console.error(err);
      setMessage(err.message || "Could not create event.");
      setSuccess(false);
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(joinUrl);
      setMessage("Link copied ✅");
    } catch {
      setMessage("Couldn’t copy automatically — select and copy the link.");
    }
  };

  return (
    <div className="app">
      <header className="header">
        <div className="badge">✨</div>
        <div style={{ flex: 1 }}>
          <h1>Create event</h1>
          <p className="hint">Set up an event link guests can open to upload wedding snaps.</p>

          <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="button" className="ghostBtn" onClick={() => (window.location.hash = "")}>
              ← Back
            </button>
          </div>
        </div>
      </header>

      <main className="main">
        {!success ? (
          <form className="formCard" onSubmit={onSubmit}>
            <label className="field">
              <span className="label">Event name</span>
              <input
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Windy & Demosthenes Wedding"
                autoComplete="off"
              />
            </label>

            <label className="field">
              <span className="label">Google Drive Folder ID</span>
              <input
                className="input"
                value={driveFolderId}
                onChange={(e) => setDriveFolderId(e.target.value)}
                placeholder="Paste the folder ID (from the URL)"
                autoComplete="off"
              />
              <span className="hint small" style={{ marginTop: 6 }}>
                Tip: In Drive, open the folder — the ID is the long string after <b>/folders/</b> in the URL.
              </span>
            </label>

            <div className="formActions">
              <button type="submit" disabled={!canSubmit}>
                {busy ? "Creating…" : "Create event"}
              </button>
            </div>

            <div className="msg" role="status" aria-live="polite">
              {message}
            </div>
          </form>
        ) : (
          <section className="successCard">
            <h2 style={{ margin: 0 }}>Success! 🎉</h2>
            <p className="hint" style={{ marginTop: 6 }}>
              Your event is ready. Share this link or QR code with guests.
            </p>

            <div className="successGrid">
              <div>
                <div className="label">Event link</div>
                <div className="linkRow">
                  <input className="input" value={joinUrl} readOnly />
                  <button type="button" onClick={copyLink}>
                    Copy
                  </button>
                </div>

                <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button type="button" onClick={() => goEventRoute(eventId)}>
                    Go to event
                  </button>
                  <button type="button" className="ghostBtn" onClick={() => goCreateRoute()}>
                    Create another
                  </button>
                </div>
              </div>

              <div className="qrBox" aria-label="QR code">
                {qrDataUrl ? <img src={qrDataUrl} alt="Event QR code" /> : <div className="hint">Generating QR…</div>}
              </div>
            </div>

            <div className="msg" role="status" aria-live="polite">
              {message}
            </div>
          </section>
        )}
      </main>

      <footer className="footer">
        <small>Note: Your backend must support POST {API_BASE}/events.</small>
      </footer>
    </div>
  );
}

// ---------------------------
// Main Event Page (your existing app)
// ---------------------------
function EventApp() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  const [isDesktop, setIsDesktop] = useState(false);
  const [facingMode, setFacingMode] = useState("environment");
  const [isCameraOn, setIsCameraOn] = useState(false);

  // Pending
  const [pendingBlob, setPendingBlob] = useState(null);
  const [pendingUrl, setPendingUrl] = useState("");
  const [pendingSource, setPendingSource] = useState("");

  // ✅ Gallery now represents SERVER images (loaded from backend)
  // { id, url, sizeBytes?, source? }
  const [gallery, setGallery] = useState([]);

  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  // Event config from backend
  const [eventId] = useState(() => getEventIdFromUrl());
  const [eventName, setEventName] = useState("");
  const [uploadLimit, setUploadLimit] = useState(4);
  const [windowHours, setWindowHours] = useState(24);

  // Drive connection state
  const [isDriveConnected, setIsDriveConnected] = useState(false);
  const connectUrl = useMemo(() => {
    if (!eventId) return "";
    return `${API_BASE}/auth/google/start?eventId=${encodeURIComponent(eventId)}`;
  }, [eventId]);

  const ttlMs = useMemo(() => Math.max(1, windowHours) * 60 * 60 * 1000, [windowHours]);

  // Local expiring upload state (UI-only counter)
  const [{ count: uploadCount, startedAt }, setUploadState] = useState(() =>
    readUploadLimitState(UPLOAD_LIMIT_TTL_MS_DEFAULT)
  );

  // When windowHours arrives, re-check expiry window using that TTL
  useEffect(() => {
    const s = readUploadLimitState(ttlMs);
    setUploadState(s);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ttlMs]);

  useEffect(() => {
    writeUploadLimitState({ count: uploadCount, startedAt });
  }, [uploadCount, startedAt]);

  // Auto-expire while open
  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      if (now - startedAt >= ttlMs) {
        setUploadState({ count: 0, startedAt: now });
        setMessage("Upload limit reset ✅");
      }
    };
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [startedAt, ttlMs]);

  const uploadsLeft = Math.max(0, uploadLimit - uploadCount);
  const limitReached = uploadCount >= uploadLimit;

  const resetInMs = Math.max(0, ttlMs - (Date.now() - startedAt));
  const resetInHuman = msToHuman(resetInMs);

  // Fetch event config
  useEffect(() => {
    const run = async () => {
      if (!eventId) {
        setMessage("Missing event id. Open a link like /?e=EVENT_ID — or create one.");
        return;
      }

      try {
        const r = await fetch(`${API_BASE}/events/${eventId}`);
        const j = await r.json();

        if (!r.ok || !j?.ok) throw new Error(j?.error || `Failed to load event (${r.status})`);

        setEventName(j.name || "");
        setUploadLimit(Number.isFinite(j.uploadLimit) ? j.uploadLimit : 4);
        setWindowHours(Number.isFinite(j.windowHours) ? j.windowHours : 24);
        setIsDriveConnected(!!j.isDriveConnected);
      } catch (e) {
        console.error(e);
        setMessage(`Could not load event config: ${e.message}`);
      }
    };

    run();
  }, [eventId]);

  // ✅ Fetch existing uploads for the grid
  useEffect(() => {
    const run = async () => {
      if (!eventId) return;

      try {
        const r = await fetch(`${API_BASE}/events/${eventId}/uploads?limit=80`);
        const j = await r.json();
        if (!r.ok || !j?.ok) return;

        const items = Array.isArray(j.items) ? j.items : [];
        setGallery(
          items.map((it) => ({
            id: it.driveFileId || it.id,
            url: it.url,
            sizeBytes: null,
            source: "server",
          }))
        );
      } catch (e) {
        console.error(e);
      }
    };

    run();
  }, [eventId, isDriveConnected]);

  // ✅ Carousel modal state
  const [modalIndex, setModalIndex] = useState(-1);
  const [prevIndex, setPrevIndex] = useState(-1);
  const [slideDir, setSlideDir] = useState(0);
  const [animating, setAnimating] = useState(false);

  const modalOpen = modalIndex >= 0 && modalIndex < gallery.length;

  const touchStartXRef = useRef(null);
  const animTimerRef = useRef(null);

  const closeModal = () => {
    setModalIndex(-1);
    setPrevIndex(-1);
    setSlideDir(0);
    setAnimating(false);
    if (animTimerRef.current) clearTimeout(animTimerRef.current);
  };

  const openCarouselAt = (id) => {
    const idx = gallery.findIndex((g) => g.id === id);
    if (idx >= 0) {
      if (animTimerRef.current) clearTimeout(animTimerRef.current);
      setPrevIndex(-1);
      setSlideDir(0);
      setAnimating(false);
      setModalIndex(idx);
    }
  };

  const startSlideTo = (nextIdx, dir) => {
    if (!gallery.length) return;
    if (animating) return;

    setAnimating(true);
    setSlideDir(dir);
    setPrevIndex(modalIndex);
    setModalIndex(nextIdx);

    if (animTimerRef.current) clearTimeout(animTimerRef.current);
    animTimerRef.current = setTimeout(() => {
      setAnimating(false);
      setSlideDir(0);
      setPrevIndex(-1);
    }, SLIDE_MS);
  };

  const goPrev = () => {
    if (!gallery.length || !modalOpen) return;
    const nextIdx = (modalIndex - 1 + gallery.length) % gallery.length;
    startSlideTo(nextIdx, -1);
  };

  const goNext = () => {
    if (!gallery.length || !modalOpen) return;
    const nextIdx = (modalIndex + 1) % gallery.length;
    startSlideTo(nextIdx, 1);
  };

  useEffect(() => {
    if (!modalOpen) return;

    const onKeyDown = (e) => {
      if (e.key === "Escape") closeModal();
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "ArrowRight") goNext();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalOpen, modalIndex, gallery.length, animating]);

  const onModalTouchStart = (e) => {
    touchStartXRef.current = e.touches?.[0]?.clientX ?? null;
  };

  const onModalTouchEnd = (e) => {
    const startX = touchStartXRef.current;
    const endX = e.changedTouches?.[0]?.clientX ?? null;
    touchStartXRef.current = null;

    if (startX == null || endX == null) return;
    const dx = endX - startX;
    if (Math.abs(dx) < SWIPE_PX) return;

    if (dx > 0) goPrev();
    else goNext();
  };

  // --- Camera helpers ---
  const stopCamera = () => {
    const stream = streamRef.current;
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setIsCameraOn(false);
  };

  const startCamera = async (mode) => {
    setBusy(true);
    setMessage("");
    try {
      stopCamera();

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: mode } },
      });

      streamRef.current = stream;

      const video = videoRef.current;
      if (!video) throw new Error("Missing <video> element");

      video.srcObject = stream;
      await video.play();

      setIsCameraOn(true);
      setMessage("Camera ready ✅");
    } catch (err) {
      console.error(err);
      setIsCameraOn(false);
      setMessage("Couldn’t start camera. Use the fallback button or check permissions.");
    } finally {
      setBusy(false);
    }
  };

  const setPending = (blob, source) => {
    if (pendingUrl) URL.revokeObjectURL(pendingUrl);
    const url = URL.createObjectURL(blob);
    setPendingBlob(blob);
    setPendingUrl(url);
    setPendingSource(source);
  };

  const clearPending = () => {
    if (pendingUrl) URL.revokeObjectURL(pendingUrl);
    setPendingBlob(null);
    setPendingUrl("");
    setPendingSource("");
  };

  useEffect(() => {
    const desktop = isProbablyDesktop();
    setIsDesktop(desktop);

    const initialMode = desktop ? "user" : "environment";
    setFacingMode(initialMode);

    if (navigator?.mediaDevices?.getUserMedia) {
      startCamera(initialMode);
    } else {
      setMessage("Live camera preview not supported. Use the fallback Open gallery.");
    }

    return () => {
      stopCamera();
      if (pendingUrl) URL.revokeObjectURL(pendingUrl);
      if (animTimerRef.current) clearTimeout(animTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const switchCamera = async () => {
    const next = facingMode === "environment" ? "user" : "environment";
    setFacingMode(next);
    await startCamera(next);
  };

  const snap = async () => {
    if (limitReached) {
      setMessage(`Upload limit reached (${uploadLimit}). Resets in ${resetInHuman}. 💛`);
      return;
    }

    if (!videoRef.current || !canvasRef.current) return;

    setBusy(true);
    setMessage("");

    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");

      const w = video.videoWidth || 1280;
      const h = video.videoHeight || 720;

      canvas.width = w;
      canvas.height = h;

      if (facingMode === "user" && !isDesktop) {
        ctx.save();
        ctx.scale(-1, 1);
        ctx.drawImage(video, -w, 0, w, h);
        ctx.restore();
      } else {
        ctx.drawImage(video, 0, 0, w, h);
      }

      let blob = await canvasToJpegBlob(canvas, 0.82);
      if (!blob) throw new Error("Failed to encode image.");

      if (blob.size > MAX_BYTES) {
        blob = await canvasToJpegBlob(canvas, 0.65);
        if (!blob) throw new Error("Failed to encode image.");
      }

      setPending(blob, "camera");
      setMessage(`Ready to upload ${bytesToHuman(blob.size)} 📸`);
    } catch (err) {
      console.error(err);
      setMessage("Capture failed. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const retake = () => {
    clearPending();
    setMessage("Retake when you’re ready ✨");
    videoRef.current?.play?.();
  };

  const onFallbackFile = async (e) => {
    if (limitReached) {
      setMessage(`Upload limit reached (${uploadLimit}). Resets in ${resetInHuman}. 💛`);
      e.target.value = "";
      return;
    }

    const file = e.target.files?.[0];
    if (!file) return;

    setBusy(true);
    setMessage("");

    try {
      const blob = await fileToResizedJpegBlob(file);
      setPending(blob, "fallback");
      setMessage(`Ready to upload ${bytesToHuman(blob.size)} ✅`);
    } catch (err) {
      console.error(err);
      setMessage("Could not resize that image. Try another one.");
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  };

  const uploadPending = async () => {
    if (!eventId) {
      setMessage("Missing event id in URL (?e=...).");
      return;
    }

    if (!isDriveConnected) {
      setMessage("Drive not connected yet. The event owner must connect Google Drive first.");
      return;
    }

    if (limitReached) {
      setMessage(`Upload limit reached (${uploadLimit}). Resets in ${resetInHuman}. 💛`);
      return;
    }

    if (!pendingBlob) {
      setMessage("No photo to upload yet. Snap or pick one first 🙂");
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      const deviceId = getOrCreateDeviceId();

      const form = new FormData();
      form.append("file", pendingBlob, `snap-${Date.now()}.jpg`);

      const r = await fetch(`${API_BASE}/events/${eventId}/upload`, {
        method: "POST",
        headers: { "X-Device-Id": deviceId },
        body: form,
      });

      const j = await r.json().catch(() => ({}));

      if (!r.ok || !j?.ok) {
        if (j?.connectUrl) {
          setIsDriveConnected(false);
          throw new Error(`${j.error}\nConnect here: ${j.connectUrl}`);
        }
        throw new Error(j?.error || `Upload failed (${r.status})`);
      }

      const serverUrl = j.url || `${API_BASE}/events/${eventId}/files/${j.driveFileId}`;
      const driveFileId = j.driveFileId || crypto.randomUUID();

      setGallery((prev) => [
        {
          id: driveFileId,
          url: serverUrl,
          sizeBytes: pendingBlob.size,
          source: pendingSource || "upload",
        },
        ...prev,
      ]);

      setUploadState((s) => ({ ...s, count: s.count + 1 }));

      if (pendingUrl) URL.revokeObjectURL(pendingUrl);
      setPendingBlob(null);
      setPendingUrl("");
      setPendingSource("");

      setMessage("Uploaded ✅");
    } catch (err) {
      console.error(err);
      setMessage(err.message || "Upload failed. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const resetUploadLimit = () => {
    const now = Date.now();
    setUploadState({ count: 0, startedAt: now });
    setMessage("Upload limit reset (testing) ✅");
  };

  const canSnap = isCameraOn && !pendingUrl && !busy && !limitReached;
  const hasPending = !!pendingBlob && !limitReached;

  const current = modalOpen ? gallery[modalIndex] : null;
  const previous = prevIndex >= 0 && prevIndex < gallery.length ? gallery[prevIndex] : null;

  return (
    <div className="app">
      <header className="header">
        <div className="badge">📸</div>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div>
              <h1>Wedding Snaps{eventName ? ` — ${eventName}` : ""}</h1>
              <p className="hint">
                Welcome to our wedding! Share special moments with us through your lens. Snap a selfie,
                a candid of your seatmate, or a shot of us — every perspective is precious.
              </p>
            </div>

          </div>

          <p className="hint small" style={{ marginTop: 6, opacity: 0.8 }}>
            Event: {eventId || "none"} • API: {API_BASE}
          </p>

          <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <span
              style={{
                fontSize: 12,
                padding: "6px 10px",
                borderRadius: 999,
                border: "1px solid var(--border)",
                background: isDriveConnected ? "rgba(16,185,129,0.10)" : "rgba(239,68,68,0.10)",
                fontWeight: 800,
              }}
            >
              {isDriveConnected ? "Drive connected ✅" : "Drive not connected"}
            </span>

            {!isDriveConnected && eventId && (
              <a
                href={connectUrl}
                style={{
                  fontSize: 12,
                  padding: "6px 10px",
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                  background: "rgba(0,0,0,0.04)",
                  textDecoration: "none",
                  color: "inherit",
                  fontWeight: 800,
                }}
              >
                Connect Google Drive
              </a>
            )}
          </div>
        </div>
      </header>

      <main className="main">
        <div
          className="uploadLimit"
          role="status"
          aria-live="polite"
          style={{
            marginTop: 12,
            borderRadius: 14,
            padding: "12px 12px",
            border: "1px solid var(--border)",
            background: limitReached ? "rgba(239, 68, 68, 0.10)" : "rgba(16, 185, 129, 0.10)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            fontWeight: 900,
          }}
        >
          <span style={{ fontSize: 14 }}>
            Uploads: {uploadCount} / {uploadLimit}
          </span>

          <span style={{ fontSize: 12, opacity: 0.8 }}>Resets in {resetInHuman}</span>

          <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 14, opacity: 0.85 }}>{limitReached ? "Limit reached" : `${uploadsLeft} left`}</span>

            <button
              type="button"
              onClick={resetUploadLimit}
              disabled={busy}
              style={{
                fontSize: 12,
                padding: "6px 8px",
                borderRadius: 10,
                border: "1px solid var(--border)",
                background: "rgba(0,0,0,0.04)",
                cursor: busy ? "not-allowed" : "pointer",
              }}
              title="Testing: reset upload limit"
              aria-label="Reset upload limit (testing)"
            >
              reset
            </button>
          </span>
        </div>

        <section className={`stage ${facingMode === "user" && !isDesktop ? "mirror" : ""}`} aria-label="Camera stage">
          <video ref={videoRef} className={pendingUrl ? "hidden" : ""} playsInline autoPlay muted />
          <img src={pendingUrl || ""} className={!pendingUrl ? "hidden" : ""} alt="Pending preview" />
          <canvas ref={canvasRef} className="hidden" />
        </section>

        <div className="controlsGrid">
          <div className="controlsGroup">
            <button onClick={switchCamera} disabled={busy || isDesktop}>
              🔁 Switch
            </button>
            <button onClick={snap} disabled={!canSnap}>
              📷 Snap
            </button>
          </div>

          <div className="controlsGroup">
            <button
              onClick={uploadPending}
              disabled={busy || !hasPending || !isDriveConnected}
              title={!isDriveConnected ? "Event owner must connect Drive first" : "Upload"}
            >
              ⬆️ Upload
            </button>
            <button onClick={retake} disabled={busy || !pendingBlob}>
              ♻️ Retake
            </button>
          </div>
        </div>

        <div className="fallbackRow">
          <input
            id="fileInput"
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={onFallbackFile}
            disabled={limitReached}
          />
          <label
            className={`button ${busy || limitReached ? "disabled" : ""}`}
            htmlFor="fileInput"
            aria-disabled={busy || limitReached}
            title={limitReached ? "Upload limit reached" : "Pick a photo"}
          >
            📷 Open gallery
          </label>
          <span className="hint small">
            {limitReached
              ? `Limit reached — thanks for uploading ${uploadLimit}! 💛 (Resets in ${resetInHuman})`
              : "Already took a photo? Upload one from your gallery here!"}
          </span>
        </div>

        <div className="msg" role="status" aria-live="polite">
          {busy ? "Working…" : message}
        </div>

        <section className="gallery" aria-label="Gallery">
          {gallery.map((it) => (
            <figure className="tile" key={it.id}>
              <button className="thumb" type="button" onClick={() => openCarouselAt(it.id)} aria-label="Open carousel">
                <img src={it.url} alt="Wedding snap" loading="lazy" />
              </button>
              <figcaption>
                <span>{it.source === "camera" ? "Live cam" : it.source === "fallback" ? "Fallback" : "Uploaded"}</span>
                <span>{it.sizeBytes ? bytesToHuman(it.sizeBytes) : ""}</span>
              </figcaption>
            </figure>
          ))}
        </section>
      </main>

      <footer className="footer">
        <small>Tip: If you see a black screen, ensure HTTPS and grant camera permission.</small>
      </footer>

      {modalOpen && current && (
        <div className="modalOverlay" role="dialog" aria-modal="true" onClick={closeModal}>
          <div
            className="modalBody"
            onClick={(e) => e.stopPropagation()}
            onTouchStart={onModalTouchStart}
            onTouchEnd={onModalTouchEnd}
          >
            <button className="modalClose" type="button" onClick={closeModal} aria-label="Close">
              ✕
            </button>

            <button className="modalArrow left" type="button" onClick={goPrev} aria-label="Previous" disabled={animating}>
              ‹
            </button>
            <button className="modalArrow right" type="button" onClick={goNext} aria-label="Next" disabled={animating}>
              ›
            </button>

            <div className={`carouselViewport ${animating ? "animating" : ""}`}>
              {previous && animating && (
                <div className={`carouselSlide outgoing ${slideDir === 1 ? "toLeft" : "toRight"}`}>
                  <img className="modalImg" src={previous.url} alt="Previous" />
                </div>
              )}

              <div
                className={`carouselSlide incoming ${
                  animating ? (slideDir === 1 ? "fromRight" : "fromLeft") : "center"
                }`}
              >
                <img className="modalImg" src={current.url} alt="Preview" />
              </div>
            </div>

            <div className="modalCounter">
              {modalIndex + 1} / {gallery.length}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [route, setRoute] = useState(() => (isCreateRoute() ? "create" : "event"));
  const [eventId, setEventId] = useState(() => getEventIdFromUrl());

  useEffect(() => {
    const sync = () => {
      setRoute(isCreateRoute() ? "create" : "event");
      setEventId(getEventIdFromUrl());
    };
    window.addEventListener("hashchange", sync);
    window.addEventListener("popstate", sync);

    // if you change search params via location.href, popstate may not fire in all cases,
    // so we also sync once on mount.
    sync();

    return () => {
      window.removeEventListener("hashchange", sync);
      window.removeEventListener("popstate", sync);
    };
  }, []);

  // 1) Create route always wins
  if (route === "create") return <CreateEventPage />;

  // 2) No ?e= in URL -> Landing page (NO camera, NO gallery)
  if (!eventId) {
    return (
      <div className="app">
        <header className="header">
          <div className="badge">📸</div>
          <div style={{ flex: 1 }}>
            <h1>Wedding Snaps</h1>
            <p className="hint">
              Create an event first, then share the link/QR code with guests so they can upload photos.
            </p>

            <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button type="button" onClick={goCreateRoute} className="ghostBtn">
                ➕ Create event
              </button>
            </div>
          </div>
        </header>

        <main className="main">
          <div className="formCard" style={{ marginTop: 12 }}>
            <div className="hint">
              If you already have an event link, open it directly (it will look like <b>/?e=EVENT_ID</b>).
            </div>
          </div>
        </main>

        <footer className="footer">
          <small>Tip: Once you have the link, print the QR code and place it on tables.</small>
        </footer>
      </div>
    );
  }

  // 3) Has ?e= -> show event experience (camera + grid)
  return <EventApp key={eventId} />;
}
