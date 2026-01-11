import { useEffect, useRef } from "react";
import QRCode from "qrcode";

export default function QrModal({ url, onClose }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, url, {
        width: 200,
        margin: 1,
      });
    }
  }, [url]);

  const copy = async () => {
    await navigator.clipboard.writeText(url);
    alert("Link copied!");
  };

  return (
    <div className="qrModal">
      <div className="qrCard">
        <div className="qrHeader">
          <p className="qrEyebrow">Share the moment</p>
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
