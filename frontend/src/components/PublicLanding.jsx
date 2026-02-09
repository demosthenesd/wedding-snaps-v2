import { useMemo, useState } from "react";
import { API_BASE } from "../config";

export default function PublicLanding() {
  const faqs = useMemo(
    () => [
      {
        q: "Do guests need an app?",
        a: "No. Guests upload straight from their phone browser using the event link or QR code.",
      },
      {
        q: "Where do the photos go?",
        a: "Photos are uploaded directly to your connected Google Drive folder.",
      },
      {
        q: "Can I control upload limits?",
        a: "Yes. Set a per-guest upload limit and adjust it any time.",
      },
      {
        q: "Is it private?",
        a: "Yes. Only people with your event link can view and upload.",
      },
    ],
    []
  );

  const [openFaq, setOpenFaq] = useState(0);
  const [showAdmin, setShowAdmin] = useState(false);
  const [adminError, setAdminError] = useState("");
  const [adminCode, setAdminCode] = useState("");
  const [showContactSuccess, setShowContactSuccess] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("success") === "1";
  });

  const openAdmin = () => {
    setAdminCode("");
    setAdminError("");
    setShowAdmin(true);
  };
  const closeAdmin = () => {
    setAdminCode("");
    setAdminError("");
    setShowAdmin(false);
  };

  const submitAdmin = async (e) => {
    e.preventDefault();
    const next = adminCode.trim();
    if (!next) return;

    try {
      const res = await fetch(`${API_BASE}/auth/admin-check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode: next }),
      });
      const data = await res.json();
      if (!data.ok) {
        setAdminError(data.error || "Incorrect passcode.");
        return;
      }
      setAdminError("");
      localStorage.setItem("wedding_snaps_admin_authed", "true");
      window.location.assign("/admin");
    } catch (err) {
      console.error(err);
      setAdminError("Unable to verify passcode.");
    }
  };

  const dismissSuccess = () => {
    setShowContactSuccess(false);
    const url = new URL(window.location.href);
    url.searchParams.delete("success");
    window.history.replaceState({}, "", url.toString());
  };

  const handleContactSubmit = (e) => {
    if (window.location.hostname === "localhost") {
      e.preventDefault();
      setShowContactSuccess(true);
    }
  };

  return (
    <div className="landing public-landing">
      <header className="public-header">
        <div className="public-shell">
          <div className="public-header-row">
            <div className="public-logo">
              <span className="public-logo-mark" />
              <span className="public-logo-text">Candid Snaps</span>
            </div>
            <nav className="public-nav" aria-label="Page">
              <a href="#intro">Intro</a>
              <a href="#features">Features</a>
              <a href="#faq">FAQs</a>
              <a href="#contact">Contact</a>
              <button
                type="button"
                className="public-nav-admin"
                onClick={openAdmin}
              >
                Admin
              </button>
            </nav>
          </div>
        </div>
      </header>

      <section className="public-hero">
        <div className="public-shell hero-grid">
          <div className="hero-copy">
            <p className="hero-kicker">CAPTURE THE BTS OF LOVE</p>
            <h2 className="hero-title">Capture your behind-the-scenes.</h2>
            <p className="hero-subtitle">
              A private, shared gallery where guests can upload their favorite
              moments in real time.
            </p>
            <div className="hero-meta">
              <div>
                <span className="hero-meta-number">2 min</span>
                <span className="hero-meta-label">setup time</span>
              </div>
              <div>
                <span className="hero-meta-number">0 apps</span>
                <span className="hero-meta-label">for guests</span>
              </div>
              <div>
                <span className="hero-meta-number">100%</span>
                <span className="hero-meta-label">private link</span>
              </div>
            </div>
          </div>

          <div className="hero-media">
            <img
              src="/hero.jpg"
              alt="Wedding guests watching dancers during a celebration"
            />
          </div>
        </div>
      </section>

      <section id="intro" className="public-section">
        <div className="public-shell">
          <div className="section-header">
            <h3>Intro</h3>
            <p>
              Create a shared gallery, connect Google Drive, and let your guests
              do the rest. It takes minutes to set up.
            </p>
          </div>
          <div className="intro-grid">
            <div className="panel-card intro-card">
              <h4>Designed for weddings</h4>
              <p>
                Set a guest upload limit, personalize the event, and share the
                QR code. You stay in control while everyone contributes.
              </p>
              <ul>
                <li>Instant uploads from any phone</li>
                <li>Simple QR sharing</li>
                <li>Automatic photo organization</li>
              </ul>
            </div>
            <div className="panel-card intro-media">
              <div className="intro-media-inner">
                <span>Live gallery preview</span>
                <p>Guests upload in real time to your Drive folder.</p>
              </div>
              <div className="intro-stats">
                <div>
                  <strong>4-10</strong>
                  <span>uploads per guest</span>
                </div>
                <div>
                  <strong>Unlimited</strong>
                  <span>events</span>
                </div>
                <div>
                  <strong>24/7</strong>
                  <span>access</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="public-section alt">
        <div className="public-shell">
          <div className="section-header">
            <h3>Features</h3>
            <p>
              Everything you need to collect the best candid moments without
              extra apps or logins.
            </p>
          </div>
          <div className="feature-grid">
            {[
              {
                title: "Quick setup",
                body: "Create an event and share the QR in minutes.",
              },
              {
                title: "Drive-connected",
                body: "Files upload directly to your Google Drive folder.",
              },
              {
                title: "Guest-friendly",
                body: "No accounts required for guests to upload photos.",
              },
              {
                title: "Upload limits",
                body: "Control how many photos each guest can add.",
              },
              {
                title: "Live stream",
                body: "Watch the gallery update as moments happen.",
              },
              {
                title: "Private access",
                body: "Only people with your link can view and upload.",
              },
            ].map((item) => (
              <div key={item.title} className="panel-card feature-card">
                <div className="feature-icon" />
                <h4>{item.title}</h4>
                <p>{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="faq" className="public-section">
        <div className="public-shell">
          <div className="section-header">
            <h3>FAQs</h3>
            <p>Answers to common questions before you get started.</p>
          </div>
          <div className="faq-list">
            {faqs.map((item, idx) => {
              const open = openFaq === idx;
              return (
                <div key={item.q} className="faq-item">
                  <button
                    type="button"
                    className="faq-question"
                    onClick={() => setOpenFaq(open ? -1 : idx)}
                    aria-expanded={open}
                  >
                    <span>{item.q}</span>
                    <span className={`faq-chevron${open ? " open" : ""}`}>
                      v
                    </span>
                  </button>
                  {open && <div className="faq-answer">{item.a}</div>}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section id="contact" className="public-section">
        <div className="public-shell">
          <div className="contact-grid">
            <div>
              <div className="section-header">
                <h3>Contact us</h3>
                <p>
                  Tell us about your date and guest count. We will reply quickly.
                </p>
              </div>
              <div className="contact-card">
                <div>
                  <span>Email</span>
                  <strong>demosthenes.demecillo@gmail.com</strong>
                </div>
                <div>
                  <span>Response time</span>
                  <strong>Within 24 hours</strong>
                </div>
                <div>
                  <span>Coverage</span>
                  <strong>Worldwide</strong>
                </div>
              </div>
            </div>

            <form
              className="panel-card contact-form"
              name="contact"
              method="POST"
              data-netlify="true"
              data-netlify-honeypot="bot-field"
              action="/?success=1#contact"
              onSubmit={handleContactSubmit}
            >
              <input type="hidden" name="form-name" value="contact" />
              <p style={{ display: "none" }}>
                <label>
                  Don’t fill this out if you're human:
                  <input name="bot-field" />
                </label>
              </p>
              <label className="landing-field">
                <span>Name</span>
                <input type="text" name="name" required />
              </label>
              <label className="landing-field">
                <span>Email</span>
                <input type="email" name="email" required />
              </label>
              <label className="landing-field">
                <span>Message</span>
                <textarea name="message" rows={5} required />
              </label>
              <button className="pill-btn landing-primary" type="submit">
                Contact us
              </button>
            </form>
          </div>

          {showContactSuccess && (
            <div className="contact-success" role="status">
              <div>
                Thanks! Your message was sent. We will get back to you soon.
              </div>
              <button type="button" onClick={dismissSuccess}>
                Close
              </button>
            </div>
          )}
        </div>
      </section>

      {showAdmin && (
        <div className="identity-modal" onClick={closeAdmin} role="presentation">
          <div
            className="identity-card"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <h3 className="identity-title">Admin passcode</h3>
            <form className="identity-entry" onSubmit={submitAdmin}>
              <input
                type="password"
                value={adminCode}
                onChange={(e) => setAdminCode(e.target.value)}
                placeholder="Enter passcode"
              />
              {adminError && <p className="landing-error">{adminError}</p>}
              <div className="identity-actions">
                <button className="pill-btn" type="submit">
                  Continue
                </button>
                <button
                  className="pill-btn secondary"
                  type="button"
                  onClick={closeAdmin}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
