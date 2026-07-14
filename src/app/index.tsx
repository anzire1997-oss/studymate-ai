import { Card } from "@/components/card";
import { ThemeText } from "@/components/ThemeText";
import { getThemePalette, useThemeMode } from "@/context/ThemeModeContext";
import { useThemeColors } from "@/hooks/useThemeColors";
import { useFocusEffect, useRouter } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type ProjectStats = {
  courses: number;
  materials: number;
  flashcards: number;
  questions: number;
};

type CoursePreview = {
  id: number;
  title: string | null;
  course_code: string;
  department_name: string;
  material_count: number;
};

const emptyStats: ProjectStats = { courses: 0, materials: 0, flashcards: 0, questions: 0 };

export default function Index() {
  const router = useRouter();
  const db = useSQLiteContext();
  const colors = useThemeColors();
  const { mode } = useThemeMode();
  const palette = getThemePalette(colors, mode);
  const [stats, setStats] = useState<ProjectStats>(emptyStats);
  const [courses, setCourses] = useState<CoursePreview[]>([]);
  const [loading, setLoading] = useState(true);

  const loadHome = useCallback(async () => {
    setLoading(true);
    try {
      const [courseCount, materialCount, flashcardCount, questionCount, recentCourses] = await Promise.all([
        db.getFirstAsync<{ count: number }>("SELECT COUNT(*) AS count FROM courses"),
        db.getFirstAsync<{ count: number }>("SELECT COUNT(*) AS count FROM course_materials"),
        db.getFirstAsync<{ count: number }>("SELECT COUNT(*) AS count FROM flashcards"),
        db.getFirstAsync<{ count: number }>("SELECT COUNT(*) AS count FROM quiz_questions"),
        db.getAllAsync<CoursePreview>(`
          SELECT c.id, c.title, c.course_code, d.name AS department_name, COUNT(m.id) AS material_count
          FROM courses c
          JOIN departments d ON d.id = c.department_id
          LEFT JOIN course_materials m ON m.course_id = c.id
          GROUP BY c.id
          ORDER BY c.id DESC
          LIMIT 3
        `),
      ]);

      setStats({
        courses: courseCount?.count ?? 0,
        materials: materialCount?.count ?? 0,
        flashcards: flashcardCount?.count ?? 0,
        questions: questionCount?.count ?? 0,
      });
      setCourses(recentCourses);
    } catch (error) {
      console.error("Failed to load home:", error);
    } finally {
      setLoading(false);
    }
  }, [db]);

  useFocusEffect(useCallback(() => {
    void loadHome();
  }, [loadHome]));

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: palette.tint || "#DC0A2D" }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View style={[styles.pokeballWrap, { backgroundColor: "rgba(255,255,255,0.18)" }]}>
            <Image source={require("@/assets/images/Pokeball.png")} style={styles.pokeball} />
          </View>
          <View style={{ flex: 1 }}>
            <ThemeText variant="headline" style={{ color: "white" }}>Studymate AI</ThemeText>
            <ThemeText variant="body2" style={{ color: "rgba(255,255,255,0.82)" }}>
              Your study space, organized by course.
            </ThemeText>
          </View>
        </View>

        <Card style={[styles.hero, { backgroundColor: palette.accentSoft || "#FFF4D6" }]}>
          <ThemeText variant="subtitle1" color="graydark">Ready for your next session?</ThemeText>
          <ThemeText variant="body2" color="grayMedium" style={{ marginTop: 4 }}>
            Add a lesson, then create flashcards or a quiz with AI.
          </ThemeText>
          <Pressable onPress={() => router.push("/lessons")} style={[styles.primaryButton, { backgroundColor: palette.tint || "#DC0A2D" }]}>
            <ThemeText variant="subtitle2" style={{ color: "white", textAlign: "center" }}>View my courses</ThemeText>
          </Pressable>
        </Card>

        <View style={styles.sectionHeader}>
          <ThemeText variant="subtitle1" style={{ color: "white" }}>My study project</ThemeText>
          {loading ? <ActivityIndicator color="white" /> : null}
        </View>

        <View style={styles.statsGrid}>
          {[
            { label: "Courses", value: stats.courses, tone: palette.accentBlue || "#3B82F6" },
            { label: "Lessons", value: stats.materials, tone: palette.accent || "#F59E0B" },
            { label: "Cards", value: stats.flashcards, tone: palette.accentMint || "#10B981" },
            { label: "Questions", value: stats.questions, tone: "#8B5CF6" },
          ].map((item) => (
            <Card key={item.label} style={[styles.statCard, { backgroundColor: palette.graywhite || "#FFFFFF" }]}>
              <View style={[styles.statDot, { backgroundColor: item.tone }]} />
              <ThemeText variant="headline" color="graydark">{item.value}</ThemeText>
              <ThemeText variant="body3" color="grayMedium">{item.label}</ThemeText>
            </Card>
          ))}
        </View>

        <View style={styles.sectionHeader}>
          <ThemeText variant="subtitle1" style={{ color: "white" }}>Recent courses</ThemeText>
          <Pressable onPress={() => router.push("/lessons")}>
            <ThemeText variant="subtitle3" style={{ color: "rgba(255,255,255,0.86)" }}>View all</ThemeText>
          </Pressable>
        </View>

        {courses.length === 0 && !loading ? (
          <Card style={[styles.emptyCard, { backgroundColor: palette.graywhite || "#FFFFFF" }]}>
            <ThemeText variant="subtitle2" color="graydark">Your adventure starts here</ThemeText>
            <ThemeText variant="body3" color="grayMedium" style={{ marginTop: 4 }}>
              Create your first course to organize your lessons and revision.
            </ThemeText>
          </Card>
        ) : courses.map((course) => (
          <Pressable key={course.id} onPress={() => router.push(`/lessons/${course.id}` as any)}>
            <Card style={[styles.courseCard, { backgroundColor: palette.graywhite || "#FFFFFF" }]}>
              <View style={{ flex: 1 }}>
                <ThemeText variant="subtitle2" color="graydark">{course.title || "Untitled course"}</ThemeText>
                <ThemeText variant="body3" color="grayMedium">{course.course_code} · {course.department_name}</ThemeText>
              </View>
              <View style={[styles.lessonPill, { backgroundColor: palette.accentSoft || "#FFF4D6" }]}>
                <ThemeText variant="subtitle3" color="graydark">{course.material_count} lesson{course.material_count > 1 ? "s" : ""}</ThemeText>
              </View>
            </Card>
          </Pressable>
        ))}

        <Card style={[styles.planningCard, { backgroundColor: "rgba(255,255,255,0.94)" }]}>
          <ThemeText variant="subtitle2" color="graydark">Plan my week</ThemeText>
          <ThemeText variant="body3" color="grayMedium" style={{ marginTop: 4 }}>
            Check your schedule and add revision slots.
          </ThemeText>
          <Pressable onPress={() => router.push("/calendar")} style={[styles.secondaryButton, { borderColor: palette.tint || "#DC0A2D" }]}>
            <ThemeText variant="subtitle3" style={{ color: palette.tint || "#DC0A2D" }}>Open schedule</ThemeText>
          </Pressable>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 12, gap: 12, paddingBottom: 88 },
  header: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6 },
  pokeballWrap: { width: 52, height: 52, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  pokeball: { width: 36, height: 36 },
  hero: { borderRadius: 18, padding: 16 },
  primaryButton: { borderRadius: 12, paddingVertical: 12, marginTop: 14 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4, paddingHorizontal: 2 },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  statCard: { width: "48%", borderRadius: 14, padding: 12 },
  statDot: { width: 8, height: 8, borderRadius: 4, marginBottom: 5 },
  emptyCard: { borderRadius: 14, padding: 16 },
  courseCard: { borderRadius: 14, padding: 14, flexDirection: "row", alignItems: "center", gap: 10 },
  lessonPill: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5 },
  planningCard: { borderRadius: 16, padding: 16, marginTop: 2 },
  secondaryButton: { alignSelf: "flex-start", borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, marginTop: 12 },
});
