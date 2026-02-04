import { useEffect, useState } from "react";
import Layout from "./components/Layout";
import Gallery from "./components/Gallery";
import Landing from "./components/Landing";
import { ToastProvider } from "./components/Toast";

export default function App() {
  const [eventId, setEventId] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const e = params.get("e");
    if (e) setEventId(e);
  }, []);

  return (
    <ToastProvider>
      <Layout>
        {eventId ? (
          <Gallery eventId={eventId} />
        ) : (
          <Landing />
        )}
      </Layout>
    </ToastProvider>
  );
}
