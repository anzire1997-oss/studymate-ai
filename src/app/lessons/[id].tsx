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
import { Course, CourseMaterial, CourseFile, PastExam } from "@/lib/sqliteDatabase";
import { StudyPokemon } from "@/components/StudyPokemon";
import { ConfirmModal } from "@/components/ConfirmModal";
import * as FileSystem from 'expo-file-system/legacy';
import PdfTextExtractor from "@/components/PdfTextExtractor";
import { generateChatResponse } from "@/lib/aiClient";

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

interface PickedFile {
  name: string;
  uri: string;
  base64: string;
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
  const [filesByMaterial, setFilesByMaterial] = useState<Record<number, CourseFile[]>>({});
  const [exams, setExams] = useState<PastExam[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal state (materials)
  const [isModalVisible, setModalVisible] = useState(false);
  const [newLectureName, setNewLectureName] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<PickedFile[]>([]);
  const [isPickingFile, setIsPickingFile] = useState(false);
  // Modal state (exam)
  const [isExamModalVisible, setExamModalVisible] = useState(false);
  const [examTitle, setExamTitle] = useState("");
  const [examYear, setExamYear] = useState("");
  const [examFile, setExamFile] = useState<PickedFile | null>(null);
  // Modal state (edit course)
  const [isEditVisible, setEditVisible] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editCode, setEditCode] = useState("");
  const [editDept, setEditDept] = useState("ALL");

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string | null } | null>(null);
  const [examDeleteTarget, setExamDeleteTarget] = useState<{ id: number; name: string | null } | null>(null);

  // AI correction state
  const [correctionExam, setCorrectionExam] = useState<PastExam | null>(null);
  const [correctionView, setCorrectionView] = useState<PastExam | null>(null);
  const [generatingCorrectionId, setGeneratingCorrectionId] = useState<number | null>(null);
  const [extractingCorrection, setExtractingCorrection] = useState(false);
  const [correctionText, setCorrectionText] = useState<string>("");

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

      // Fetch associated PDFs
      const files = await db.getAllAsync<CourseFile>(
        `SELECT cf.* FROM course_files cf
         JOIN course_materials cm ON cf.material_id = cm.id
         WHERE cm.course_id = ? ORDER BY cf.id ASC`,
        [courseId]
      );
      const grouped: Record<number, CourseFile[]> = {};
      for (const f of files) {
        if (!grouped[f.material_id]) grouped[f.material_id] = [];
        grouped[f.material_id].push(f);
      }
      setFilesByMaterial(grouped);

      // Fetch past exams
      const examsRes = await db.getAllAsync<PastExam>(
        'SELECT * FROM past_exams WHERE course_id = ? ORDER BY id ASC',
        [courseId]
      );
      setExams(examsRes);
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
      const first = selectedFiles[0];
      const result = await db.runAsync(
        'INSERT INTO course_materials (course_id, lecture_name, file_name, file_uri, file_base64) VALUES (?, ?, ?, ?, ?)',
        [courseId, newLectureName.trim(), first?.name || null, first?.uri || null, first?.base64 || null]
      );
      const materialId = result.lastInsertRowId;

      // Store every selected PDF in course_files (first is a duplicate reference only if useful)
      for (const file of selectedFiles) {
        await db.runAsync(
          'INSERT INTO course_files (material_id, file_name, file_uri, file_base64) VALUES (?, ?, ?, ?)',
          [materialId, file.name, file.uri, file.base64]
        );
      }

      closeMaterialModal();
      fetchMaterials();
    } catch (e) {
      console.error(e);
    }
  };

  const closeMaterialModal = () => {
    setModalVisible(false);
    setNewLectureName("");
    setSelectedFiles([]);
  };

  const handlePickPdf = async (multiple: boolean = false) => {
    setIsPickingFile(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "application/pdf",
        multiple,
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;

      const picked: PickedFile[] = [];
      for (const asset of result.assets) {
        const isPdf = asset.mimeType === "application/pdf" || asset.name.toLowerCase().endsWith(".pdf");
        if (!isPdf) {
          Alert.alert("Invalid file", "Please select a PDF file.");
          return;
        }

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

        picked.push({ name: asset.name, uri: fileUri, base64: base64Pdf });
      }

      if (multiple) {
        setSelectedFiles((prev) => [...prev, ...picked]);
      } else {
        setExamFile(picked[0] ?? null);
      }
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
      await db.runAsync('DELETE FROM course_files WHERE material_id = ?', [deleteTarget.id]);
      await db.runAsync('DELETE FROM course_materials WHERE id = ?', [deleteTarget.id]);
      fetchMaterials();
    } catch (e) {
      console.error(e);
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleAddExam = async () => {
    if (!examTitle.trim()) return;
    try {
      await db.runAsync(
        'INSERT INTO past_exams (course_id, title, year, file_name, file_uri, file_base64) VALUES (?, ?, ?, ?, ?, ?)',
        [courseId, examTitle.trim(), examYear.trim() || null, examFile?.name || null, examFile?.uri || null, examFile?.base64 || null]
      );
      closeExamModal();
      fetchMaterials();
    } catch (e) {
      console.error(e);
    }
  };

  const closeExamModal = () => {
    setExamModalVisible(false);
    setExamTitle("");
    setExamYear("");
    setExamFile(null);
  };

  const handleDeleteExam = async () => {
    if (!examDeleteTarget) return;
    try {
      await db.runAsync('DELETE FROM past_exams WHERE id = ?', [examDeleteTarget.id]);
      fetchMaterials();
    } catch (e) {
      console.error(e);
    } finally {
      setExamDeleteTarget(null);
    }
  };

  const handleEditCourse = async () => {
    if (!editTitle.trim() || !editCode.trim()) return;
    try {
      const deptRes = await db.getFirstAsync<{id: number}>('SELECT id FROM departments WHERE name = ?', [editDept]);
      if (!deptRes) return;
      await db.runAsync('UPDATE courses SET title = ?, course_code = ?, department_id = ? WHERE id = ?',
        [editTitle.trim(), editCode.trim(), deptRes.id, courseId]);
      setEditVisible(false);
      fetchCourse();
    } catch (e) {
      console.error(e);
    }
  };

  const openEditModal = () => {
    if (!course) return;
    setEditTitle(course.title || "");
    setEditCode(course.course_code || "");
    setEditDept(deptName);
    setEditVisible(true);
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

  const runCorrectionGeneration = async (exam: PastExam, contextText: string) => {
    const target = exam;
    setGeneratingCorrectionId(target.id);
    try {
      const truncated = contextText.slice(0, 12000);
      const prompt = [
        `You are an expert professor. Here is a past exam paper that was given to students:`,
        ``,
        truncated,
        ``,
        `Provide a detailed correction (answer key) for this exam. For each question, give a clear, step-by-step and pedagogical answer.`,
        `If you cannot fully answer a question from the given text, say so honestly.`,
        `Structure your answer question by question, using headings like "Q1.", "Q2.", etc. when possible.`,
      ].join("\n");

      const response = await generateChatResponse(prompt);
      const correction = response.trim();
      await db.runAsync('UPDATE past_exams SET correction = ? WHERE id = ?', [correction, target.id]);
      setCorrectionText(correction);
      setCorrectionView(target);
    } catch (e: any) {
      console.error("Correction generation error:", e);
      Alert.alert("Generation Error", e.message || String(e));
    } finally {
      setGeneratingCorrectionId(null);
      setExtractingCorrection(false);
      fetchMaterials();
    }
  };

  const handleGenerateCorrection = (exam: PastExam) => {
    // If a correction already exists, show it directly
    if (exam.correction) {
      setCorrectionText(exam.correction);
      setCorrectionView(exam);
      return;
    }
    if (!exam.file_base64) {
      Alert.alert("No PDF", "This exam has no PDF attachment to extract the questions from.");
      return;
    }
    setCorrectionExam(exam);
    setExtractingCorrection(true);
  };

  const handleCorrectionExtracted = (text: string) => {
    if (correctionExam) {
      runCorrectionGeneration(correctionExam, text);
    } else {
      setExtractingCorrection(false);
    }
  };

  const handleCorrectionExtractionError = (err: Error) => {
    console.warn('Correction PDF extraction failed, fallback:', err.message);
    if (correctionExam) {
      runCorrectionGeneration(correctionExam, "");
    } else {
      setExtractingCorrection(false);
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
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <ThemeText variant="headline" color="graydark">{course?.title || "Cours"}</ThemeText>
                <Pressable onPress={openEditModal} style={[styles.editBtn, { backgroundColor: palette.graybackground, borderRadius: 6 }]}>
                  <ThemeText variant="body3" color="grayMedium">Edit</ThemeText>
                </Pressable>
              </View>
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

        {materials.map((mat) => {
          const matFiles = filesByMaterial[mat.id] || [];
          // Fall back to legacy single-file columns
          const legacyUri = mat.file_uri;
          const hasLegacyFile = !!legacyUri && matFiles.length === 0;
          return (
            <Card key={mat.id} style={[styles.materialCard, { backgroundColor: palette.graywhite, borderWidth: 1, borderColor: palette.accentSoft || "#FFF4D6" }]}>
              <View style={styles.materialHeader}>
                <View style={{ flex: 1 }}>
                  <ThemeText variant="subtitle2" color="graydark">{mat.lecture_name}</ThemeText>
                  {matFiles.length > 0 ? (
                    <ThemeText variant="body3" color="grayMedium">{matFiles.length} PDF{matFiles.length !== 1 ? 's' : ''}</ThemeText>
                  ) : null}
                </View>
                <Pressable onPress={() => setDeleteTarget({ id: mat.id, name: mat.lecture_name })} style={styles.deleteBtn}>
                  <ThemeText variant="body3" style={{ color: '#D32F2F' }}>✕</ThemeText>
                </Pressable>
              </View>

              {/* PDF attachments */}
              {(hasLegacyFile || matFiles.length > 0) && (
                <View style={styles.fileList}>
                  {hasLegacyFile
                    ? (
                      <Pressable onPress={() => handleOpenPdf(legacyUri!)} style={[styles.fileChip, { backgroundColor: palette.graybackground }]}>
                        <ThemeText variant="body3" color="graydark" numberOfLines={1}>📄 {mat.file_name || "PDF"}</ThemeText>
                      </Pressable>
                    )
                    : matFiles.map((f) => (
                      <Pressable key={f.id} onPress={() => handleOpenPdf(f.file_uri!)} style={[styles.fileChip, { backgroundColor: palette.graybackground }]}>
                        <ThemeText variant="body3" color="graydark" numberOfLines={1}>📄 {f.file_name || "PDF"}</ThemeText>
                      </Pressable>
                    ))}
                </View>
              )}

              {/* Action Buttons */}
              <View style={styles.actionRow}>
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
          );
        })}

        {/* Add Material Button */}
        <Pressable onPress={() => setModalVisible(true)} style={[styles.addBtn, { backgroundColor: palette.tint || "#DC0A2D", borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' }]}>
          <ThemeText variant="body2" style={{ color: 'white', textAlign: 'center' }}>+ Add a lesson</ThemeText>
        </Pressable>

        {/* Past Exams Section */}
        <View style={[styles.sectionHeader, { marginTop: 12 }]}>
          <ThemeText variant="subtitle1" style={{ color: 'white' }}>📝 Past Exams</ThemeText>
          <ThemeText variant="body3" style={{ color: 'rgba(255,255,255,0.7)' }}>
            {exams.length} exam{exams.length !== 1 ? 's' : ''}
          </ThemeText>
        </View>

        {exams.length === 0 && (
          <Card style={[styles.emptyCard, { backgroundColor: palette.graywhite }]}>
            <ThemeText variant="body2" color="grayMedium" style={{ textAlign: 'center' }}>
              No past exams yet. Add your old exams here to keep them organized!
            </ThemeText>
          </Card>
        )}

        {exams.map((exam) => (
          <Card key={exam.id} style={[styles.materialCard, { backgroundColor: palette.graywhite, borderWidth: 1, borderColor: palette.accentSoft || "#FFF4D6" }]}>
            <View style={styles.materialHeader}>
              <View style={{ flex: 1 }}>
                <ThemeText variant="subtitle2" color="graydark">{exam.title}</ThemeText>
                <ThemeText variant="body3" color="grayMedium">
                  {[exam.year, exam.file_name].filter(Boolean).join(' · ') || "No file"}
                </ThemeText>
              </View>
              <Pressable onPress={() => setExamDeleteTarget({ id: exam.id, name: exam.title })} style={styles.deleteBtn}>
                <ThemeText variant="body3" style={{ color: '#D32F2F' }}>✕</ThemeText>
              </Pressable>
            </View>

            {/* Action buttons */}
            <View style={styles.actionRow}>
              {exam.file_uri ? (
                <Pressable
                  onPress={() => handleOpenPdf(exam.file_uri!)}
                  style={[styles.actionBtn, { backgroundColor: palette.graybackground }]}
                >
                  <ThemeText variant="subtitle3" color="graydark">📄 Open PDF</ThemeText>
                </Pressable>
              ) : null}
              <Pressable
                onPress={() => handleGenerateCorrection(exam)}
                disabled={generatingCorrectionId === exam.id || extractingCorrection}
                style={[styles.actionBtn, { backgroundColor: exam.correction ? (palette.accentMint || "#10B981") : (palette.accentBlue || "#3B82F6") }]}
              >
                {generatingCorrectionId === exam.id ? (
                  <ActivityIndicator size="small" color="white" />
                ) : exam.correction ? (
                  <ThemeText variant="subtitle3" style={{ color: 'white' }}>✅ View correction</ThemeText>
                ) : (
                  <ThemeText variant="subtitle3" style={{ color: 'white' }}>🤖 AI Correction</ThemeText>
                )}
              </Pressable>
            </View>
          </Card>
        ))}

        <Pressable onPress={() => setExamModalVisible(true)} style={[styles.addBtn, { backgroundColor: palette.accentBlue || "#3B82F6", borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' }]}>
          <ThemeText variant="body2" style={{ color: 'white', textAlign: 'center' }}>+ Add a past exam</ThemeText>
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

              <ThemeText variant="subtitle2" color="grayMedium" style={{ marginTop: 12 }}>PDF attachments (multiple allowed)</ThemeText>
              <Pressable
                onPress={() => handlePickPdf(true)}
                disabled={isPickingFile}
                style={[styles.filePicker, { borderColor: palette.graylight || '#ccc', backgroundColor: palette.graybackground }]}
              >
                <ThemeText variant="body2" color="graydark">
                  {isPickingFile ? "Opening files…" : selectedFiles.length > 0 ? "Add more PDFs" : "Choose PDF(s)"}
                </ThemeText>
              </Pressable>
              {selectedFiles.length > 0 ? (
                <View style={styles.fileList}>
                  {selectedFiles.map((f, idx) => (
                    <View key={idx} style={[styles.selectedFile, { backgroundColor: palette.accentSoft || "#FFF4D6" }]}>
                      <ThemeText variant="body3" color="graydark" numberOfLines={1}>{f.name}</ThemeText>
                    </View>
                  ))}
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

        {/* Add Past Exam Modal */}
        <Modal visible={isExamModalVisible} transparent animationType="fade" onRequestClose={closeExamModal}>
          <View style={styles.modalBackdrop}>
            <View style={[styles.modalContent, { backgroundColor: palette.graywhite || "#FFF" }]}>
              <ThemeText variant="headline" color="graydark">Add past exam</ThemeText>

              <ThemeText variant="subtitle2" color="grayMedium" style={{ marginTop: 16 }}>Exam title *</ThemeText>
              <TextInput
                style={[styles.input, { borderColor: palette.graylight || '#ccc', color: palette.graydark }]}
                value={examTitle}
                onChangeText={setExamTitle}
                placeholder="Ex: Midterm — Fall"
                placeholderTextColor={palette.grayMedium}
              />

              <ThemeText variant="subtitle2" color="grayMedium" style={{ marginTop: 12 }}>Year (optional)</ThemeText>
              <TextInput
                style={[styles.input, { borderColor: palette.graylight || '#ccc', color: palette.graydark }]}
                value={examYear}
                onChangeText={setExamYear}
                placeholder="Ex: 2024"
                placeholderTextColor={palette.grayMedium}
              />

              <ThemeText variant="subtitle2" color="grayMedium" style={{ marginTop: 12 }}>PDF attachment (optional)</ThemeText>
              <Pressable
                onPress={() => handlePickPdf(false)}
                disabled={isPickingFile}
                style={[styles.filePicker, { borderColor: palette.graylight || '#ccc', backgroundColor: palette.graybackground }]}
              >
                <ThemeText variant="body2" color="graydark">
                  {isPickingFile ? "Opening files…" : examFile ? "Change PDF" : "Choose a PDF"}
                </ThemeText>
              </Pressable>
              {examFile ? (
                <View style={[styles.selectedFile, { backgroundColor: palette.accentSoft || "#FFF4D6" }]}>
                  <ThemeText variant="body3" color="graydark" numberOfLines={1}>Selected PDF: {examFile.name}</ThemeText>
                </View>
              ) : null}

              <View style={styles.modalActions}>
                <Pressable onPress={closeExamModal} style={styles.modalCancelBtn}>
                  <ThemeText variant="body2" color="graydark">Cancel</ThemeText>
                </Pressable>
                <Pressable onPress={handleAddExam} style={[styles.modalAddBtn, { backgroundColor: palette.accentBlue || "#3B82F6" }]}>
                  <ThemeText variant="body2" style={{ color: 'white' }}>Add</ThemeText>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        {/* Edit Course Modal */}
        <Modal visible={isEditVisible} transparent animationType="fade" onRequestClose={() => setEditVisible(false)}>
          <View style={styles.modalBackdrop}>
            <View style={[styles.modalContent, { backgroundColor: palette.graywhite || "#FFF" }]}>
              <ThemeText variant="headline" color="graydark">Edit course</ThemeText>

              <ThemeText variant="subtitle2" color="grayMedium" style={{ marginTop: 16 }}>Course name</ThemeText>
              <TextInput
                style={[styles.input, { borderColor: palette.graylight || '#ccc', color: palette.graydark }]}
                value={editTitle}
                onChangeText={setEditTitle}
                placeholder="Ex: Mathematical Analysis"
                placeholderTextColor={palette.grayMedium}
              />

              <ThemeText variant="subtitle2" color="grayMedium" style={{ marginTop: 12 }}>Course code</ThemeText>
              <TextInput
                style={[styles.input, { borderColor: palette.graylight || '#ccc', color: palette.graydark }]}
                value={editCode}
                onChangeText={setEditCode}
                placeholder="Ex: MATH201"
                placeholderTextColor={palette.grayMedium}
              />

              <ThemeText variant="subtitle2" color="grayMedium" style={{ marginTop: 12 }}>Department</ThemeText>
              <View style={styles.deptRow}>
                {(['ALL', 'ME', 'EEE', 'CSE'] as const).map((dept) => (
                  <Pressable
                    key={dept}
                    onPress={() => setEditDept(dept)}
                    style={[styles.deptChip, editDept === dept ? { backgroundColor: palette.tint } : { backgroundColor: palette.graybackground }]}
                  >
                    <ThemeText variant="body3" color={editDept === dept ? 'graywhite' : 'graydark'}>{dept}</ThemeText>
                  </Pressable>
                ))}
              </View>

              <View style={styles.modalActions}>
                <Pressable onPress={() => setEditVisible(false)} style={styles.modalCancelBtn}>
                  <ThemeText variant="body2" color="graydark">Cancel</ThemeText>
                </Pressable>
                <Pressable onPress={handleEditCourse} style={[styles.modalAddBtn, { backgroundColor: palette.tint }]}>
                  <ThemeText variant="body2" style={{ color: 'white' }}>Save</ThemeText>
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

        <ConfirmModal
          visible={examDeleteTarget !== null}
          title="Delete past exam"
          message={`Delete "${examDeleteTarget?.name || "this exam"}"?`}
          confirmLabel="Delete"
          cancelLabel="Cancel"
          destructive
          onConfirm={handleDeleteExam}
          onCancel={() => setExamDeleteTarget(null)}
        />

        {/* AI correction view modal */}
        <Modal visible={correctionView !== null} transparent animationType="fade" onRequestClose={() => setCorrectionView(null)}>
          <View style={styles.modalBackdrop}>
            <View style={[styles.modalContent, { backgroundColor: palette.graywhite || "#FFF", maxHeight: '85%' }]}>
              <View style={styles.materialHeader}>
                <View style={{ flex: 1 }}>
                  <ThemeText variant="headline" color="graydark">AI Correction</ThemeText>
                  {correctionView?.title ? (
                    <ThemeText variant="body3" color="grayMedium">{correctionView.title}</ThemeText>
                  ) : null}
                </View>
                <Pressable onPress={() => setCorrectionView(null)} style={styles.deleteBtn}>
                  <ThemeText variant="body3" style={{ color: '#D32F2F' }}>✕</ThemeText>
                </Pressable>
              </View>
              <ScrollView style={styles.correctionScroll}>
                <ThemeText variant="body2" color="graydark" style={{ lineHeight: 22 }}>
                  {correctionText || "No correction available."}
                </ThemeText>
              </ScrollView>
              <Pressable
                onPress={() => { if (correctionView) handleGenerateCorrection(correctionView); setCorrectionView(null); }}
                style={[styles.modalAddBtn, { backgroundColor: palette.accentBlue || "#3B82F6", alignSelf: 'flex-end', marginTop: 12 }]}
              >
                <ThemeText variant="body2" style={{ color: 'white' }}>🔄 Regenerate</ThemeText>
              </Pressable>
            </View>
          </View>
        </Modal>

        {/* Hidden PDF extractor for corrections */}
        {extractingCorrection && correctionExam?.file_base64 && (
          <PdfTextExtractor
            base64Pdf={correctionExam.file_base64}
            onText={handleCorrectionExtracted}
            onError={handleCorrectionExtractionError}
          />
        )}

        {/* Correction progress indicator */}
        {extractingCorrection && (
          <Card style={[styles.emptyCard, { backgroundColor: palette.graywhite }]}>
            <ActivityIndicator size="large" color={palette.accentBlue || "#3B82F6"} style={{ marginBottom: 12 }} />
            <ThemeText variant="body2" color="grayMedium" style={{ textAlign: 'center' }}>
              Reading the exam PDF and generating the correction with AI...
            </ThemeText>
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 12, gap: 12, paddingBottom: 60 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  backBtn: { paddingVertical: 4, paddingHorizontal: 4, alignSelf: 'flex-start' },
  editBtn: { padding: 4 },
  deptRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  deptChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
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
  fileList: { gap: 6, marginTop: 10 },
  fileChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3F4F6', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 10 },
  correctionScroll: { marginTop: 12, flexGrow: 0 },
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
