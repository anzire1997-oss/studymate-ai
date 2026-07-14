import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

export type ThemeMode = "color" | "mono";

type ThemeModeContextValue = {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
};

const ThemeModeContext = createContext<ThemeModeContextValue | undefined>(undefined);

export function ThemeModeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>("color");

  const value = useMemo(() => ({ mode, setMode }), [mode]);

  return <ThemeModeContext.Provider value={value}>{children}</ThemeModeContext.Provider>;
}

export function useThemeMode() {
  const context = useContext(ThemeModeContext);

  if (!context) {
    throw new Error("useThemeMode must be used within ThemeModeProvider");
  }

  return context;
}

export function getThemePalette(baseColors: Record<string, string>, mode: ThemeMode) {
  if (mode !== "mono") return baseColors;

  return {
    ...baseColors,
    tint: "#111827",
    accent: "#111827",
    accentBlue: "#111827",
    accentMint: "#111827",
    accentSoft: "#F3F4F6",
    graywhite: "#FFFFFF",
    graybackground: "#F3F4F6",
    graylight: "#E5E7EB",
    grayMedium: "#374151",
    graydark: "#111827",
  };
}
