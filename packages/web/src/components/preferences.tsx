"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";

interface Preferences {
  showRaw: boolean;
  setShowRaw: (v: boolean) => void;
  theme: "dark" | "light";
  toggleTheme: () => void;
}

const PreferencesContext = createContext<Preferences>({
  showRaw: false,
  setShowRaw: () => {},
  theme: "light",
  toggleTheme: () => {},
});

export function usePreferences() {
  return useContext(PreferencesContext);
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  // Always start with defaults to match server render; sync from localStorage after mount
  const [showRaw, setShowRawState] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("light");

  // Read stored preferences after hydration to avoid SSR mismatch
  useEffect(() => {
    try {
      if (localStorage.getItem("clw-raw") === "true") {
        setShowRawState(true);
      }
    } catch {}
    try {
      const stored = localStorage.getItem("clw-theme");
      if (stored === "light" || stored === "dark") {
        setTheme(stored);
        document.documentElement.setAttribute("data-theme", stored);
      }
    } catch {}
  }, []);

  const setShowRaw = useCallback((v: boolean) => {
    setShowRawState(v);
    localStorage.setItem("clw-raw", String(v));
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      localStorage.setItem("clw-theme", next);
      document.documentElement.setAttribute("data-theme", next);
      return next;
    });
  }, []);

  return (
    <PreferencesContext.Provider value={{ showRaw, setShowRaw, theme, toggleTheme }}>
      {children}
    </PreferencesContext.Provider>
  );
}
