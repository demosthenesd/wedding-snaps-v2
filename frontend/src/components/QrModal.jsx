import { useEffect, useRef } from "react";
import { useToast } from "./Toast";

export default function QrModal({ url, onClose }) {
  const canvasRef = useRef(null);
  const { addToast } = useToast();

  useEffect(() => {
    let isActive = true;
    const draw = async () => {
      if (!canvasRef.current) return;
      try {
        const { default: QRCode } = await import("qrcode");
        if (!isActive || !canvasRef.current) return;
        QRCode.toCanvas(canvasRef.current, url, {
          width: 200,
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
  }, [url]);

  const copy = async () => {
    await navigator.clipboard.writeText(url);
    addToast("Link copied");
  };

  return (
    <div className="qrModal">
      <div className="qrCard panel-card">
        <div className="qrHeader">
          <p className="qrEyebrow eyebrow">Share the moment</p>
          <h3 className="qrTitle">Invite your guests</h3>
          <p className="qrSubtitle">
            Scan or share the link so everyone can upload to your wedding stream.
          </p>
        </div>

        <div className="qrCanvasWrap">
          <canvas ref={canvasRef} />
        </div>

        <p className="qrUrl">{url}</p>

        <div className="qrActions">
          <button className="pill-btn" onClick={copy} type="button">
            Copy link
          </button>
          <a className="pill-btn secondary" href={url}>
            Open gallery
          </a>
          <button className="pill-btn secondary" onClick={onClose} type="button">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
