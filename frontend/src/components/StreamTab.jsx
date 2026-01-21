import { useEffect, useRef, useState } from "react";

const API_BASE = "https://candidsnaps.onrender.com";

export default function StreamTab({ eventId, isActive }) {
  const [allUploads, setAllUploads] = useState([]);
  const [hasNewUploads, setHasNewUploads] = useState(false);
  const [latestSeenAt, setLatestSeenAt] = useState(null);
  const [latestCount, setLatestCount] = useState(0);
  const [streamLoaded, setStreamLoaded] = useState(false);
  const [viewMode, setViewMode] = useState(() => {
    const stored = localStorage.getItem("wedding_snaps_stream_view");
    return stored === "grid" ? "grid" : "list";
  });
  const [activeIndex, setActiveIndex] = useState(null);
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);
  const fetchControllerRef = useRef(null);
  const fetchInFlightRef = useRef(false);
  const checkControllerRef = useRef(null);
  const checkInFlightRef = useRef(false);
  const justFetchedRef = useRef(false);
  const cacheKey = `wedding_snaps_stream_cache_${eventId}`;

  useEffect(() => {
    localStorage.setItem("wedding_snaps_stream_view", viewMode);
  }, [viewMode]);

  const latestStampFromItems = (items) => {
    const latest = items.reduce((max, item) => {
      const stamp = Date.parse(item.updatedAt || item.createdAt || 0);
      return Number.isNaN(stamp) ? max : Math.max(max, stamp);
    }, 0);
    return latest || null;
  };

  const fetchAll = async () => {
    if (!eventId) return;
    if (fetchInFlightRef.current && fetchControllerRef.current) {
      fetchControllerRef.current.abort();
    }
    const controller = new AbortController();
    fetchControllerRef.current = controller;
    fetchInFlightRef.current = true;
    try {
      const r = await fetch(`${API_BASE}/events/${eventId}/uploads?limit=100`, {
        signal: controller.signal,
      });
      const d = await r.json();
      if (d.ok) {
        setAllUploads(d.items);
        setStreamLoaded(true);
        setLatestSeenAt(latestStampFromItems(d.items));
        setLatestCount(d.items?.length || 0);
        setHasNewUploads(false);
        justFetchedRef.current = true;
        try {
          localStorage.setItem(
            cacheKey,
            JSON.stringify({
              items: d.items,
            })
          );
        } catch {
          // Ignore cache failures (e.g., storage quota).
        }
      }
    } catch (err) {
      if (err?.name !== "AbortError") {
        console.error("Fetch stream failed:", err);
      }
    } finally {
      if (fetchControllerRef.current === controller) {
        fetchControllerRef.current = null;
        fetchInFlightRef.current = false;
      }
    }
  };

  const loadCache = () => {
    if (!eventId) return false;
    try {
      const raw = localStorage.getItem(cacheKey);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed?.items)) return false;
      setAllUploads(parsed.items);
      setStreamLoaded(true);
      setLatestSeenAt(latestStampFromItems(parsed.items));
      setLatestCount(parsed.items?.length || 0);
      return true;
    } catch {
      return false;
    }
  };

  useEffect(() => {
    if (!isActive) return;
    if (!streamLoaded) {
      const loaded = loadCache();
      if (!loaded) fetchAll();
    }
  }, [eventId, isActive, streamLoaded]);

  const checkForNewUploads = async () => {
    if (!streamLoaded) return false;
    if (checkInFlightRef.current) return false;
    checkInFlightRef.current = true;
    const controller = new AbortController();
    checkControllerRef.current = controller;
    try {
      const r = await fetch(`${API_BASE}/events/${eventId}/uploads?limit=100`, {
        signal: controller.signal,
      });
      const d = await r.json();
      if (!d.ok) return;
      const newestTime = latestStampFromItems(d.items);
      if (!newestTime) return false;
      const nextCount = d.items?.length || 0;
      if (
        latestSeenAt === null ||
        newestTime > latestSeenAt ||
        nextCount !== latestCount
      ) {
        setHasNewUploads(true);
        return true;
      }
      return false;
    } catch {
      // Ignore check errors to avoid user disruption.
      return false;
    } finally {
      if (checkControllerRef.current === controller) {
        checkControllerRef.current = null;
        checkInFlightRef.current = false;
      }
    }
  };

  useEffect(() => {
    if (!isActive || !streamLoaded) return;
    const checkAndUpdate = async () => {
      if (justFetchedRef.current) {
        justFetchedRef.current = false;
        return;
      }
      const hasUpdates = await checkForNewUploads();
      if (hasUpdates) {
        fetchAll();
      }
    };
    checkAndUpdate();
  }, [isActive, streamLoaded, latestSeenAt, latestCount, eventId]);

  useEffect(() => {
    if (!isActive || !streamLoaded) return;
    const timer = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (activeIndex !== null) return;
      checkForNewUploads();
    }, 10000);
    return () => clearInterval(timer);
  }, [isActive, streamLoaded, latestSeenAt, latestCount, eventId, activeIndex]);

  const openAt = (index) => {
    setActiveIndex(index);
  };

  const closeModal = () => {
    setActiveIndex(null);
  };

  const showPrev = () => {
    if (activeIndex === null) return;
    setActiveIndex((prev) =>
      prev === 0 ? allUploads.length - 1 : prev - 1
    );
  };

  const showNext = () => {
    if (activeIndex === null) return;
    setActiveIndex((prev) =>
      prev === allUploads.length - 1 ? 0 : prev + 1
    );
  };

  useEffect(() => {
    if (activeIndex === null) return;
    const onKey = (e) => {
      if (e.key === "Escape") closeModal();
      if (e.key === "ArrowLeft") showPrev();
      if (e.key === "ArrowRight") showNext();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [activeIndex, allUploads.length]);

  const handleTouchStart = (e) => {
    if (!e.touches?.length) return;
    touchStartX.current = e.touches[0].clientX;
    touchEndX.current = touchStartX.current;
  };

  const handleTouchMove = (e) => {
    if (!e.touches?.length) return;
    touchEndX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e) => {
    const endX = e.changedTouches?.[0]?.clientX ?? touchEndX.current;
    const delta = endX - touchStartX.current;
    if (Math.abs(delta) < 40) return;
    if (delta > 0) showPrev();
    else showNext();
  };

  const activePhoto =
    activeIndex !== null ? allUploads[activeIndex] : null;

  return (
    <div className="stream-wrap">
      {activePhoto && (
        <div
          className="stream-modal"
          onClick={closeModal}
          role="presentation"
        >
          <div
            className="stream-modal-card"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <button
              type="button"
              className="stream-modal-close"
              onClick={closeModal}
              aria-label="Close"
            >
              X
            </button>
            <div
              className="stream-modal-media"
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
            >
              <div
                className="stream-modal-track"
                style={{
                  transform: `translateX(-${activeIndex * 100}%)`,
                }}
              >
                {allUploads.map((photo) => (
                  <div key={photo.id} className="stream-modal-slide">
                    <img src={photo.url} alt="" loading="lazy" decoding="async" />
                  </div>
                ))}
              </div>
              <button
                type="button"
                className="stream-modal-nav left"
                onClick={showPrev}
                aria-label="Previous"
              >
                {"<"}
              </button>
              <button
                type="button"
                className="stream-modal-nav right"
                onClick={showNext}
                aria-label="Next"
              >
                {">"}
              </button>
            </div>
            <div className="stream-modal-meta">
              {activePhoto.uploaderName && (
                <div className="stream-modal-name">
                  {activePhoto.uploaderName}
                </div>
              )}
              {activePhoto.createdAt && (
                <div className="stream-modal-time">
                  {new Date(activePhoto.createdAt).toLocaleString([], {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                    hour12: true,
                  })}
                </div>
              )}
              {activePhoto.comment && (
                <div className="stream-modal-comment">
                  {activePhoto.comment}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      <div className="stream-toolbar">
        {hasNewUploads ? (
          <div className="stream-notice">
            <span>New changes in the stream. Tap refresh to update.</span>
            <button type="button" onClick={fetchAll}>
              Refresh
            </button>
          </div>
        ) : (
          <span className="stream-label">Wedding stream</span>
        )}
        <div className="stream-toggle" role="group" aria-label="View mode">
          <button
            type="button"
            className={`stream-toggle-btn${viewMode === "list" ? " active" : ""}`}
            onClick={() => setViewMode("list")}
            title="List view"
            aria-label="List view"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="4" y="5" width="16" height="2" rx="1" />
              <rect x="4" y="11" width="16" height="2" rx="1" />
              <rect x="4" y="17" width="16" height="2" rx="1" />
            </svg>
          </button>
          <button
            type="button"
            className={`stream-toggle-btn${viewMode === "grid" ? " active" : ""}`}
            onClick={() => setViewMode("grid")}
            title="Grid view"
            aria-label="Grid view"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="4" y="4" width="6" height="6" rx="1" />
              <rect x="14" y="4" width="6" height="6" rx="1" />
              <rect x="4" y="14" width="6" height="6" rx="1" />
              <rect x="14" y="14" width="6" height="6" rx="1" />
            </svg>
          </button>
        </div>
      </div>
      <div className={`stream-grid${viewMode === "grid" ? " grid" : ""}`}>
        {allUploads.map((photo, index) => {
          return (
            <div
              key={photo.id}
              className="stream-card"
            >
              <div
                className="stream-photo"
                role="button"
                tabIndex={0}
                onClick={() => openAt(index)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openAt(index);
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
                  loading="lazy"
                  decoding="async"
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
