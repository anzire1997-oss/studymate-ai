import { Card } from "@/components/card";
import { ThemeText } from "@/components/ThemeText";
import { useThemeMode, getThemePalette } from "@/context/ThemeModeContext";
import { useSettings } from "@/context/SettingsContext";
import { type DeptFilter } from "@/components/FilterButton";
import { useThemeColors } from "@/hooks/useThemeColors";
import { useSQLiteContext } from "expo-sqlite";
import { Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function SettingsPage() {
  const colors = useThemeColors();
  const { mode, setMode } = useThemeMode();
  const { defaultDept, setDefaultDept } = useSettings();
  const palette = getThemePalette(colors, mode);
  const db = useSQLiteContext();

  const handleClearData = () => {
    Alert.alert(
      "Clear data",
      "Are you sure you want to permanently delete ALL your data (courses, schedule, documents...)? This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear all",
          style: "destructive",
          onPress: async () => {
            try {
              // Delete all data from tables
              await db.execAsync(`
                DELETE FROM quiz_questions;
                DELETE FROM quizzes;
                DELETE FROM flashcards;
                DELETE FROM flashcard_decks;
                DELETE FROM course_schedules;
                DELETE FROM calendar_events;
                DELETE FROM course_materials;
                DELETE FROM courses;
                DELETE FROM departments;
                INSERT OR IGNORE INTO departments (id, name) VALUES (1, 'ME');
                INSERT OR IGNORE INTO departments (id, name) VALUES (2, 'EEE');
                INSERT OR IGNORE INTO departments (id, name) VALUES (3, 'CSE');
                INSERT OR IGNORE INTO departments (id, name) VALUES (4, 'ALL');
              `);
              Alert.alert("Success", "All data has been cleared.");
            } catch (error) {
              console.error(error);
              Alert.alert("Error", "Could not clear data.");
            }
          }
        }
      ]
    );
  };

  return (
    <SafeAreaView style={StyleSheet.flatten([styles.container, { backgroundColor: palette.tint || "#DC0A2D" }])}>
      <ScrollView contentContainerStyle={styles.content}>
        <Card style={[styles.hero, { backgroundColor: palette.accentSoft || "#FFF4D6" }]}>
          <ThemeText variant="headline" color="graydark">Settings</ThemeText>
          <ThemeText variant="body2" color="grayMedium">Choose the app's visual theme.</ThemeText>
        </Card>

        <Card style={[styles.card, { backgroundColor: palette.graywhite }]}>
          <ThemeText variant="subtitle2" color="graydark">Display mode</ThemeText>
          <Pressable onPress={() => setMode('color')} style={[styles.option, mode === 'color' ? { backgroundColor: palette.accentSoft || '#FFF4D6' } : { backgroundColor: palette.graybackground }]}>
            <ThemeText variant="body2" color="graydark">Pokémon colors</ThemeText>
          </Pressable>
          <Pressable onPress={() => setMode('mono')} style={[styles.option, mode === 'mono' ? { backgroundColor: palette.accentSoft || '#FFF4D6' } : { backgroundColor: palette.graybackground }]}>
            <ThemeText variant="body2" color="graydark">Black & white mode</ThemeText>
          </Pressable>
        </Card>

        <Card style={[styles.card, { backgroundColor: palette.graywhite, marginTop: 12 }]}>
          <ThemeText variant="subtitle2" color="graydark">Default department</ThemeText>
          <ThemeText variant="body3" color="grayMedium">Default filter used in the calendar and course lists.</ThemeText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
            {(['all', 'ME', 'EEE', 'CSE'] as DeptFilter[]).map((dept) => (
              <Pressable 
                key={dept} 
                onPress={() => setDefaultDept(dept)} 
                style={[
                  styles.option, 
                  { marginTop: 0, paddingHorizontal: 16 }, 
                  defaultDept === dept ? { backgroundColor: palette.tint } : { backgroundColor: palette.graybackground }
                ]}
              >
                <ThemeText variant="body2" color={defaultDept === dept ? "graywhite" : "graydark"}>
                  {dept === 'all' ? 'All' : dept}
                </ThemeText>
              </Pressable>
            ))}
          </View>
        </Card>

        <Card style={[styles.card, { backgroundColor: palette.graywhite, marginTop: 12 }]}>
          <ThemeText variant="subtitle2" color="graydark">Danger zone</ThemeText>
          <ThemeText variant="body3" color="grayMedium">Warning, these actions cannot be undone.</ThemeText>
          
          <Pressable onPress={handleClearData} style={[styles.option, { backgroundColor: '#FFEBEB', borderWidth: 1, borderColor: '#FFB8B8' }]}>
            <ThemeText variant="body2" style={{ color: '#D32F2F', textAlign: 'center', fontWeight: 'bold' }}>
              Clear all data
            </ThemeText>
          </Pressable>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 12, gap: 12 },
  hero: { borderRadius: 18, padding: 14 },
  card: { borderRadius: 16, padding: 12 },
  option: { borderRadius: 12, padding: 10, marginTop: 8 },
});
