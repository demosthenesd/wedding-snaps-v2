export default function Layout({ children }) {
  return (
    <div className="album">
      <header className="album-header">
        <div className="brand">
          <h1 className="brand-title">Candid Snaps</h1>
          <p className="brand-subtitle">
            Real memories, captured by the people you love
          </p>
        </div>
      </header>

      <main className="album-content">{children}</main>

      <footer className="album-footer">
        (c) 2026 Candid Snaps. For the memories that last.
      </footer>
    </div>
  );
}
