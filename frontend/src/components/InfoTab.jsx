import { useEffect, useRef, useState } from "react";
import { useToast } from "./Toast";

export default function InfoTab({
  eventId,
  publicUrl,
  uploaderName,
  identityChoice,
  onSaveName,
  onGoAnonymous,
}) {
  const canvasRef = useRef(null);
  const [nameDraft, setNameDraft] = useState(uploaderName || "");
  const { addToast } = useToast();

  useEffect(() => {
    setNameDraft(uploaderName || "");
  }, [uploaderName]);

  useEffect(() => {
    let isActive = true;
    const draw = async () => {
      if (!canvasRef.current || !publicUrl) return;
      try {
        const { default: QRCode } = await import("qrcode");
        if (!isActive || !canvasRef.current) return;
        QRCode.toCanvas(canvasRef.current, publicUrl, {
          width: 220,
          margin: 1,
        });
      } catch (err) {
        console.error("QR render failed:", err);
      }
    };
    draw();
    return () => {
      isActive = false;
    };
  }, [publicUrl]);

  const copy = async () => {
    if (!publicUrl) return;
    await navigator.clipboard.writeText(publicUrl);
    addToast("Link copied", { variant: "success" });
  };

  if (!eventId) {
    return (
      <div className="info-wrap">
        <section className="panel-card">
          <p className="landing-subtitle">No event selected.</p>
        </section>
      </div>
    );
  }

  const displayName = identityChoice === "named" ? uploaderName : "Anonymous";
  const anonymousHint =
    identityChoice === "anonymous" && uploaderName ? ` (${uploaderName})` : "";

  return (
    <div className="info-wrap">
      <div className="info-header">
        <h3 className="landing-title info-title">Share and identity</h3>
        <p className="landing-subtitle">
          Don't be shy! Let everyone know who captured those beautiful moments.
        </p>
      </div>

      <div className="info-grid">
        <section className="panel-card info-section info-identity">
          <p className="landing-subtitle">
            Current: <strong>{displayName}</strong>
            {anonymousHint}
          </p>

          <div className="info-name">
            <label className="landing-field">
              <span>Update your name</span>
              <input
                type="text"
                value={nameDraft}
                placeholder="Your name"
                onChange={(e) => setNameDraft(e.target.value)}
              />
            </label>
          </div>

          <div className="info-actions info-actions-row">
            <button
              className="pill-btn"
              type="button"
              onClick={() => {
                const ok = onSaveName?.(nameDraft);
                if (ok === false) {
                  addToast("Enter a name first", { variant: "warning" });
                  return;
                }
                addToast("Name updated", { variant: "success" });
              }}
              disabled={!nameDraft.trim()}
            >
              Save name
            </button>
            <button
              className="pill-btn secondary"
              type="button"
              onClick={() => {
                onGoAnonymous?.();
                addToast("Now uploading anonymously", { variant: "success" });
              }}
            >
              Go anonymous
            </button>
          </div>
        </section>

        <section className="panel-card info-section info-share">
          <p className="eyebrow">Share gallery</p>
          <p className="landing-subtitle">
            Let guests scan the code or copy the link to upload their photos.
          </p>
          <div className="info-qr">
            <div className="qrCanvasWrap">
              <canvas ref={canvasRef} />
            </div>
            <div className="info-actions">
              <button className="pill-btn" onClick={copy} type="button">
                Copy link
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
