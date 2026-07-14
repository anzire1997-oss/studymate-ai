import { Card } from "@/components/card";
import { ThemeText } from "@/components/ThemeText";
import { useThemeColors } from "@/hooks/useThemeColors";
import { getThemePalette, useThemeMode } from "@/context/ThemeModeContext";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { generateChatResponse } from "@/lib/aiClient";
import PdfTextExtractor from "@/components/PdfTextExtractor";
import { Quiz, QuizQuestion } from "@/lib/sqliteDatabase";
import { StudyPokemon } from "@/components/StudyPokemon";

type ParsedQuestion = {
  question: string;
  options: string[];
  correct: string;
};

export default function QuizPage() {
  const { materialId, courseId } = useLocalSearchParams<{ materialId: string; courseId: string }>();
  const matId = Number(materialId);
  const crsId = Number(courseId);
  const router = useRouter();
  const colors = useThemeColors();
  const { mode } = useThemeMode();
  const palette = getThemePalette(colors, mode);
  const db = useSQLiteContext();

  const [lectureName, setLectureName] = useState("");
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [answered, setAnswered] = useState(false);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);
  const [fileBase64, setFileBase64] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      setQuiz(null);
      setQuestions([]);
      const mat = await db.getFirstAsync<{ lecture_name: string; file_uri: string | null; file_base64: string | null }>(
        'SELECT lecture_name, file_uri, file_base64 FROM course_materials WHERE id = ?', [matId]
      );
      if (mat) {
        setLectureName(mat.lecture_name);
        setFileBase64(mat.file_base64);
      }

      const existingQuiz = await db.getFirstAsync<Quiz>(
        'SELECT * FROM quizzes WHERE material_id = ? AND course_id = ?',
        [matId, crsId]
      );

      if (existingQuiz) {
        setQuiz(existingQuiz);
        const existingQuestions = await db.getAllAsync<QuizQuestion>(
          'SELECT * FROM quiz_questions WHERE quiz_id = ? ORDER BY id ASC',
          [existingQuiz.id]
        );
        setQuestions(existingQuestions);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [matId, crsId]);

  const generateFromText = async (name: string, contextText?: string) => {
    setGenerating(true);
    try {
      const truncated = contextText ? contextText.slice(0, 8000) : undefined;
      const prompt = truncated
        ? [
          `You are an expert teaching assistant. Here is the course content:`,
          ``,
          truncated,
          ``,
          `Generate multiple-choice questions (MCQ) based on this content. The number of questions should adapt to the length and richness of the content (between 3 and 12, depending on content).`,
        ].join("\n")
        : [
          `You are an expert teaching assistant. Generate multiple-choice questions (MCQ) for the subject: "${name}". Adapt the number of questions to the richness of the subject (between 3 and 12).`,
        ].join("\n");

      const promptEnd = [
        ``,
        `Each question must have exactly 4 options (A, B, C, D) and only one correct answer.`,
        `Return ONLY a valid JSON array, with no text before or after.`,
        `Expected format:`,
        `[{"question": "What is the capital of France?", "options": ["A) Paris", "B) London", "C) Berlin", "D) Madrid"], "correct": "A) Paris"}]`,
        `The "correct" field must contain exactly one of the elements from the "options" array.`,
        `IMPORTANT: Start directly with [ and end with ]. No markdown, no comments.`
      ].join("\n");

      const response = await generateChatResponse(prompt + promptEnd);

      const match = response.match(/\[[\s\S]*\]/);
      if (!match) throw new Error("No JSON array found in the response.");
      const parsed = JSON.parse(match[0]) as ParsedQuestion[];

      if (!Array.isArray(parsed) || parsed.length === 0 || parsed.some((question) =>
        !question?.question?.trim()
        || !Array.isArray(question.options)
        || question.options.length !== 4
        || question.options.some((option) => !option?.trim())
        || !question.options.includes(question.correct)
      )) {
        throw new Error("Empty response or invalid format.");
      }

      // Insert quiz
      const quizResult = await db.runAsync(
        'INSERT INTO quizzes (course_id, material_id, title) VALUES (?, ?, ?)',
        [crsId, matId, `Quiz — ${lectureName}`]
      );
      const newQuizId = quizResult.lastInsertRowId;

      // Insert questions
      for (const q of parsed) {
        await db.runAsync(
          'INSERT INTO quiz_questions (quiz_id, question_text, options_json, correct_answer) VALUES (?, ?, ?, ?)',
          [newQuizId, q.question, JSON.stringify(q.options), q.correct]
        );
      }

      // Reload
      await fetchData();
      setCurrentIndex(0);
      setSelectedAnswer(null);
      setAnswered(false);
      setScore(0);
      setFinished(false);
    } catch (e: any) {
      console.error("Generation error:", e);
      Alert.alert("Generation Error", e.message || String(e));
    } finally {
      setGenerating(false);
    }
  };

  const handleGenerate = () => {
    if (!lectureName.trim()) {
      Alert.alert("Lesson not found", "Cannot generate a quiz without a lesson.");
      return;
    }
    if (fileBase64) {
      setExtracting(true);
    } else {
      generateFromText(lectureName);
    }
  };

  const handleExtractedText = (pdfText: string) => {
    setExtracting(false);
    generateFromText(lectureName, pdfText);
  };

  const handleExtractionError = (err: Error) => {
    console.warn('PDF extraction failed, fallback:', err.message);
    setExtracting(false);
    Alert.alert("PDF Extraction", "Could not extract text from the PDF. Generating from lesson name only.");
    generateFromText(lectureName);
  };

  const handleRegenerate = async () => {
    if (!quiz) return;
    try {
      await db.runAsync('DELETE FROM quiz_questions WHERE quiz_id = ?', [quiz.id]);
      await db.runAsync('DELETE FROM quizzes WHERE id = ?', [quiz.id]);
      setQuiz(null);
      setQuestions([]);
      setCurrentIndex(0);
      setSelectedAnswer(null);
      setAnswered(false);
      setScore(0);
      setFinished(false);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSelectAnswer = (option: string) => {
    if (answered) return;
    setSelectedAnswer(option);
  };

  const handleValidate = () => {
    if (!selectedAnswer || answered) return;
    setAnswered(true);
    const current = questions[currentIndex];
    if (selectedAnswer === current.correct_answer) {
      setScore((prev) => prev + 1);
    }
  };

  const handleNext = () => {
    if (currentIndex >= questions.length - 1) {
      setFinished(true);
      return;
    }
    setCurrentIndex((prev) => prev + 1);
    setSelectedAnswer(null);
    setAnswered(false);
  };

  const handleRestart = () => {
    setCurrentIndex(0);
    setSelectedAnswer(null);
    setAnswered(false);
    setScore(0);
    setFinished(false);
  };

  const currentQuestion = questions[currentIndex];
  let parsedOptions: string[] = [];
  try {
    const options = currentQuestion?.options_json ? JSON.parse(currentQuestion.options_json) : [];
    parsedOptions = Array.isArray(options) ? options.filter((option): option is string => typeof option === "string") : [];
  } catch {
    parsedOptions = [];
  }

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
        {/* Back */}
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <ThemeText variant="body2" style={{ color: 'white' }}>← Back</ThemeText>
        </Pressable>

        {/* Header */}
        <Card style={[styles.hero, { backgroundColor: palette.accentSoft || "#FFF4D6" }]}>
          <View style={styles.heroTop}>
            <ThemeText variant="headline" color="graydark">📝 Quiz</ThemeText>
            <StudyPokemon compact id={matId || 133} message="Revision companion" />
          </View>
          <ThemeText variant="body2" color="grayMedium">{lectureName}</ThemeText>
        </Card>

        {/* No quiz yet */}
        {questions.length === 0 && !generating && !extracting && (
          <Card style={[styles.emptyCard, { backgroundColor: palette.graywhite }]}>
            <ThemeText variant="body2" color="grayMedium" style={{ textAlign: 'center', marginBottom: 16 }}>
              No quiz for this lesson.{"\n"}AI can generate one for you!
            </ThemeText>
            <Pressable onPress={handleGenerate} style={[styles.generateBtn, { backgroundColor: palette.accentBlue || "#3B82F6" }]}>
              <ThemeText variant="subtitle2" style={{ color: 'white', textAlign: 'center' }}>
                🤖 Generate a quiz with AI
              </ThemeText>
            </Pressable>
          </Card>
        )}

        {/* Extracting PDF text */}
        {extracting && (
          <Card style={[styles.emptyCard, { backgroundColor: palette.graywhite }]}>
            <ActivityIndicator size="large" color={palette.accentBlue || "#3B82F6"} style={{ marginBottom: 12 }} />
            <ThemeText variant="body2" color="grayMedium" style={{ textAlign: 'center' }}>
              Extracting PDF text...
            </ThemeText>
          </Card>
        )}

        {/* Generating */}
        {generating && (
          <Card style={[styles.emptyCard, { backgroundColor: palette.graywhite }]}>
            <ActivityIndicator size="large" color={palette.accentBlue || "#3B82F6"} style={{ marginBottom: 12 }} />
            <ThemeText variant="body2" color="grayMedium" style={{ textAlign: 'center' }}>
              AI is generating your quiz...
            </ThemeText>
          </Card>
        )}

        {/* Hidden PDF text extractor */}
        {extracting && fileBase64 && (
          <PdfTextExtractor
            base64Pdf={fileBase64}
            onText={handleExtractedText}
            onError={handleExtractionError}
          />
        )}

        {/* Finished */}
        {finished && (
          <Card style={[styles.resultCard, { backgroundColor: palette.graywhite, borderWidth: 2, borderColor: palette.accentMint || "#10B981" }]}>
            <ThemeText variant="headline" color="graydark" style={{ textAlign: 'center' }}>🎉 Finished!</ThemeText>
            <View style={[styles.scoreBadge, { backgroundColor: palette.accentSoft || "#FFF4D6" }]}>
              <ThemeText variant="headline" color="graydark">{score} / {questions.length}</ThemeText>
            </View>
            <ThemeText variant="body2" color="grayMedium" style={{ textAlign: 'center', marginTop: 8 }}>
              {score === questions.length
                ? "Perfect! You've mastered this topic! 🌟"
                : score >= questions.length / 2
                ? "Good work! Keep studying. 💪"
                : "This subject still needs work. 📖"}
            </ThemeText>
            <View style={styles.resultActions}>
              <Pressable onPress={handleRestart} style={[styles.resultBtn, { backgroundColor: palette.accentBlue || "#3B82F6" }]}>
                <ThemeText variant="subtitle2" style={{ color: 'white' }}>🔁 Retry</ThemeText>
              </Pressable>
              <Pressable onPress={handleRegenerate} style={[styles.resultBtn, { backgroundColor: palette.graybackground }]}>
                <ThemeText variant="subtitle2" color="graydark">🔄 Regenerate</ThemeText>
              </Pressable>
            </View>
          </Card>
        )}

        {/* Question */}
        {questions.length > 0 && !finished && (
          <>
            {/* Progress */}
            <View style={styles.progressRow}>
              <ThemeText variant="subtitle3" style={{ color: 'rgba(255,255,255,0.8)' }}>
                Question {currentIndex + 1} / {questions.length}
              </ThemeText>
              <View style={[styles.progressBar, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
                <View style={[styles.progressFill, { backgroundColor: palette.accentBlue || "#3B82F6", width: `${((currentIndex + 1) / questions.length) * 100}%` }]} />
              </View>
              <View style={[styles.scorePill, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
                <ThemeText variant="subtitle3" style={{ color: 'white' }}>✓ {score}</ThemeText>
              </View>
            </View>

            {/* Question Card */}
            <Card style={[styles.questionCard, { backgroundColor: palette.graywhite }]}>
              <ThemeText variant="subtitle1" color="graydark" style={{ lineHeight: 22 }}>
                {currentQuestion?.question_text}
              </ThemeText>
            </Card>

            {/* Options */}
            {parsedOptions.map((option, idx) => {
              const isSelected = selectedAnswer === option;
              const isCorrect = answered && option === currentQuestion?.correct_answer;
              const isWrong = answered && isSelected && option !== currentQuestion?.correct_answer;

              let bgColor = palette.graywhite;
              let borderColor = palette.graylight || '#E0E0E0';
              if (isSelected && !answered) {
                bgColor = palette.accentSoft || "#FFF4D6";
                borderColor = palette.accent || "#F59E0B";
              }
              if (isCorrect) {
                bgColor = '#D1FAE5';
                borderColor = '#10B981';
              }
              if (isWrong) {
                bgColor = '#FEE2E2';
                borderColor = '#EF4444';
              }

              return (
                <Pressable
                  key={idx}
                  onPress={() => handleSelectAnswer(option)}
                  style={[styles.optionBtn, { backgroundColor: bgColor, borderColor }]}
                >
                  <ThemeText variant="body1" color="graydark">{option}</ThemeText>
                </Pressable>
              );
            })}

            {/* Validate / Next */}
            {!answered ? (
              <Pressable
                onPress={handleValidate}
                disabled={!selectedAnswer}
                style={[
                  styles.validateBtn,
                  { backgroundColor: selectedAnswer ? (palette.accentBlue || "#3B82F6") : 'rgba(255,255,255,0.2)' }
                ]}
              >
                <ThemeText variant="subtitle2" style={{ color: 'white', textAlign: 'center' }}>
                  Submit
                </ThemeText>
              </Pressable>
            ) : (
              <Pressable onPress={handleNext} style={[styles.validateBtn, { backgroundColor: palette.accentMint || "#10B981" }]}>
                <ThemeText variant="subtitle2" style={{ color: 'white', textAlign: 'center' }}>
                  {currentIndex >= questions.length - 1 ? "View results" : "Next question →"}
                </ThemeText>
              </Pressable>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 12, gap: 10, paddingBottom: 60 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  backBtn: { paddingVertical: 4, paddingHorizontal: 4, alignSelf: 'flex-start' },
  hero: { borderRadius: 18, padding: 14 },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  emptyCard: { borderRadius: 16, padding: 24 },
  generateBtn: { borderRadius: 12, padding: 14 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 4 },
  progressBar: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  scorePill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  questionCard: { borderRadius: 16, padding: 16 },
  optionBtn: { borderRadius: 12, padding: 14, borderWidth: 2 },
  validateBtn: { borderRadius: 12, paddingVertical: 14 },
  resultCard: { borderRadius: 20, padding: 24, alignItems: 'center' },
  scoreBadge: { borderRadius: 16, paddingHorizontal: 24, paddingVertical: 12, marginTop: 12 },
  resultActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  resultBtn: { flex: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
});
