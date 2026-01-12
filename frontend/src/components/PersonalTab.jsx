import { useCallback, useEffect, useRef, useState } from "react";

const API_BASE =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ||
  "http://localhost:8080";

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

const FILTERS = [
  { id: "none", name: "Natural", css: "none" },
  {
    id: "nostalgia",
    name: "Nostalgia",
    css: "sepia(0.4) contrast(1.1) brightness(1.1)",
  },
  {
    id: "noir",
    name: "Noir",
    css: "grayscale(1) contrast(1.2) brightness(0.9)",
  },
  {
    id: "golden",
    name: "Golden",
    css: "sepia(0.2) saturate(1.6) brightness(1.05)",
  },
  {
    id: "ethereal",
    name: "Ethereal",
    css: "brightness(1.15) saturate(0.7) contrast(0.85)",
  },
];

function Camera({ onCapture, onClose, isUploading }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [stream, setStream] = useState(null);
  const [activeFilter, setActiveFilter] = useState(FILTERS[0]);

  const startCamera = useCallback(async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });

      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      alert("Camera access denied");
      onClose();
    }
  }, [onClose]);

  useEffect(() => {
    startCamera();
    return () => {
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [startCamera, stream]);

  const snap = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext("2d");
    ctx.filter = activeFilter.css;
    ctx.drawImage(video, 0, 0);

    canvas.toBlob(
      (blob) => {
        const file = new File([blob], "camera.jpg", {
          type: "image/jpeg",
        });
        onCapture(file);
      },
      "image/jpeg",
      0.9
    );
  };

  return (
    <div className="camera-modal">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        style={{ filter: activeFilter.css }}
        className="camera-video"
      />

      <button className="camera-close" onClick={onClose}>
        ƒo
      </button>

      <div className="camera-filters">
        {FILTERS.map((f) => (
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

      <div className="camera-controls">
        <button onClick={snap} disabled={isUploading}>
          ƒ-?
        </button>
      </div>

      <canvas ref={canvasRef} hidden />
    </div>
  );
}

export default function PersonalTab({ eventId, uploadLimit, uploaderName }) {
  const [myUploads, setMyUploads] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [commentDrafts, setCommentDrafts] = useState({});
  const [deletingIds, setDeletingIds] = useState({});
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const pickerRef = useRef(null);

  const fetchMine = async () => {
    const r = await fetch(`${API_BASE}/events/${eventId}/my-uploads`, {
      headers: { "X-Device-Id": getDeviceId() },
    });
    const d = await r.json();
    if (d.ok) setMyUploads(d.items);
  };

  useEffect(() => {
    fetchMine();
  }, [eventId]);

  useEffect(() => {
    const nextDrafts = {};
    myUploads.forEach((upload) => {
      nextDrafts[upload.id] = upload.comment || "";
    });
    setCommentDrafts(nextDrafts);
  }, [myUploads]);

  const uploadFile = async (file, { manageState = true } = {}) => {
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

      await fetchMine();
    } catch {
      alert("Upload failed");
    } finally {
      if (manageState) setIsUploading(false);
    }
  };

  const uploadFiles = async (files) => {
    if (!files?.length) return;
    setIsUploading(true);
    try {
      for (const file of files) {
        await uploadFile(file, { manageState: false });
      }
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
      alert("Delete failed");
    } finally {
      setDeletingIds((prev) => {
        const next = { ...prev };
        delete next[uploadId];
        return next;
      });
    }
  };

  const updateComment = async (uploadId, comment) => {
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
      fetchMine();
    } catch (err) {
      console.error(err);
      alert("Comment update failed");
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
          onClose={() => setShowCamera(false)}
          onCapture={(file) => {
            setShowCamera(false);
            uploadFile(file);
          }}
          isUploading={isUploading}
        />
      )}

      <div className="grid">
        {Array.from({ length: uploadLimit }).map((_, i) => {
          const p = myUploads[i];

          if (p) {
            const draft = commentDrafts[p.id] ?? "";
            const trimmed = draft.trim();
            const saved = (p.comment || "").trim();
            const canSave = trimmed.length > 0 && trimmed !== saved;
            const isDeleting = !!deletingIds[p.id];
            return (
              <div key={p.id} className="slot filled">
                <div className="slot-image">
                  <img src={p.url} alt="" />
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
                    disabled={isDeleting}
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
                    >
                      Save
                    </button>
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
    </section>
  );
}
