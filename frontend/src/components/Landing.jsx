import { useState } from "react";
import QrModal from "./QrModal";
import { API_BASE } from "../config";

export default function Landing() {
  const [name, setName] = useState("");
  const [driveId, setDriveId] = useState("");
  const [uploadLimit, setUploadLimit] = useState(4);
  const [adminCode, setAdminCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [publicUrl, setPublicUrl] = useState(null);
  const [connectUrl, setConnectUrl] = useState(null);
  const [gateOpen, setGateOpen] = useState(
    () => localStorage.getItem("wedding_snaps_admin_authed") !== "true",
  );
  const [gateCode, setGateCode] = useState("");
  const [gateError, setGateError] = useState("");

  const closeGate = () => {
    setGateCode("");
    setGateError("");
    setGateOpen(false);
  };

  const submitGate = async (e) => {
    e.preventDefault();
    const next = gateCode.trim();
    if (!next) return;

    try {
      const res = await fetch(`${API_BASE}/auth/admin-check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode: next }),
      });
      const data = await res.json();
      if (!data.ok) {
        setGateError(data.error || "Incorrect passcode.");
        return;
      }
      setGateError("");
      localStorage.setItem("wedding_snaps_admin_authed", "true");
      setAdminCode(next);
      setGateCode("");
      setGateOpen(false);
    } catch (err) {
      console.error(err);
      setGateError("Unable to verify passcode.");
    }
  };

  const createEvent = async () => {
    setBusy(true);
    setError("");

    try {
      if (!adminCode.trim()) {
        setError("Passcode required");
        return;
      }
      const res = await fetch(`${API_BASE}/events`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Code": adminCode.trim(),
        },
        body: JSON.stringify({
          name,
          driveFolderId: driveId,
          uploadLimit,
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
            <h2 className="landing-title">Create event</h2>
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

            <label className="landing-field">
              <span>Uploads per guest (4-10)</span>
              <input
                type="number"
                min={4}
                max={10}
                step={1}
                value={uploadLimit}
                onChange={(e) => {
                  const raw = Number(e.target.value);
                  const next = Number.isFinite(raw) ? raw : 4;
                  setUploadLimit(Math.min(10, Math.max(4, next)));
                }}
              />
            </label>

            {error && <p className="landing-error">{error}</p>}

            <button
              className="pill-btn landing-primary"
              onClick={createEvent}
              disabled={!name || !driveId || !adminCode || busy}
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

      {gateOpen && (
        <div className="identity-modal" role="presentation">
          <div
            className="identity-card"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <h3 className="identity-title">Admin passcode</h3>
            <form className="identity-entry" onSubmit={submitGate}>
              <input
                type="password"
                value={gateCode}
                onChange={(e) => setGateCode(e.target.value)}
                placeholder="Enter passcode"
              />
              {gateError && <p className="landing-error">{gateError}</p>}
              <div className="identity-actions">
                <button className="pill-btn" type="submit">
                  Continue
                </button>
                <button
                  className="pill-btn secondary"
                  type="button"
                  onClick={closeGate}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
