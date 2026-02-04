import { useEffect, useRef, useState } from "react";

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
    alert("Link copied!");
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
      <section className="panel-card info-section">
        <p className="eyebrow">Share gallery</p>
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

      <section className="panel-card info-section">
        <p className="eyebrow">Uploader identity</p>
        <p className="landing-subtitle">
          Current: <strong>{displayName}</strong>
          {anonymousHint}
        </p>

        <div className="info-actions">
          <button
            className="pill-btn"
            type="button"
            onClick={() => onSaveName?.(nameDraft)}
            disabled={!nameDraft.trim()}
          >
            Save name
          </button>
          <button
            className="pill-btn secondary"
            type="button"
            onClick={onGoAnonymous}
          >
            Go anonymous
          </button>
        </div>
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
      </section>
    </div>
  );
}
