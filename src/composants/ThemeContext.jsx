import { createContext, useContext, useState } from "react";

export const THEMES = {
  dark: {
    bg: "#0d1117",
    card: "#161b22",
    card2: "#1c2333",
    border: "#30363d",
    accent: "#3b82f6",
    accentH: "#2563eb",
    accentSoft: "rgba(59,130,246,0.13)",
    text: "#f0f6fc",
    textSub: "#8b949e",
    textMuted: "#6e7681",
    input: "#0d1117",
    danger: "#f85149",
    success: "#3fb950",
    shadow: "rgba(0,0,0,0.5)",
    spinnerBg: "rgba(13,17,23,0.85)",
  },
  light: {
    bg: "#f6f8fa",
    card: "#ffffff",
    card2: "#f0f4f8",
    border: "#d0d7de",
    accent: "#2563eb",
    accentH: "#1d4ed8",
    accentSoft: "rgba(37,99,235,0.09)",
    text: "#1f2328",
    textSub: "#656d76",
    textMuted: "#9ca3af",
    input: "#ffffff",
    danger: "#cf222e",
    success: "#1a7f37",
    shadow: "rgba(0,0,0,0.08)",
    spinnerBg: "rgba(246,248,250,0.88)",
  },
};

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState("dark");
  const toggle = () => setTheme(t => t === "dark" ? "light" : "dark");
  return (
    <ThemeContext.Provider value={{ theme, toggle, c: THEMES[theme] }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
