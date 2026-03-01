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
  theme: "dark" | "light";
  toggleTheme: () => void;
}

const PreferencesContext = createContext<Preferences>({
  theme: "light",
  toggleTheme: () => {},
});

export function usePreferences() {
  return useContext(PreferencesContext);
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<"dark" | "light">("light");

  // Read stored preferences after hydration to avoid SSR mismatch
  useEffect(() => {
    try {
      const stored = localStorage.getItem("clw-theme");
      if (stored === "light" || stored === "dark") {
        setTheme(stored);
        document.documentElement.setAttribute("data-theme", stored);
      }
    } catch {}
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
    <PreferencesContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </PreferencesContext.Provider>
  );
}
