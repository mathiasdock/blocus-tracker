import { useEffect } from "react";
import { useRouter } from "next/router";

const ROUTE_CLASSES = ["bt-route-leaving", "bt-route-entering", "bt-route-entered"];

function routePath(url) {
  return String(url || "").split(/[?#]/)[0].replace(/\/$/, "") || "/";
}

export default function PageTransition() {
  const router = useRouter();

  useEffect(() => {
    const root = document.documentElement;
    let frameOne;
    let frameTwo;
    let enterTimer;
    let finishTimer;
    let startedAt = 0;
    let currentPath = routePath(router.asPath);
    let transitioning = false;

    const clearFrames = () => {
      cancelAnimationFrame(frameOne);
      cancelAnimationFrame(frameTwo);
      window.clearTimeout(enterTimer);
      window.clearTimeout(finishTimer);
    };

    const reset = () => {
      clearFrames();
      root.classList.remove(...ROUTE_CLASSES);
    };

    const start = (url, { shallow } = {}) => {
      if (shallow || routePath(url) === currentPath) return;
      clearFrames();
      transitioning = true;
      startedAt = performance.now();
      root.classList.remove("bt-route-entering", "bt-route-entered");
      root.classList.add("bt-route-leaving");
    };

    const complete = (url, { shallow } = {}) => {
      const shouldAnimate = transitioning && !shallow;
      currentPath = routePath(url);
      transitioning = false;
      if (!shouldAnimate) return;
      cancelAnimationFrame(frameOne);
      cancelAnimationFrame(frameTwo);
      window.clearTimeout(enterTimer);
      window.clearTimeout(finishTimer);
      const remainingExit = Math.max(0, 70 - (performance.now() - startedAt));
      enterTimer = window.setTimeout(() => {
        root.classList.remove("bt-route-leaving", "bt-route-entered");
        root.classList.add("bt-route-entering");
        frameOne = requestAnimationFrame(() => {
          frameTwo = requestAnimationFrame(() => {
            root.classList.remove("bt-route-entering");
            root.classList.add("bt-route-entered");
            finishTimer = window.setTimeout(reset, 230);
          });
        });
      }, remainingExit);
    };

    router.events.on("routeChangeStart", start);
    router.events.on("routeChangeComplete", complete);
    const fail = () => {
      transitioning = false;
      reset();
    };

    router.events.on("routeChangeError", fail);

    return () => {
      router.events.off("routeChangeStart", start);
      router.events.off("routeChangeComplete", complete);
      router.events.off("routeChangeError", fail);
      reset();
    };
  }, [router]);

  return null;
}
