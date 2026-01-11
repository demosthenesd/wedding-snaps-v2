import { useEffect, useRef, useState, useCallback } from "react";

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

function buildGuestName() {
    const id = crypto.randomUUID().slice(0, 6).toUpperCase();
    return `Guest ${id}`;
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
    { id: "nostalgia", name: "Nostalgia", css: "sepia(0.4) contrast(1.1) brightness(1.1)" },
    { id: "noir", name: "Noir", css: "grayscale(1) contrast(1.2) brightness(0.9)" },
    { id: "golden", name: "Golden", css: "sepia(0.2) saturate(1.6) brightness(1.05)" },
    { id: "ethereal", name: "Ethereal", css: "brightness(1.15) saturate(0.7) contrast(0.85)" },
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
    }, [startCamera]);

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
                ✕
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
                    ●
                </button>
            </div>

            <canvas ref={canvasRef} hidden />
        </div>
    );
}

/* ---------------- Gallery ---------------- */

export default function Gallery({ eventId }) {
    const [tab, setTab] = useState("personal");
    const [myUploads, setMyUploads] = useState([]);
    const [allUploads, setAllUploads] = useState([]);
    const [uploadLimit, setUploadLimit] = useState(4);
    const [isDriveConnected, setIsDriveConnected] = useState(false);
    const [isOwnerConnected, setIsOwnerConnected] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [showCamera, setShowCamera] = useState(false);
    const [showIdentityModal, setShowIdentityModal] = useState(false);
    const [showNameEntry, setShowNameEntry] = useState(false);
    const [nameInput, setNameInput] = useState("");
    const [uploaderName, setUploaderName] = useState("");
    const [hasNewUploads, setHasNewUploads] = useState(false);
    const [latestSeenAt, setLatestSeenAt] = useState(null);
    const [streamLoaded, setStreamLoaded] = useState(false);

    const pickerRef = useRef(null);
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

    /* ---------- Fetch uploads ---------- */
    const fetchAll = async () => {
        const r = await fetch(`${API_BASE}/events/${eventId}/uploads?limit=100`);
        const d = await r.json();
        if (d.ok) {
            setAllUploads(d.items);
            setStreamLoaded(true);
            const newest = d.items?.[0]?.createdAt;
            setLatestSeenAt(newest ? Date.parse(newest) : null);
            setHasNewUploads(false);
        }
    };

    const fetchMine = async () => {
        const r = await fetch(`${API_BASE}/events/${eventId}/my-uploads`, {
            headers: { "X-Device-Id": getDeviceId() },
        });
        const d = await r.json();
        if (d.ok) setMyUploads(d.items);
    };

    useEffect(() => {
        fetchAll();
        fetchMine();
    }, [eventId]);

    const checkForNewUploads = async () => {
        if (!streamLoaded) return;
        try {
            const r = await fetch(`${API_BASE}/events/${eventId}/uploads?limit=1`);
            const d = await r.json();
            if (!d.ok) return;
            const newest = d.items?.[0]?.createdAt;
            if (!newest) return;
            const newestTime = Date.parse(newest);
            if (latestSeenAt === null || newestTime > latestSeenAt) {
                setHasNewUploads(true);
            }
        } catch {
            // Ignore check errors to avoid user disruption.
        }
    };

    useEffect(() => {
        if (tab !== "stream") return;
        checkForNewUploads();

        const handleVisibility = () => {
            if (document.visibilityState === "visible") {
                checkForNewUploads();
            }
        };

        document.addEventListener("visibilitychange", handleVisibility);
        return () => document.removeEventListener("visibilitychange", handleVisibility);
    }, [tab, latestSeenAt, streamLoaded, eventId]);

    /* ---------- Upload ---------- */
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

            await fetchAll();
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


    const handleDelete = async (uploadId) => {
        if (!confirm("Delete this photo?")) return;

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

            // Refresh grids
            fetchAll();
            fetchMine();
        } catch (err) {
            console.error(err);
            alert("Delete failed");
        }
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
                                        <button className="pill-btn" onClick={openNameEntry} type="button">
                                            Add my name
                                        </button>
                                        <button className="pill-btn secondary" onClick={chooseAnonymous} type="button">
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
                                            <button className="pill-btn" onClick={saveName} type="button">
                                                Continue
                                            </button>
                                            <button className="pill-btn secondary" onClick={chooseAnonymous} type="button">
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
                <section className="personal-grid">
                    <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
                        {myUploads.length >= uploadLimit ? (
                            <div className="limit-warning">
                                Max limit reached. Delete a photo if you want to upload a new one.
                            </div>
                        ) : (
                            <>
                                <button
                                    className="pill-btn"
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
                                return (
                                    <div key={p.id} className="slot filled">
                                        <img src={p.url} alt="" />

                                        <button
                                            className="delete-btn"
                                            onClick={(e) => {
                                                e.stopPropagation(); // 👈 important
                                                handleDelete(p.id);
                                            }}
                                            title="Delete photo"
                                        >
                                            ✕
                                        </button>
                                    </div>

                                );
                            }

                            return (
                                <div
                                    key={i}
                                    className={`slot empty ${i === myUploads.length ? "capture" : "locked"
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
            )}


            {tab === "stream" && (
                <div style={{ padding: 20 }}>
                    {hasNewUploads && (
                        <div className="stream-notice">
                            <span>New images have been uploaded by other guests.</span>
                            <button type="button" onClick={fetchAll}>
                                Refresh
                            </button>
                        </div>
                    )}
                    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                        {allUploads.map((photo) => (
                            <div
                                key={photo.id}
                                style={{
                                    background: "white",
                                    borderRadius: 20,
                                    overflow: "hidden",
                                    border: "1px solid var(--border)",
                                }}
                            >
                                <div style={{ aspectRatio: "1 / 1" }}>
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
                            </div>
                        ))}
                    </div>
                </div>
            )}

        </div>
    );
}


