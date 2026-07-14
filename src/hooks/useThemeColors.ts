import { Colors } from "@/constants/Colors";
import { getThemePalette, useThemeMode } from "@/context/ThemeModeContext";
import { useColorScheme } from "react-native";

export function useThemeColors() {
    const theme = useColorScheme() ?? "light";
    const baseColors = Colors[theme === "dark" ? "dark" : "light"];
    const { mode } = useThemeMode();

    return getThemePalette(baseColors, mode);
}