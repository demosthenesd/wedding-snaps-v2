import { useEffect, useRef, useState } from "react";
import "./styles.css";

const MAX_BYTES = 100_000;
const MAX_DIM = 1600;
const SWIPE_PX = 40;
const SLIDE_MS = 260;

// ✅ Upload limit (per device) — EXPIRING (e.g. ~1 day)
const UPLOAD_LIMIT = 4;

// 🔁 Expiring counter storage (localStorage still, but auto-resets after TTL)
const UPLOAD_LIMIT_STATE_KEY = "wedding_snaps_upload_limit_state_v2";
const UPLOAD_LIMIT_TTL_MS = 24 * 60 * 60 * 1000; // 1 day

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
// Expiring upload counter helpers
// ---------------------------
function safeJsonParse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function readUploadLimitState() {
  const raw = localStorage.getItem(UPLOAD_LIMIT_STATE_KEY);
  const parsed = raw ? safeJsonParse(raw) : null;

  const now = Date.now();
  const startedAt = Number(parsed?.startedAt);
  const count = Number(parsed?.count);

  // If missing/corrupt/expired -> reset
  if (!Number.isFinite(startedAt) || !Number.isFinite(count) || count < 0) {
    return { count: 0, startedAt: now };
  }
  if (now - startedAt >= UPLOAD_LIMIT_TTL_MS) {
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

export default function App() {
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

  // Uploaded (local UI gallery)
  const [gallery, setGallery] = useState([]); // {id,url,sizeBytes,source}

  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  // ✅ Expiring upload limit state
  const [{ count: uploadCount, startedAt }, setUploadState] = useState(() => readUploadLimitState());

  // Persist + enforce expiry whenever state changes
  useEffect(() => {
    writeUploadLimitState({ count: uploadCount, startedAt });
  }, [uploadCount, startedAt]);

  // Auto-expire while page is open (so it resets without refresh)
  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      if (now - startedAt >= UPLOAD_LIMIT_TTL_MS) {
        setUploadState({ count: 0, startedAt: now });
        setMessage("Upload limit reset ✅");
      }
    };

    const id = setInterval(tick, 30_000); // check every 30s
    return () => clearInterval(id);
  }, [startedAt]);

  const uploadsLeft = Math.max(0, UPLOAD_LIMIT - uploadCount);
  const limitReached = uploadCount >= UPLOAD_LIMIT;

  const resetInMs = Math.max(0, UPLOAD_LIMIT_TTL_MS - (Date.now() - startedAt));
  const resetInHuman = msToHuman(resetInMs);

  // ✅ Carousel modal state
  const [modalIndex, setModalIndex] = useState(-1); // current
  const [prevIndex, setPrevIndex] = useState(-1); // previous (for animation layer)
  const [slideDir, setSlideDir] = useState(0); // -1 prev, +1 next
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

  // Escape + arrows
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
      setMessage("Live camera preview not supported. Use the fallback Open Camera.");
    }

    return () => {
      stopCamera();
      if (pendingUrl) URL.revokeObjectURL(pendingUrl);
      gallery.forEach((g) => URL.revokeObjectURL(g.url));
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
      setMessage(`Upload limit reached (${UPLOAD_LIMIT}). Resets in ${resetInHuman}. 💛`);
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
      setMessage(`Upload limit reached (${UPLOAD_LIMIT}). Resets in ${resetInHuman}. 💛`);
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
    if (limitReached) {
      setMessage(`Upload limit reached (${UPLOAD_LIMIT}). Resets in ${resetInHuman}. 💛`);
      return;
    }

    if (!pendingBlob) {
      setMessage("No photo to upload yet. Snap or pick one first 🙂");
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      // TODO: replace this stub with your real upload endpoint
      await new Promise((r) => setTimeout(r, 600));

      const uploadedUrl = pendingUrl;
      const sizeBytes = pendingBlob.size;
      const source = pendingSource || "unknown";

      setGallery((prev) => [
        { id: crypto.randomUUID(), url: uploadedUrl, sizeBytes, source },
        ...prev,
      ]);

      // ✅ consume one upload slot (within the current TTL window)
      setUploadState((s) => ({ ...s, count: s.count + 1 }));

      setPendingBlob(null);
      setPendingUrl("");
      setPendingSource("");

      setMessage("Uploaded ✅");
    } catch (err) {
      console.error(err);
      setMessage("Upload failed. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  // ✅ Small reset button (testing)
  const resetUploadLimit = () => {
    const now = Date.now();
    // reset counter window + count
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
        <div>
          <h1>Wedding Snaps</h1>
          <p className="hint">
            Welcome to our wedding! Share special moments with us through your lens. Snap a selfie,
            a candid of your seatmate, or a shot of us — every perspective is precious.
          </p>
        </div>
      </header>

      <main className="main">
        {/* ✅ Big upload limit counter */}
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
            Uploads: {uploadCount} / {UPLOAD_LIMIT}
          </span>

          <span style={{ fontSize: 12, opacity: 0.8 }}>
            Resets in {resetInHuman}
          </span>

          <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 14, opacity: 0.85 }}>
              {limitReached ? "Limit reached" : `${uploadsLeft} left`}
            </span>

            {/* 🧪 small reset button for testing */}
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

        <section
          className={`stage ${facingMode === "user" && !isDesktop ? "mirror" : ""}`}
          aria-label="Camera stage"
        >
          <video ref={videoRef} className={pendingUrl ? "hidden" : ""} playsInline autoPlay muted />
          <img
            src={pendingUrl || ""}
            className={!pendingUrl ? "hidden" : ""}
            alt="Pending preview"
          />
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
            <button onClick={uploadPending} disabled={busy || !hasPending}>
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
              ? `Limit reached — thanks for uploading ${UPLOAD_LIMIT}! 💛 (Resets in ${resetInHuman})`
              : "Already took a photo? Upload one from your gallery here!"}
          </span>
        </div>

        <div className="msg" role="status" aria-live="polite">
          {busy ? "Working…" : message}
        </div>

        {/* ✅ Gallery grid kept EXACTLY as you had it */}
        <section className="gallery" aria-label="Gallery">
          {gallery.map((it) => (
            <figure className="tile" key={it.id}>
              <button
                className="thumb"
                type="button"
                onClick={() => openCarouselAt(it.id)}
                aria-label="Open carousel"
              >
                <img src={it.url} alt="Wedding snap" />
              </button>
              <figcaption>
                <span>{it.source === "camera" ? "Live cam" : "Fallback"}</span>
                <span>{bytesToHuman(it.sizeBytes)}</span>
              </figcaption>
            </figure>
          ))}
        </section>
      </main>

      <footer className="footer">
        <small>Tip: If you see a black screen, ensure HTTPS and grant camera permission.</small>
      </footer>

      {/* ✅ iOS-style slide carousel modal */}
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

            <button
              className="modalArrow left"
              type="button"
              onClick={goPrev}
              aria-label="Previous"
              disabled={animating}
            >
              ‹
            </button>
            <button
              className="modalArrow right"
              type="button"
              onClick={goNext}
              aria-label="Next"
              disabled={animating}
            >
              ›
            </button>

            <div className={`carouselViewport ${animating ? "animating" : ""}`}>
              {/* outgoing layer */}
              {previous && animating && (
                <div className={`carouselSlide outgoing ${slideDir === 1 ? "toLeft" : "toRight"}`}>
                  <img className="modalImg" src={previous.url} alt="Previous" />
                </div>
              )}

              {/* incoming/current layer */}
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
