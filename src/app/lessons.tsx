import { Card } from "@/components/card";
import { ThemeText } from "@/components/ThemeText";
import { useThemeColors } from "@/hooks/useThemeColors";
import { useSettings } from "@/context/SettingsContext";
import { getThemePalette, useThemeMode } from "@/context/ThemeModeContext";
import { type DeptFilter } from "@/components/FilterButton";
import { Link } from "expo-router";
import { Modal, TextInput, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSQLiteContext } from "expo-sqlite";
import { useEffect, useState } from "react";
import { Course } from "@/lib/sqliteDatabase";
import { StudyPokemon } from "@/components/StudyPokemon";
import { ConfirmModal } from "@/components/ConfirmModal";

export default function LessonsPage() {
  const colors = useThemeColors();
  const { mode } = useThemeMode();
  const palette = getThemePalette(colors, mode);
  const db = useSQLiteContext();
  const { defaultDept, isLoading: isSettingsLoading } = useSettings();
  const [courses, setCourses] = useState<Course[]>([]);

  // Modal State
  const [isModalVisible, setModalVisible] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newCode, setNewCode] = useState("");
  const [newDept, setNewDept] = useState<DeptFilter | "ALL">(defaultDept === 'all' ? 'ALL' : defaultDept);

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; title: string | null } | null>(null);

  const fetchCourses = async () => {
    try {
      if (defaultDept === 'all') {
        const result = await db.getAllAsync<Course>('SELECT * FROM courses ORDER BY title ASC');
        setCourses(result);
      } else {
        const query = `
          SELECT c.* 
          FROM courses c 
          JOIN departments d ON c.department_id = d.id 
          WHERE d.name = ? OR d.name = 'ALL'
          ORDER BY c.title ASC
        `;
        const result = await db.getAllAsync<Course>(query, [defaultDept]);
        setCourses(result);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (!isSettingsLoading) {
      fetchCourses();
      setNewDept(defaultDept === 'all' ? 'ALL' : defaultDept);
    }
  }, [defaultDept, isSettingsLoading]);

  const handleDeleteCourse = async () => {
    if (!deleteTarget) return;
    try {
      await db.runAsync('DELETE FROM courses WHERE id = ?', [deleteTarget.id]);
      fetchCourses();
    } catch (e) {
      console.error(e);
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleAddCourse = async () => {
    if (!newTitle.trim()) return;
    try {
      let deptName = newDept.toUpperCase();
      let deptRes = await db.getFirstAsync<{id: number}>('SELECT id FROM departments WHERE name = ?', [deptName]);
      let deptId;
      if (!deptRes) {
        const insertDept = await db.runAsync('INSERT INTO departments (name) VALUES (?)', [deptName]);
        deptId = insertDept.lastInsertRowId;
      } else {
        deptId = deptRes.id;
      }

      await db.runAsync('INSERT INTO courses (department_id, course_code, title) VALUES (?, ?, ?)', [deptId, newCode.trim(), newTitle.trim()]);
      setModalVisible(false);
      setNewTitle("");
      setNewCode("");
      fetchCourses();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <SafeAreaView style={StyleSheet.flatten([styles.container, { backgroundColor: palette.tint || "#DC0A2D" }])}>
      <ScrollView contentContainerStyle={styles.content}>
        <Card style={[styles.hero, { backgroundColor: palette.accentSoft || "#FFF4D6", borderWidth: 1, borderColor: palette.accentSoft || "#FFF4D6" }]}> 
          <ThemeText variant="headline" color="graydark">Lessons</ThemeText>
          <ThemeText variant="body2" color="grayMedium">Course program, sheets and progress by subject.</ThemeText>
        </Card>

        {courses.map((item) => (
          <Link key={item.id} href={`/lessons/${item.id}` as any} asChild>
            <Pressable onLongPress={() => setDeleteTarget({ id: item.id, title: item.title })}>
              <Card style={[styles.lessonCard, { backgroundColor: palette.graywhite || "#FFFFFF", borderWidth: 1, borderColor: palette.accentSoft || "#FFF4D6" }]}> 
                <View style={styles.cardRow}>
                  <StudyPokemon compact id={item.id} message="Course companion" />
                  <View style={{ flex: 1 }}>
                    <ThemeText variant="subtitle2" color="graydark">{item.title}</ThemeText>
                    <ThemeText variant="body3" color="grayMedium">{item.course_code}</ThemeText>
                  </View>
                </View>
              </Card>
            </Pressable>
          </Link>
        ))}

        <Pressable onPress={() => setModalVisible(true)} style={[styles.addBtn, { backgroundColor: palette.tint || "#DC0A2D" }]}>
          <ThemeText variant="body2" style={{color: 'white', textAlign: 'center'}}>+ Add a course</ThemeText>
        </Pressable>

        {/* Add Course Modal */}
        <Modal visible={isModalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
          <View style={styles.modalBackdrop}>
            <View style={[styles.modalContent, { backgroundColor: palette.graywhite || "#FFF" }]}>
              <ThemeText variant="headline" color="graydark">New course</ThemeText>
              
              <ThemeText variant="subtitle2" color="grayMedium" style={{ marginTop: 16 }}>Course name</ThemeText>
              <TextInput
                style={[styles.input, { borderColor: palette.graylight || '#ccc', color: palette.graydark }]}
                value={newTitle}
                onChangeText={setNewTitle}
                placeholder="Ex: Mathematical Analysis"
                placeholderTextColor={palette.grayMedium}
              />
              
              <ThemeText variant="subtitle2" color="grayMedium" style={{ marginTop: 12 }}>Course code</ThemeText>
              <TextInput
                style={[styles.input, { borderColor: palette.graylight || '#ccc', color: palette.graydark }]}
                value={newCode}
                onChangeText={setNewCode}
                placeholder="Ex: MATH201"
                placeholderTextColor={palette.grayMedium}
              />

              <ThemeText variant="subtitle2" color="grayMedium" style={{ marginTop: 12 }}>Department</ThemeText>
              <View style={styles.deptRow}>
                {(['ALL', 'ME', 'EEE', 'CSE'] as const).map((dept) => (
                  <Pressable 
                    key={dept} 
                    onPress={() => setNewDept(dept)}
                    style={[styles.deptChip, newDept === dept ? { backgroundColor: palette.tint } : { backgroundColor: palette.graybackground }]}
                  >
                    <ThemeText variant="body3" color={newDept === dept ? 'graywhite' : 'graydark'}>{dept}</ThemeText>
                  </Pressable>
                ))}
              </View>

              <View style={styles.modalActions}>
                <Pressable onPress={() => setModalVisible(false)} style={styles.modalCancelBtn}>
                  <ThemeText variant="body2" color="graydark">Cancel</ThemeText>
                </Pressable>
                <Pressable onPress={handleAddCourse} style={[styles.modalAddBtn, { backgroundColor: palette.tint }]}>
                  <ThemeText variant="body2" style={{ color: 'white' }}>Add</ThemeText>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        <ConfirmModal
          visible={deleteTarget !== null}
          title="Delete course"
          message={`Delete "${deleteTarget?.title || "this course"}" and all its lessons?`}
          confirmLabel="Delete"
          cancelLabel="Cancel"
          destructive
          onConfirm={handleDeleteCourse}
          onCancel={() => setDeleteTarget(null)}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 12, gap: 12 },
  hero: { borderRadius: 18, padding: 14 },
  lessonCard: { borderRadius: 16, padding: 12 },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  addBtn: { borderRadius: 12, padding: 16, marginTop: 20 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { borderRadius: 16, padding: 20, elevation: 5 },
  input: { borderWidth: 1, borderRadius: 8, padding: 12, marginTop: 4, fontSize: 16 },
  deptRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  deptChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 24, gap: 12 },
  modalCancelBtn: { padding: 12 },
  modalAddBtn: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 8 },
});
