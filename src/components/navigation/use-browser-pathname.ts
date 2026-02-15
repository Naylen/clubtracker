"use client";

import { useEffect, useState } from "react";

export function useBrowserPathname(fallback: string) {
  const [pathname, setPathname] = useState(fallback);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    let previous = window.location.pathname;
    setPathname(previous);

    const timer = window.setInterval(() => {
      const current = window.location.pathname;
      if (current !== previous) {
        previous = current;
        setPathname(current);
      }
    }, 200);

    return () => window.clearInterval(timer);
  }, []);

  return pathname;
}
