export default function Layout({ children }) {
  const goHome = () => {
    window.location.href = "/";
  };

  return (
    <div className="album">
      <header className="album-header">
        <button className="brand" onClick={goHome} type="button">
          <h1 className="brand-title">Wedding Snaps</h1>
          <p className="brand-subtitle">Capturing the BTS of Love</p>
        </button>
      </header>

      <main className="album-content">{children}</main>

      <footer className="album-footer">
        © 2026 Wedding Snaps. For the memories that last.
      </footer>
    </div>
  );
}
