import { useState } from "react";
import QrModal from "./QrModal";

const API_BASE =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ||
  "https://candidsnaps.netlify.app";

export default function Landing() {
  const [name, setName] = useState("");
  const [driveId, setDriveId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [publicUrl, setPublicUrl] = useState(null);
  const [connectUrl, setConnectUrl] = useState(null);

  const createEvent = async () => {
    setBusy(true);
    setError("");

    try {
      const res = await fetch(`${API_BASE}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          driveFolderId: driveId,
        }),
      });

      const data = await res.json();
      if (!data.ok) {
        setError(data.error || "Failed to create event");
        return;
      }

      setPublicUrl(data.publicUrl);
      setConnectUrl(data.connectUrl);
    } catch (e) {
      console.error(e);
      setError("Network error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="landing">
        <section className="landing-card panel-card">
          <div className="landing-header">
            <p className="landing-eyebrow eyebrow">Create event</p>
            <h2 className="landing-title">Capture your behind-the-scenes!</h2>
            <p className="landing-subtitle">
              Set up a shared gallery and invite guests to upload their favorite
              moments.
            </p>
          </div>

          <div className="landing-form">
            <label className="landing-field">
              <span>Event name</span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>

            <label className="landing-field">
              <span>Google Drive folder ID</span>
              <input
                type="text"
                value={driveId}
                onChange={(e) => setDriveId(e.target.value)}
              />
            </label>

            {error && <p className="landing-error">{error}</p>}

            <button
              className="pill-btn landing-primary"
              onClick={createEvent}
              disabled={!name || !driveId || busy}
              type="button"
            >
              {busy ? "Creating..." : "Create Event"}
            </button>

            {connectUrl && (
              <a
                href={connectUrl}
                target="_blank"
                rel="noreferrer"
                className="pill-btn secondary landing-link"
              >
                Connect Google Drive
              </a>
            )}
          </div>

          <p className="landing-note">
            Share the QR once your Drive is connected so guests can upload
            instantly.
          </p>
        </section>
      </div>

      {publicUrl && (
        <QrModal url={publicUrl} onClose={() => setPublicUrl(null)} />
      )}
    </>
  );
}
