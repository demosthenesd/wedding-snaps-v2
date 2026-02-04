import { useCallback, useEffect, useRef, useState } from "react";
import { CAMERA_FILTERS } from "./cameraFilters";
import { API_BASE } from "../config";
import { useToast } from "./Toast";

/* ---------------- Helpers ---------------- */

function getDeviceId() {
  const key = "wedding_snaps_device_id";
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}

async function compressImage(file, maxBytes = 100_000, maxDim = 1600) {
  const bitmap = await createImageBitmap(file);

  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, w, h);

  let quality = 0.85;
  let blob;

  do {
    blob = await new Promise((res) =>
      canvas.toBlob(res, "image/jpeg", quality)
    );
    quality -= 0.05;
  } while (blob && blob.size > maxBytes && quality > 0.4);

  return new File([blob], "snap.jpg", { type: "image/jpeg" });
}

/* ---------------- Camera ---------------- */

function Camera({ onCapture, onClose, isUploading, onToast }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const startedRef = useRef(false);
  const isStartingRef = useRef(false);
  const startPromiseRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const [activeFilter, setActiveFilter] = useState(CAMERA_FILTERS[0]);
  const [previewUrl, setPreviewUrl] = useState("");
  const [facingMode, setFacingMode] = useState("environment");
  const previewBlobRef = useRef(null);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const startCamera = useCallback(async () => {
    if (isStartingRef.current) return startPromiseRef.current;
    if (startedRef.current) return;
    isStartingRef.current = true;
    startedRef.current = true;
    startPromiseRef.current = (async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        onToast?.("Camera not available. Use HTTPS or localhost.", {
          variant: "error",
        });
        onCloseRef.current?.();
        return;
      }

      let mediaStream;
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facingMode } },
          audio: false,
        });
      } catch (err) {
        if (err?.name === "NotReadableError") {
          // Retry with a generic constraint if the device is busy.
          mediaStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });
        } else if (
          err?.name === "OverconstrainedError" ||
          err?.name === "NotFoundError"
        ) {
          mediaStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });
        } else {
          throw err;
        }
      }

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      streamRef.current = mediaStream;
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        try {
          await videoRef.current.play();
        } catch (err) {
          if (err?.name !== "AbortError") {
            throw err;
          }
        }
      }
    } catch (err) {
      console.error("Camera error:", err);
      if (err?.name === "AbortError") return;
      const reason = err?.name ? ` (${err.name})` : "";
      onToast?.(`Camera access denied${reason}`, { variant: "error" });
      onCloseRef.current?.();
    } finally {
      isStartingRef.current = false;
      startPromiseRef.current = null;
    }
    })();
    return startPromiseRef.current;
  }, [facingMode]);

  useEffect(() => {
    startCamera();
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      startedRef.current = false;
    };
  }, [startCamera]);

  const snap = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext("2d");
    ctx.filter = activeFilter.css;
    if (facingMode === "user") {
      ctx.save();
      ctx.scale(-1, 1);
      ctx.drawImage(video, -canvas.width, 0);
      ctx.restore();
    } else {
      ctx.drawImage(video, 0, 0);
    }

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        previewBlobRef.current = blob;
        setPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return URL.createObjectURL(blob);
        });
      },
      "image/jpeg",
      0.9
    );
  };

  const retake = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewBlobRef.current = null;
    setPreviewUrl("");
  };

  const confirmUpload = () => {
    const blob = previewBlobRef.current;
    if (!blob) return;
    const file = new File([blob], "camera.jpg", { type: "image/jpeg" });
    onCapture(file);
  };

  const toggleCamera = () => {
    setFacingMode((prev) => (prev === "environment" ? "user" : "environment"));
  };

  useEffect(() => {
    if (previewUrl) return;
    const switchCamera = async () => {
      const track = streamRef.current?.getVideoTracks?.()[0];
      if (track?.applyConstraints) {
        try {
          await track.applyConstraints({ facingMode: { ideal: facingMode } });
          return;
        } catch (err) {
          if (err?.name !== "OverconstrainedError") {
            console.warn("Facing mode switch failed, restarting camera:", err);
          }
        }
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      startedRef.current = false;
      await startCamera();
    };
    switchCamera();
  }, [facingMode, previewUrl, startCamera]);

  useEffect(() => {
    if (previewUrl) return;
    if (!videoRef.current || !streamRef.current) return;
    videoRef.current.srcObject = streamRef.current;
    videoRef.current.play().catch((err) => {
      if (err?.name !== "AbortError") console.error("Camera play error:", err);
    });
  }, [previewUrl, startCamera]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  return (
    <div className="camera-modal">
      {previewUrl ? (
        <img
          src={previewUrl}
          alt="Captured"
          className="camera-video"
          style={{ filter: activeFilter.css }}
        />
      ) : (
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          style={{
            transform: facingMode === "user" ? "scaleX(-1)" : "none",
          }}
          className="camera-video"
        />
      )}

      <button className="camera-close" onClick={onClose} aria-label="Close">
        X
      </button>

      {!previewUrl && (
        <button
          className="camera-switch"
          onClick={toggleCamera}
          aria-label="Switch camera"
          type="button"
        >
          ↻
        </button>
      )}

      {previewUrl && (
        <div className="camera-filters">
          {CAMERA_FILTERS.map((f) => (
            <button
              key={f.id}
              className={f.id === activeFilter.id ? "active" : ""}
              onClick={() => setActiveFilter(f)}
              style={{ filter: f.css }}
            >
              {f.name}
            </button>
          ))}
        </div>
      )}

      <div className="camera-controls">
        {previewUrl ? (
          <>
            <button
              onClick={retake}
              disabled={isUploading}
              aria-label="Retake"
              className="camera-action secondary"
            >
              Retake
            </button>
            <button
              onClick={confirmUpload}
              disabled={isUploading}
              aria-label="Upload"
              className="camera-action primary"
            >
              Upload
            </button>
          </>
        ) : (
          <button onClick={snap} disabled={isUploading} aria-label="Capture">
            ●
          </button>
        )}
      </div>

      <canvas ref={canvasRef} hidden />
    </div>
  );
}

export default function PersonalTab({
  eventId,
  uploadLimit,
  uploaderName,
  isActive,
}) {
  const { addToast } = useToast();
  const [myUploads, setMyUploads] = useState([]);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [commentDrafts, setCommentDrafts] = useState({});
  const [savingCommentIds, setSavingCommentIds] = useState({});
  const [savedCommentIds, setSavedCommentIds] = useState({});
  const [deletingIds, setDeletingIds] = useState({});
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const pickerRef = useRef(null);
  const fetchControllerRef = useRef(null);
  const fetchInFlightRef = useRef(false);
  const savedTimersRef = useRef({});
  const cacheKey = `wedding_snaps_personal_cache_${eventId}`;
  const handleCloseCamera = useCallback(() => setShowCamera(false), []);

  const fetchMine = async () => {
    if (!eventId) return;
    if (fetchInFlightRef.current && fetchControllerRef.current) {
      fetchControllerRef.current.abort();
    }
    const controller = new AbortController();
    fetchControllerRef.current = controller;
    fetchInFlightRef.current = true;
    try {
      const r = await fetch(`${API_BASE}/events/${eventId}/my-uploads`, {
        headers: { "X-Device-Id": getDeviceId() },
        signal: controller.signal,
      });
      const d = await r.json();
      if (d.ok) {
        setMyUploads(d.items);
        setHasLoaded(true);
        try {
          localStorage.setItem(
            cacheKey,
            JSON.stringify({ items: d.items })
          );
        } catch {
          // Ignore cache failures (e.g., storage quota).
        }
      }
    } catch (err) {
      if (err?.name !== "AbortError") {
        console.error("Fetch uploads failed:", err);
      }
    } finally {
      if (fetchControllerRef.current === controller) {
        fetchControllerRef.current = null;
        fetchInFlightRef.current = false;
      }
    }
  };

  useEffect(() => {
    if (!eventId || hasLoaded) return;
    try {
      const raw = localStorage.getItem(cacheKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed?.items)) {
          setMyUploads(parsed.items);
          setHasLoaded(true);
        }
      }
    } catch {
      // Ignore cache failures.
    }
  }, [eventId, cacheKey, hasLoaded]);

  useEffect(() => {
    if (!eventId || !isActive) return;
    fetchMine();
  }, [eventId, isActive]);

  useEffect(() => {
    if (!isActive) return;
    const timer = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      fetchMine();
    }, 15000);
    return () => clearInterval(timer);
  }, [eventId, isActive]);

  useEffect(() => {
    const nextDrafts = {};
    myUploads.forEach((upload) => {
      nextDrafts[upload.id] = upload.comment || "";
    });
    setCommentDrafts(nextDrafts);
  }, [myUploads]);

  useEffect(() => {
    return () => {
      Object.values(savedTimersRef.current).forEach((timer) =>
        clearTimeout(timer)
      );
    };
  }, []);

  const uploadFile = async (
    file,
    { manageState = true, skipRefresh = false } = {}
  ) => {
    if (manageState) setIsUploading(true);
    try {
      const compressed = await compressImage(file);
      const form = new FormData();
      form.append("file", compressed);

      const res = await fetch(`${API_BASE}/events/${eventId}/upload`, {
        method: "POST",
        headers: {
          "X-Device-Id": getDeviceId(),
          ...(uploaderName ? { "X-Uploader-Name": uploaderName } : {}),
        },
        body: form,
      });

      const d = await res.json();
      if (!d.ok) throw new Error();

      if (!skipRefresh) {
        await fetchMine();
      }
    } catch {
      addToast("Upload failed", { variant: "error" });
    } finally {
      if (manageState) setIsUploading(false);
    }
  };

  const uploadFiles = async (files) => {
    if (!files?.length) return;
    setIsUploading(true);
    try {
      for (const file of files) {
        await uploadFile(file, { manageState: false, skipRefresh: true });
      }
      await fetchMine();
    } finally {
      setIsUploading(false);
    }
  };

  const requestDelete = (uploadId) => {
    if (deletingIds[uploadId]) return;
    setConfirmDeleteId(uploadId);
  };

  const confirmDelete = async () => {
    const uploadId = confirmDeleteId;
    if (!uploadId) return;
    setConfirmDeleteId(null);
    if (deletingIds[uploadId]) return;
    setDeletingIds((prev) => ({ ...prev, [uploadId]: true }));

    try {
      const res = await fetch(
        `${API_BASE}/events/${eventId}/uploads/${uploadId}`,
        {
          method: "DELETE",
          headers: {
            "X-Device-Id": getDeviceId(),
          },
        }
      );

      const data = await res.json();
      if (!data.ok) throw new Error(data.error);

      fetchMine();
    } catch (err) {
      console.error(err);
      addToast("Delete failed", { variant: "error" });
    } finally {
      setDeletingIds((prev) => {
        const next = { ...prev };
        delete next[uploadId];
        return next;
      });
    }
  };

  const updateComment = async (uploadId, comment) => {
    if (savingCommentIds[uploadId]) return;
    setSavingCommentIds((prev) => ({ ...prev, [uploadId]: true }));
    try {
      const res = await fetch(
        `${API_BASE}/events/${eventId}/uploads/${uploadId}/comment`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "X-Device-Id": getDeviceId(),
          },
          body: JSON.stringify({ comment }),
        }
      );
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setMyUploads((prev) =>
        prev.map((upload) =>
          upload.id === uploadId
            ? { ...upload, comment: data.comment, updatedAt: new Date().toISOString() }
            : upload
        )
      );
      setCommentDrafts((prev) => ({ ...prev, [uploadId]: data.comment }));
      setSavedCommentIds((prev) => ({ ...prev, [uploadId]: true }));
      if (savedTimersRef.current[uploadId]) {
        clearTimeout(savedTimersRef.current[uploadId]);
      }
      savedTimersRef.current[uploadId] = setTimeout(() => {
        setSavedCommentIds((prev) => {
          const next = { ...prev };
          delete next[uploadId];
          return next;
        });
        delete savedTimersRef.current[uploadId];
      }, 2200);
    } catch (err) {
      console.error(err);
      addToast("Comment update failed", { variant: "error" });
    } finally {
      setSavingCommentIds((prev) => {
        const next = { ...prev };
        delete next[uploadId];
        return next;
      });
    }
  };

  return (
    <section className="personal-grid">
      {confirmDeleteId && (
        <div
          className="identity-modal"
          onClick={() => setConfirmDeleteId(null)}
          role="presentation"
        >
          <div
            className="identity-card"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <h3 className="identity-title">Delete this photo?</h3>
            <div className="identity-actions">
              <button
                className="pill-btn"
                type="button"
                onClick={confirmDelete}
              >
                Delete
              </button>
              <button
                className="pill-btn secondary"
                type="button"
                onClick={() => setConfirmDeleteId(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      {showCamera && (
        <Camera
          onClose={handleCloseCamera}
          onCapture={(file) => {
            setShowCamera(false);
            uploadFile(file);
          }}
          isUploading={isUploading}
          onToast={addToast}
        />
      )}

      <div className="upload-cta">
        {myUploads.length >= uploadLimit ? (
          <div className="limit-warning">
            Max limit reached. Delete a photo if you want to upload a new one.
          </div>
        ) : (
          <>
            <button
              className="upload-btn"
              onClick={() => pickerRef.current?.click()}
              disabled={isUploading}
              type="button"
            >
              {isUploading ? "Uploading..." : "Upload from device"}
            </button>
            <input
              ref={pickerRef}
              type="file"
              accept="image/*"
              multiple
              style={{ display: "none" }}
              onChange={(e) => {
                const files = Array.from(e.target.files || []);
                e.target.value = "";
                uploadFiles(files);
              }}
            />
          </>
        )}
      </div>

      <div className="grid">
        {Array.from({ length: uploadLimit }).map((_, i) => {
          const p = myUploads[i];

          if (p) {
            const draft = commentDrafts[p.id] ?? "";
            const trimmed = draft.trim();
            const saved = (p.comment || "").trim();
            const canSave = trimmed.length > 0 && trimmed !== saved;
            const isDeleting = !!deletingIds[p.id];
            const isSaving = !!savingCommentIds[p.id];
            const isSaved = !!savedCommentIds[p.id];
            return (
              <div key={p.id} className="slot filled">
                <div className="slot-image">
                  <img src={p.url} alt="" loading="lazy" decoding="async" />
                  {isDeleting && (
                    <div className="slot-overlay">
                      <span className="spinner" />
                      <span className="slot-label">Deleting</span>
                    </div>
                  )}
                  <button
                    className="delete-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      requestDelete(p.id);
                    }}
                    title="Delete photo"
                    disabled={isDeleting}
                  >
                    X
                  </button>
                </div>
                <div className="slot-comment">
                  <textarea
                    rows={2}
                    placeholder="Write a comment"
                    value={draft}
                    disabled={isDeleting || isSaving}
                    onChange={(e) =>
                      setCommentDrafts((prev) => ({
                        ...prev,
                        [p.id]: e.target.value,
                      }))
                    }
                  />
                  {canSave && !isDeleting && (
                    <button
                      type="button"
                      className="comment-save"
                      onClick={() => updateComment(p.id, trimmed)}
                      disabled={isSaving}
                    >
                      <span className={`save-text${isSaving ? " is-hidden" : ""}`}>
                        Save
                      </span>
                      {isSaving && <span className="spinner small" />}
                    </button>
                  )}
                  {isSaving && (
                    <div className="comment-status saving">
                      Saving...
                    </div>
                  )}
                  {!isSaving && isSaved && (
                    <div className="comment-status saved">
                      Saved
                      <span className="save-bar" />
                    </div>
                  )}
                </div>
              </div>
            );
          }

          return (
            <div
              key={i}
              className={`slot empty ${
                i === myUploads.length ? "capture" : "locked"
              }`}
              onClick={() => {
                if (i === myUploads.length && !isUploading) {
                  setShowCamera(true);
                }
              }}
            >
              {i === myUploads.length && isUploading ? (
                <div className="slot-loader">
                  <span className="spinner" />
                  <span className="slot-label">Uploading</span>
                </div>
              ) : (
                <>
                  <span className="slot-icon">📷</span>
                  <span className="slot-label">
                    {i === myUploads.length ? "CAPTURE" : "LOCKED"}
                  </span>
                </>
              )}
            </div>
          );
        })}
      </div>

    </section>
  );
}
