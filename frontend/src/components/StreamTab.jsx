import { useEffect, useState } from "react";

const API_BASE =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ||
  "http://localhost:8080";

export default function StreamTab({ eventId, isActive }) {
  const [allUploads, setAllUploads] = useState([]);
  const [hasNewUploads, setHasNewUploads] = useState(false);
  const [latestSeenAt, setLatestSeenAt] = useState(null);
  const [latestCount, setLatestCount] = useState(0);
  const [streamLoaded, setStreamLoaded] = useState(false);
  const [activeTimeId, setActiveTimeId] = useState(null);

  const fetchAll = async () => {
    const r = await fetch(`${API_BASE}/events/${eventId}/uploads?limit=100`);
    const d = await r.json();
    if (d.ok) {
      setAllUploads(d.items);
      setStreamLoaded(true);
      const newest = d.items?.[0]?.createdAt;
      setLatestSeenAt(newest ? Date.parse(newest) : null);
      setLatestCount(d.items?.length || 0);
      setHasNewUploads(false);
    }
  };

  useEffect(() => {
    if (!isActive) return;
    if (!streamLoaded) {
      fetchAll();
    }
  }, [eventId, isActive, streamLoaded]);

  const checkForNewUploads = async () => {
    if (!streamLoaded) return;
    try {
      const r = await fetch(`${API_BASE}/events/${eventId}/uploads?limit=100`);
      const d = await r.json();
      if (!d.ok) return;
      const newest = d.items?.[0]?.createdAt;
      if (!newest) return;
      const newestTime = Date.parse(newest);
      const nextCount = d.items?.length || 0;
      if (
        latestSeenAt === null ||
        newestTime > latestSeenAt ||
        nextCount !== latestCount
      ) {
        setHasNewUploads(true);
      }
    } catch {
      // Ignore check errors to avoid user disruption.
    }
  };

  useEffect(() => {
    if (!isActive) return;
    checkForNewUploads();

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        checkForNewUploads();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibility);
  }, [isActive, latestSeenAt, latestCount, streamLoaded, eventId]);

  return (
    <div style={{ padding: 20 }}>
      {hasNewUploads && (
        <div className="stream-notice">
          <span>New changes in the stream. Tap refresh to update.</span>
          <button type="button" onClick={fetchAll}>
            Refresh
          </button>
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {allUploads.map((photo) => {
          const showTime = activeTimeId === photo.id;
          return (
            <div
              key={photo.id}
              style={{
                background: "white",
                borderRadius: 20,
                overflow: "hidden",
                border: "1px solid var(--border)",
              }}
            >
              <div
                className={`stream-photo${showTime ? " show-time" : ""}`}
                role="button"
                tabIndex={0}
                onClick={() =>
                  setActiveTimeId((prev) =>
                    prev === photo.id ? null : photo.id
                  )
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setActiveTimeId((prev) =>
                      prev === photo.id ? null : photo.id
                    );
                  }
                }}
              >
                {photo.createdAt && (
                  <div className="photo-time-pill">
                    {new Date(photo.createdAt).toLocaleString([], {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                      hour12: true,
                    })}
                  </div>
                )}
                <img
                  src={photo.url}
                  alt=""
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    display: "block",
                  }}
                />
              </div>
              {photo.uploaderName && (
                <div className="photo-meta">
                  <span className="photo-name">{photo.uploaderName}</span>
                  <span className="photo-label">uploaded</span>
                </div>
              )}
              {photo.comment && (
                <div className="photo-comment">{photo.comment}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
