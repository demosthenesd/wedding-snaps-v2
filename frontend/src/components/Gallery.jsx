import { useEffect, useState } from "react";
import PersonalTab from "./PersonalTab";
import StreamTab from "./StreamTab";

const API_BASE = "https://candidsnaps.onrender.com";

function buildGuestName() {
  const id = crypto.randomUUID().slice(0, 6).toUpperCase();
  return `Guest ${id}`;
}

export default function Gallery({ eventId }) {
  const [tab, setTab] = useState("personal");
  const [uploadLimit, setUploadLimit] = useState(4);
  const [isDriveConnected, setIsDriveConnected] = useState(false);
  const [isOwnerConnected, setIsOwnerConnected] = useState(false);
  const [showIdentityModal, setShowIdentityModal] = useState(false);
  const [showNameEntry, setShowNameEntry] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [uploaderName, setUploaderName] = useState("");

  const connectUrl = `${API_BASE}/auth/google/start?eventId=${eventId}`;
  const choiceKey = `wedding_snaps_identity_choice_${eventId}`;
  const nameKey = "wedding_snaps_uploader_name";

  /* ---------- Fetch config ---------- */
  useEffect(() => {
    fetch(`${API_BASE}/events/${eventId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) {
          setUploadLimit(d.uploadLimit);
          setIsDriveConnected(d.isDriveConnected);
          setIsOwnerConnected(!!d.isOwnerConnected);
        }
      });
  }, [eventId]);

  useEffect(() => {
    if (!eventId) return;
    const choice = localStorage.getItem(choiceKey);
    const storedName = localStorage.getItem(nameKey);
    if (storedName) setUploaderName(storedName);
    if (choice === "anonymous" && !storedName) {
      const guestName = buildGuestName();
      localStorage.setItem(nameKey, guestName);
      setUploaderName(guestName);
    }
    if (!choice) setShowIdentityModal(true);
  }, [eventId, choiceKey, nameKey]);

  const chooseAnonymous = () => {
    const guestName = buildGuestName();
    localStorage.setItem(nameKey, guestName);
    setUploaderName(guestName);
    localStorage.setItem(choiceKey, "anonymous");
    setShowIdentityModal(false);
    setShowNameEntry(false);
  };

  const openNameEntry = () => {
    setShowNameEntry(true);
  };

  const saveName = () => {
    const nextName = nameInput.trim().slice(0, 40);
    if (!nextName) return;
    localStorage.setItem(nameKey, nextName);
    localStorage.setItem(choiceKey, "named");
    setUploaderName(nextName);
    setShowIdentityModal(false);
    setShowNameEntry(false);
  };

  return (
    <div className="gallery">
      {showIdentityModal && (
        <div className="identity-modal">
          <div className="identity-card">
            {!isOwnerConnected ? (
              <>
                <h3 className="identity-title">
                  Connect Google Drive to start collecting guest photos.
                </h3>
                <div className="identity-actions">
                  <a href={connectUrl} className="pill-btn">
                    Connect Google Drive
                  </a>
                </div>
              </>
            ) : (
              <>
                <h3 className="identity-title">
                  Want to add your name to your uploads?
                </h3>

                {!showNameEntry && (
                  <div className="identity-actions">
                    <button
                      className="pill-btn"
                      onClick={openNameEntry}
                      type="button"
                    >
                      Add my name
                    </button>
                    <button
                      className="pill-btn secondary"
                      onClick={chooseAnonymous}
                      type="button"
                    >
                      Continue anonymously
                    </button>
                  </div>
                )}

                {showNameEntry && (
                  <div className="identity-entry">
                    <input
                      type="text"
                      placeholder="Your name"
                      value={nameInput}
                      onChange={(e) => setNameInput(e.target.value)}
                    />
                    <div className="identity-actions">
                      <button
                        className="pill-btn"
                        onClick={saveName}
                        type="button"
                      >
                        Continue
                      </button>
                      <button
                        className="pill-btn secondary"
                        onClick={chooseAnonymous}
                        type="button"
                      >
                        Skip
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="tabs">
        <button
          className={`tab ${tab === "personal" ? "active" : ""}`}
          onClick={() => setTab("personal")}
        >
          MY SNAPS
          {tab === "personal" && <span className="tab-underline" />}
        </button>

        <button
          className={`tab ${tab === "stream" ? "active" : ""}`}
          onClick={() => setTab("stream")}
        >
          WEDDING STREAM
          {tab === "stream" && <span className="tab-underline" />}
        </button>
      </div>
      {!isDriveConnected && (
        <div className="connect">
          <a href={connectUrl} className="pill-btn">
            Connect Google Drive
          </a>
        </div>
      )}

      {tab === "personal" && isDriveConnected && (
        <PersonalTab
          eventId={eventId}
          uploadLimit={uploadLimit}
          uploaderName={uploaderName}
        />
      )}

      {tab === "stream" && <StreamTab eventId={eventId} isActive />}
    </div>
  );
}
