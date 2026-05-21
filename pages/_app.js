import "../styles/globals.css";
import Head from "next/head";
import { useState, useEffect } from "react";
import { AuthProvider } from "../contexts/AuthContext";
import { TimerProvider } from "../contexts/TimerContext";
import { NotificationProvider } from "../contexts/NotificationContext";
import { I18nProvider } from "../contexts/I18nContext";

function InstallBanner() {
  const [prompt, setPrompt] = useState(null);

  useEffect(() => {
    function handler(e) { e.preventDefault(); setPrompt(e); }
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (!prompt) return null;

  async function install() {
    prompt.prompt();
    await prompt.userChoice;
    setPrompt(null);
  }

  return (
    <div style={{
      position: "fixed", bottom: 80, left: 0, right: 0, zIndex: 200,
      padding: "0 16px", pointerEvents: "none",
    }}>
      <div style={{
        backgroundColor: "#1F1A17", color: "#fff", borderRadius: 16,
        padding: "12px 16px", maxWidth: 400, margin: "0 auto",
        display: "flex", alignItems: "center", gap: 12,
        boxShadow: "0 8px 28px rgba(0,0,0,0.28)", pointerEvents: "all",
      }}>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>Installer l&apos;app</p>
          <p style={{ fontSize: 12, color: "#A8A09A", margin: "2px 0 0" }}>
            Accède à blocus-tracker depuis ton écran d&apos;accueil
          </p>
        </div>
        <button onClick={install} style={{
          backgroundColor: "#14B885", color: "#fff", border: "none",
          borderRadius: 10, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer",
        }}>
          Installer
        </button>
        <button onClick={() => setPrompt(null)} style={{
          color: "#A8A09A", background: "none", border: "none",
          cursor: "pointer", fontSize: 18, lineHeight: 1, padding: 4,
        }}>
          ✕
        </button>
      </div>
    </div>
  );
}

export default function App({ Component, pageProps }) {
  return (
    <AuthProvider>
      <I18nProvider>
      <TimerProvider>
      <NotificationProvider>
        <Head>
          <title>blocus-tracker</title>
          <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
          <meta name="description" content="Suivi d'étude avec un réseau social entre amis." />
          <meta name="application-name" content="Blocus Tracker" />
          <meta name="apple-mobile-web-app-capable" content="yes" />
          <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
          <meta name="apple-mobile-web-app-title" content="Blocus" />
          <meta name="mobile-web-app-capable" content="yes" />
          <meta name="theme-color" content="#14B885" />
          <link rel="manifest" href="/manifest.json" />
          <link rel="apple-touch-icon" href="/icon-192x192.png" />
        </Head>
        <Component {...pageProps} />
        <InstallBanner />
      </NotificationProvider>
      </TimerProvider>
      </I18nProvider>
    </AuthProvider>
  );
}
