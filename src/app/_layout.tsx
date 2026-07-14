import { getThemePalette, ThemeModeProvider, useThemeMode } from "@/context/ThemeModeContext";
import { SettingsProvider } from "@/context/SettingsContext";
import { useThemeColors } from "@/hooks/useThemeColors";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as NavigationBar from "expo-navigation-bar";
import { Link, Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { SQLiteProvider } from "expo-sqlite";
import { initDatabase } from "@/lib/sqliteDatabase";

const queryClient = new QueryClient();
const primaryNavigation = [
  { label: "Home", href: "/" },
  { label: "Courses", href: "/lessons" },
  { label: "Schedule", href: "/calendar" },
  { label: "Settings", href: "/settings" },
] as const;
export default function RootLayout() {
  return (
    <SQLiteProvider databaseName="studymate.db" onInit={initDatabase}>
      <QueryClientProvider client={queryClient}>
        <ThemeModeProvider>
          <SettingsProvider>
            <RootContent />
          </SettingsProvider>
        </ThemeModeProvider>
      </QueryClientProvider>
    </SQLiteProvider>
  );
}

function RootContent() {
  const colors = useThemeColors();
  const { mode } = useThemeMode();
  const palette = getThemePalette(colors, mode);

  useEffect(() => {
    NavigationBar.setVisibilityAsync("hidden");
  }, []);

  return (
    <>
      <StatusBar style="auto" />
      <View style={[styles.shell, { backgroundColor: palette.tint || "#DC0A2D" }]}>
        <View style={[styles.stackContainer, { paddingBottom: 68 }]}>
          <Stack screenOptions={{ headerShown: false }} />
        </View>
        <View style={[styles.navigationBar, { backgroundColor: palette.graywhite || "#FFFFFF" }]}>
          {primaryNavigation.map((item) => (
            <Link key={item.href} href={item.href as any} asChild>
              <Pressable style={styles.navigationItem} accessibilityRole="button">
                <ThemeText variant="subtitle3" color="graydark" style={{ textAlign: "center" }}>
                  {item.label}
                </ThemeText>
              </Pressable>
            </Link>
          ))}
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: "#f08888ff" },
  stackContainer: { flex: 1 },
  navigationBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    minHeight: 64,
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.08)",
    paddingHorizontal: 4,
    paddingVertical: 8,
  },
  navigationItem: {
    flex: 1,
    minHeight: 48,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 2,
  },
});
import { ThemeText } from "@/components/ThemeText";
