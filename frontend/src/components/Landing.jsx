import { useState } from "react";
import QrModal from "./QrModal";

const API_BASE =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ||
  "http://localhost:8080";

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
      <div style={{ padding: 32, textAlign: "center" }}>
        <h2 style={{ marginBottom: 16 }}>Create Wedding Event</h2>

        <input
          type="text"
          placeholder="Event name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ width: "100%", marginBottom: 12 }}
        />

        <input
          type="text"
          placeholder="Google Drive folder ID"
          value={driveId}
          onChange={(e) => setDriveId(e.target.value)}
          style={{ width: "100%", marginBottom: 12 }}
        />

        {error && (
          <p style={{ color: "crimson", fontSize: 12 }}>{error}</p>
        )}

        <button
          onClick={createEvent}
          disabled={!name || !driveId || busy}
          style={{ width: "100%", marginTop: 12 }}
        >
          {busy ? "Creating…" : "Create Event"}
        </button>

        {connectUrl && (
          <a
            href={connectUrl}
            target="_blank"
            rel="noreferrer"
            style={{ display: "block", marginTop: 12 }}
          >
            Connect Google Drive
          </a>
        )}
      </div>

      {publicUrl && (
        <QrModal url={publicUrl} onClose={() => setPublicUrl(null)} />
      )}
    </>
  );
}
