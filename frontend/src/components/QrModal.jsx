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
        <h3 className="qrTitle">Invite your guests</h3>

        <canvas ref={canvasRef} />

        <p className="qrUrl">{url}</p>

        <div className="qrActions">
          <button onClick={copy}>Copy link</button>
          <a href={url}>Open gallery</a>
          <button className="secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
