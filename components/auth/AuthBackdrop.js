import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

// Loaded on these pages only: the app's shared bundle does not carry WebGL
// code for the Timer. Until it arrives, the container's still CSS gradient
// (same colours) is already the ground.
const GradientWave = dynamic(() => import("../ui/GradientWave"), { ssr: false });

// The ground of every page before the app: 21st.dev's Gradient Wave in the
// app's own light colours — cream canvas, surface white and the mint family,
// the same values as --bt-bg, --bt-surface, --bt-accent-bg, --bt-mint-strong
// and --bt-accent-border. Dark theme uses the dark canvas and the ink greens.
// It is mounted once in _app for all these routes, so moving from sign-up to
// onboarding does not restart it.
//
// Slow on purpose, about a fourteenth of the component's default speed: in
// ten seconds the waves have barely drifted. Noticed as alive, never watched.
// The seed starts it on a composition where a mint wave crosses mid-page.
const LIGHT = ["#F4F1EA", "#E2F7ED", "#FFFDFB", "#C6EED9", "#F6F3EC", "#EAFBF4"];
const DARK = ["#12100E", "#15231E", "#1A1714", "#0D2B22", "#12100E", "#0F3A2C"];

function isDark() {
  return typeof document !== "undefined" && document.documentElement.classList.contains("dark");
}

export default function AuthBackdrop() {
  const [dark, setDark] = useState(isDark);

  useEffect(() => {
    const root = document.documentElement;
    const read = () => setDark(root.classList.contains("dark"));
    read();
    const observer = new MutationObserver(read);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return (
    <div className="bt-auth-backdrop" aria-hidden="true">
      <GradientWave colors={dark ? DARK : LIGHT} noiseSpeed={0.0000007} fps={24} scale={0.5} seed={171000} />
    </div>
  );
}
