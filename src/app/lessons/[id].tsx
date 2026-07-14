import { Card } from "@/components/card";
import { ThemeText } from "@/components/ThemeText";
import { useThemeColors } from "@/hooks/useThemeColors";
import { getThemePalette, useThemeMode } from "@/context/ThemeModeContext";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import * as DocumentPicker from "expo-document-picker";
import * as Sharing from "expo-sharing";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Modal, TextInput, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Course, CourseMaterial } from "@/lib/sqliteDatabase";
import { StudyPokemon } from "@/components/StudyPokemon";
import { ConfirmModal } from "@/components/ConfirmModal";
import * as FileSystem from 'expo-file-system/legacy';

/** Read a local file URI (file:// or content://) as base64 using fetch + btoa */
async function fileUriToBase64(uri: string): Promise<string> {
  const response = await fetch(uri);
  const buffer = await response.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export default function LessonDetailPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const courseId = Number(id);
  const router = useRouter();
  const colors = useThemeColors();
  const { mode } = useThemeMode();
  const palette = getThemePalette(colors, mode);
  const db = useSQLiteContext();

  const [course, setCourse] = useState<Course | null>(null);
  const [deptName, setDeptName] = useState<string>("");
  const [materials, setMaterials] = useState<CourseMaterial[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal state
  const [isModalVisible, setModalVisible] = useState(false);
  const [newLectureName, setNewLectureName] = useState("");
  const [newFileName, setNewFileName] = useState("");
  const [newFileUri, setNewFileUri] = useState<string | null>(null);
  const [newFileBase64, setNewFileBase64] = useState<string | null>(null);
  const [isPickingFile, setIsPickingFile] = useState(false);

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string | null } | null>(null);

  const fetchCourse = async () => {
    try {
      const result = await db.getFirstAsync<Course & { dept_name: string }>(
        `SELECT c.*, d.name as dept_name FROM courses c 
         JOIN departments d ON c.department_id = d.id 
         WHERE c.id = ?`,
        [courseId]
      );
      if (result) {
        setCourse(result);
        setDeptName(result.dept_name);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchMaterials = async () => {
    try {
      const result = await db.getAllAsync<CourseMaterial>(
        'SELECT * FROM course_materials WHERE course_id = ? ORDER BY id ASC',
        [courseId]
      );
      setMaterials(result);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCourse();
    fetchMaterials();
  }, [courseId]);

  const handleAddMaterial = async () => {
    if (!newLectureName.trim()) return;
    try {
      await db.runAsync(
        'INSERT INTO course_materials (course_id, lecture_name, file_name, file_uri, file_base64) VALUES (?, ?, ?, ?, ?)',
        [courseId, newLectureName.trim(), newFileName.trim() || null, newFileUri, newFileBase64]
      );
      closeMaterialModal();
      fetchMaterials();
    } catch (e) {
      console.error(e);
    }
  };

  const closeMaterialModal = () => {
    setModalVisible(false);
    setNewLectureName("");
    setNewFileName("");
    setNewFileUri(null);
    setNewFileBase64(null);
  };

  const handlePickPdf = async () => {
    setIsPickingFile(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "application/pdf",
        multiple: false,
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;

      const asset = result.assets[0];
      const isPdf = asset.mimeType === "application/pdf" || asset.name.toLowerCase().endsWith(".pdf");
      if (!isPdf) {
        Alert.alert("Invalid file", "Please select a PDF file.");
        return;
      }

      // Read PDF as base64 for reliable persistence in DB
      const base64Pdf = await fileUriToBase64(asset.uri);

      // Write the PDF file to the documents directory for opening later
      const safeFileName = `${Date.now()}-${asset.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const materialsDir = `${FileSystem.documentDirectory}materials/`;
      const dirInfo = await FileSystem.getInfoAsync(materialsDir);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(materialsDir, { intermediates: true });
      }
      const fileUri = `${materialsDir}${safeFileName}`;
      await FileSystem.writeAsStringAsync(fileUri, base64Pdf, { encoding: FileSystem.EncodingType.Base64 });

      setNewFileName(asset.name);
      setNewFileUri(fileUri);
      setNewFileBase64(base64Pdf);
    } catch (error) {
      console.error("Could not select PDF:", error);
      Alert.alert("Error", "Could not add this PDF. Try again.");
    } finally {
      setIsPickingFile(false);
    }
  };

  const handleDeleteMaterial = async () => {
    if (!deleteTarget) return;
    try {
      await db.runAsync('DELETE FROM course_materials WHERE id = ?', [deleteTarget.id]);
      fetchMaterials();
    } catch (e) {
      console.error(e);
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleOpenPdf = async (fileUri: string) => {
    try {
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert("Unable to open PDF", "No app available to open this file.");
        return;
      }
      await Sharing.shareAsync(fileUri, { mimeType: 'application/pdf' });
    } catch (e) {
      console.error(e);
      Alert.alert("Error", "Could not open the PDF.");
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: palette.tint }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={palette.graywhite} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: palette.tint || "#DC0A2D" }]}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Back button */}
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <ThemeText variant="body2" style={{ color: 'white' }}>← Back</ThemeText>
        </Pressable>

        {/* Course Header */}
        <Card style={[styles.hero, { backgroundColor: palette.accentSoft || "#FFF4D6", borderWidth: 1, borderColor: palette.accentSoft || "#FFF4D6" }]}>
          <View style={styles.heroTop}>
            <View style={{ flex: 1 }}>
              <ThemeText variant="headline" color="graydark">{course?.title || "Cours"}</ThemeText>
              <View style={styles.metaRow}>
                {course?.course_code ? (
                  <View style={[styles.pill, { backgroundColor: palette.graybackground }]}>
                    <ThemeText variant="subtitle3" color="grayMedium">{course.course_code}</ThemeText>
                  </View>
                ) : null}
                <View style={[styles.pill, { backgroundColor: palette.tint || "#DC0A2D" }]}>
                  <ThemeText variant="subtitle3" style={{ color: 'white' }}>{deptName}</ThemeText>
                </View>
              </View>
            </View>
            <StudyPokemon compact id={courseId} message="Course companion" />
          </View>
        </Card>

        {/* Section Title */}
        <View style={styles.sectionHeader}>
          <ThemeText variant="subtitle1" style={{ color: 'white' }}>Lessons & Materials</ThemeText>
          <ThemeText variant="body3" style={{ color: 'rgba(255,255,255,0.7)' }}>
            {materials.length} lesson{materials.length !== 1 ? 's' : ''}
          </ThemeText>
        </View>

        {/* Materials List */}
        {materials.length === 0 && (
          <Card style={[styles.emptyCard, { backgroundColor: palette.graywhite }]}>
            <ThemeText variant="body2" color="grayMedium" style={{ textAlign: 'center' }}>
              No lessons for this course.{"\n"}Add your first lesson below!    </ThemeText>
          </Card>
        )}

        {materials.map((mat) => (
          <Card key={mat.id} style={[styles.materialCard, { backgroundColor: palette.graywhite, borderWidth: 1, borderColor: palette.accentSoft || "#FFF4D6" }]}>
            <View style={styles.materialHeader}>
              <View style={{ flex: 1 }}>
                <ThemeText variant="subtitle2" color="graydark">{mat.lecture_name}</ThemeText>
                {mat.file_name ? (
                  <ThemeText variant="body3" color="grayMedium">{mat.file_name}</ThemeText>
                ) : null}
              </View>
              <Pressable onPress={() => setDeleteTarget({ id: mat.id, name: mat.lecture_name })} style={styles.deleteBtn}>
                <ThemeText variant="body3" style={{ color: '#D32F2F' }}>✕</ThemeText>
              </Pressable>
            </View>

            {/* Action Buttons */}
            <View style={styles.actionRow}>
              {mat.file_uri ? (
                <Pressable
                  onPress={() => handleOpenPdf(mat.file_uri!)}
                  style={[styles.actionBtn, { backgroundColor: palette.graybackground }]}
                >
                  <ThemeText variant="subtitle3" color="graydark">📄 Open PDF</ThemeText>
                </Pressable>
              ) : null}
              <Pressable
                onPress={() => router.push(`/lessons/flashcards?materialId=${mat.id}&courseId=${courseId}` as any)}
                style={[styles.actionBtn, { backgroundColor: palette.accentMint || "#10B981" }]}
              >
                <ThemeText variant="subtitle3" style={{ color: 'white' }}>📇 Flashcards</ThemeText>
              </Pressable>
              <Pressable
                onPress={() => router.push(`/lessons/quiz?materialId=${mat.id}&courseId=${courseId}` as any)}
                style={[styles.actionBtn, { backgroundColor: palette.accentBlue || "#3B82F6" }]}
              >
                <ThemeText variant="subtitle3" style={{ color: 'white' }}>📝 Quiz</ThemeText>
              </Pressable>
            </View>
          </Card>
        ))}

        {/* Add Material Button */}
        <Pressable onPress={() => setModalVisible(true)} style={[styles.addBtn, { backgroundColor: palette.tint || "#DC0A2D", borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' }]}>
          <ThemeText variant="body2" style={{ color: 'white', textAlign: 'center' }}>+ Add a lesson</ThemeText>
        </Pressable>

        {/* Add Material Modal */}
        <Modal visible={isModalVisible} transparent animationType="fade" onRequestClose={closeMaterialModal}>
          <View style={styles.modalBackdrop}>
            <View style={[styles.modalContent, { backgroundColor: palette.graywhite || "#FFF" }]}>
              <ThemeText variant="headline" color="graydark">New lesson</ThemeText>

              <ThemeText variant="subtitle2" color="grayMedium" style={{ marginTop: 16 }}>Lesson name *</ThemeText>
              <TextInput
                style={[styles.input, { borderColor: palette.graylight || '#ccc', color: palette.graydark }]}
                value={newLectureName}
                onChangeText={setNewLectureName}
                placeholder="Ex: Chapter 3 — Derivatives"
                placeholderTextColor={palette.grayMedium}
              />

              <ThemeText variant="subtitle2" color="grayMedium" style={{ marginTop: 12 }}>PDF attachment (optional)</ThemeText>
              <Pressable
                onPress={handlePickPdf}
                disabled={isPickingFile}
                style={[styles.filePicker, { borderColor: palette.graylight || '#ccc', backgroundColor: palette.graybackground }]}
              >
                <ThemeText variant="body2" color="graydark">
                  {isPickingFile ? "Opening files…" : newFileName ? "Change PDF" : "Choose a PDF"}
                </ThemeText>
              </Pressable>
              {newFileName ? (
                <View style={[styles.selectedFile, { backgroundColor: palette.accentSoft || "#FFF4D6" }]}>
                  <ThemeText variant="body3" color="graydark">Selected PDF: {newFileName}</ThemeText>
                </View>
              ) : null}

              <View style={styles.modalActions}>
                <Pressable onPress={closeMaterialModal} style={styles.modalCancelBtn}>
                  <ThemeText variant="body2" color="graydark">Cancel</ThemeText>
                </Pressable>
                <Pressable onPress={handleAddMaterial} style={[styles.modalAddBtn, { backgroundColor: palette.tint }]}>
                  <ThemeText variant="body2" style={{ color: 'white' }}>Add</ThemeText>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        <ConfirmModal
          visible={deleteTarget !== null}
          title="Delete lesson"
          message={`Delete "${deleteTarget?.name || "this lesson"}"?`}
          confirmLabel="Delete"
          cancelLabel="Cancel"
          destructive
          onConfirm={handleDeleteMaterial}
          onCancel={() => setDeleteTarget(null)}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 12, gap: 12, paddingBottom: 60 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  backBtn: { paddingVertical: 4, paddingHorizontal: 4, alignSelf: 'flex-start' },
  hero: { borderRadius: 18, padding: 14 },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  metaRow: { flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  pill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 4, marginTop: 4 },
  emptyCard: { borderRadius: 16, padding: 24 },
  materialCard: { borderRadius: 16, padding: 12 },
  materialHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  deleteBtn: { padding: 4, borderRadius: 8 },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  actionBtn: { flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  addBtn: { borderRadius: 12, padding: 16, marginTop: 8 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { borderRadius: 16, padding: 20, elevation: 5 },
  input: { borderWidth: 1, borderRadius: 8, padding: 12, marginTop: 4, fontSize: 16 },
  filePicker: { borderWidth: 1, borderRadius: 8, padding: 12, marginTop: 4, alignItems: 'center' },
  selectedFile: { borderRadius: 8, padding: 10, marginTop: 8 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 24, gap: 12 },
  modalCancelBtn: { padding: 12 },
  modalAddBtn: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 8 },
});
