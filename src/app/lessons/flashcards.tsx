import { Card } from "@/components/card";
import { ThemeText } from "@/components/ThemeText";
import { useThemeColors } from "@/hooks/useThemeColors";
import { getThemePalette, useThemeMode } from "@/context/ThemeModeContext";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { generateChatResponse, extractFirstJsonArray } from "@/lib/aiClient";
import PdfTextExtractor from "@/components/PdfTextExtractor";
import { Flashcard, FlashcardDeck } from "@/lib/sqliteDatabase";
import { StudyPokemon } from "@/components/StudyPokemon";

export default function FlashcardsPage() {
  const { materialId, courseId } = useLocalSearchParams<{ materialId: string; courseId: string }>();
  const matId = Number(materialId);
  const crsId = Number(courseId);
  const router = useRouter();
  const colors = useThemeColors();
  const { mode } = useThemeMode();
  const palette = getThemePalette(colors, mode);
  const db = useSQLiteContext();

  const [lectureName, setLectureName] = useState("");
  const [deck, setDeck] = useState<FlashcardDeck | null>(null);
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [fileBase64, setFileBase64] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pdfText, setPdfText] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [answering, setAnswering] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      setDeck(null);
      setCards([]);
      // Get lecture name
      const mat = await db.getFirstAsync<{ lecture_name: string }>(
        'SELECT lecture_name FROM course_materials WHERE id = ?', [matId]
      );
      if (mat) {
        setLectureName(mat.lecture_name);
      }

      // Get first PDF (prefer course_files, fallback to legacy columns)
      const firstFile = await db.getFirstAsync<{ file_base64: string | null }>(
        'SELECT file_base64 FROM course_files WHERE material_id = ? ORDER BY id ASC LIMIT 1', [matId]
      );
      if (firstFile) {
        setFileBase64(firstFile.file_base64);
      } else {
        const legacy = await db.getFirstAsync<{ file_base64: string | null }>(
          'SELECT file_base64 FROM course_materials WHERE id = ?', [matId]
        );
        setFileBase64(legacy?.file_base64 ?? null);
      }

      // Check for existing deck
      const existingDeck = await db.getFirstAsync<FlashcardDeck>(
        'SELECT * FROM flashcard_decks WHERE material_id = ? AND course_id = ?',
        [matId, crsId]
      );

      if (existingDeck) {
        setDeck(existingDeck);
        const existingCards = await db.getAllAsync<Flashcard>(
          'SELECT * FROM flashcards WHERE deck_id = ? ORDER BY id ASC',
          [existingDeck.id]
        );
        setCards(existingCards);
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
          `Generate flashcards that are **explanations, analyses and summaries** of the important concepts in this course. The number of flashcards should adapt to the length and richness of the content (between 3 and 15, depending on content).`,
          `Each flashcard must have:`,
          `- "front": the name of the concept, theme or notion`,
          `- "back": a clear explanation, analysis or summary of this concept`,
          ``,
          `EXAMPLE: {"front": "Pythagorean Theorem", "back": "In a right triangle, the square of the hypotenuse equals the sum of squares of the other two sides. Used to calculate inaccessible distances."}`,
          `EXAMPLE: {"front": "Supply and Demand Analysis", "back": "Supply represents the quantity a producer is willing to sell at a given price. Demand is the quantity a consumer is willing to buy. Their intersection determines the equilibrium price."}`,
          `Do NOT use Q&A format. "front" = concept name, "back" = explanation/analysis/summary.`,
        ].join("\n")
        : [
          `You are an expert teaching assistant. Generate flashcards as explanations, analyses and summaries for the subject: "${name}". Adapt the number of flashcards to the richness of the subject (between 3 and 15).`,
          `"front" = concept, "back" = explanation. Example: {"front": "Concept", "back": "Detailed explanation."}`,
        ].join("\n");

      const promptEnd = [
        ``,
        `Return ONLY a valid JSON array, with no text before or after.`,
        `Format: [{"front": "Concept", "back": "Explanation/analysis/summary"}]`,
        `IMPORTANT: Start directly with [ and end with ]. No markdown, no comments.`
      ].join("\n");

      const response = await generateChatResponse(prompt + promptEnd);

      const jsonStr = extractFirstJsonArray(response);
      if (!jsonStr) throw new Error("No JSON array found in the response.");
      const parsed = JSON.parse(jsonStr) as { front: string; back: string }[];

      if (!Array.isArray(parsed) || parsed.length === 0 || parsed.some((card) => !card?.front?.trim() || !card?.back?.trim())) {
        throw new Error("Empty response or invalid format.");
      }

      // Insert deck
      const deckResult = await db.runAsync(
        'INSERT INTO flashcard_decks (course_id, material_id, title) VALUES (?, ?, ?)',
        [crsId, matId, `Flashcards — ${lectureName}`]
      );
      const newDeckId = deckResult.lastInsertRowId;

      // Insert cards
      for (const card of parsed) {
        await db.runAsync(
          'INSERT INTO flashcards (deck_id, front_text, back_text) VALUES (?, ?, ?)',
          [newDeckId, card.front, card.back]
        );
      }

      // Reload
      await fetchData();
      setCurrentIndex(0);
      setFlipped(false);
    } catch (e: any) {
      console.error("Generation error:", e);
      Alert.alert("Generation Error", e.message || String(e));
    } finally {
      setGenerating(false);
    }
  };

  const handleGenerate = () => {
    if (!lectureName.trim()) {
      Alert.alert("Lesson not found", "Cannot generate flashcards without a lesson.");
      return;
    }
    if (fileBase64) {
      setExtracting(true);
    } else {
      generateFromText(lectureName);
    }
  };

  const [extractingForQa, setExtractingForQa] = useState(false);

  const handleExtractedText = (text: string) => {
    setPdfText(text);
    if (extractingForQa) {
      setExtractingForQa(false);
      askQuestion(text);
    } else {
      setExtracting(false);
      generateFromText(lectureName, text);
    }
  };

  const handleExtractionError = (err: Error) => {
    console.warn('PDF extraction failed, fallback:', err.message);
    if (extractingForQa) {
      setExtractingForQa(false);
      setAnswer("Could not extract text from the PDF.");
      setAnswering(false);
    } else {
      setExtracting(false);
      Alert.alert("PDF Extraction", "Could not extract text from the PDF. Generating from lesson name only.");
      generateFromText(lectureName);
    }
  };

  const handleRegenerate = async () => {
    if (!deck) return;
    try {
      // Delete old cards and deck
      await db.runAsync('DELETE FROM flashcards WHERE deck_id = ?', [deck.id]);
      await db.runAsync('DELETE FROM flashcard_decks WHERE id = ?', [deck.id]);
      setDeck(null);
      setCards([]);
      setCurrentIndex(0);
      setFlipped(false);
    } catch (e) {
      console.error(e);
    }
  };

  const askQuestion = async (contextText?: string) => {
    if (!question.trim()) return;
    setAnswering(true);
    setAnswer(null);
    try {
      const context = contextText || pdfText || "";
      const truncated = context.slice(0, 8000);
      const prompt = [
        `You are an expert teaching assistant. Answer the following question based on this course content:`,
        ``,
        truncated,
        ``,
        `Question: ${question.trim()}`,
        ``,
        `Provide a clear and concise answer based only on the content above. If the content does not contain enough information, say so.`,
      ].join("\n");

      const response = await generateChatResponse(prompt);
      setAnswer(response.trim());
    } catch (e: any) {
      console.error("QA error:", e);
      setAnswer("Error: " + (e.message || "Could not get answer."));
    } finally {
      setAnswering(false);
    }
  };

  const handleAsk = () => {
    if (!question.trim()) return;
    if (fileBase64 && !pdfText) {
      setExtractingForQa(true);
    } else {
      askQuestion();
    }
  };

  const goNext = () => {
    setFlipped(false);
    setCurrentIndex((prev) => Math.min(prev + 1, cards.length - 1));
  };

  const goPrev = () => {
    setFlipped(false);
    setCurrentIndex((prev) => Math.max(prev - 1, 0));
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
        {/* Back */}
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <ThemeText variant="body2" style={{ color: 'white' }}>← Back</ThemeText>
        </Pressable>

        {/* Header */}
        <Card style={[styles.hero, { backgroundColor: palette.accentSoft || "#FFF4D6" }]}>
          <View style={styles.heroTop}>
            <ThemeText variant="headline" color="graydark">📇 Flashcards</ThemeText>
            <StudyPokemon compact id={matId || 25} message="Revision companion" />
          </View>
          <ThemeText variant="body2" color="grayMedium">{lectureName}</ThemeText>
        </Card>

        {/* Ask a question */}
        <Card style={[styles.qaCard, { backgroundColor: palette.graywhite }]}>
          <ThemeText variant="subtitle2" color="graydark" style={{ marginBottom: 8 }}>
            Ask a question about this lesson
          </ThemeText>
          <View style={styles.qaRow}>
            <TextInput
              style={[styles.qaInput, { borderColor: palette.graylight || '#ccc', color: palette.graydark }]}
              value={question}
              onChangeText={(t) => { setQuestion(t); setAnswer(null); }}
              placeholder="Type your question..."
              placeholderTextColor={palette.grayMedium}
            />
            <Pressable
              onPress={handleAsk}
              disabled={!question.trim() || answering}
              style={[styles.askBtn, { backgroundColor: !question.trim() || answering ? palette.graybackground : (palette.tint || "#DC0A2D") }]}
            >
              <ThemeText variant="subtitle3" style={{ color: 'white' }}>Ask</ThemeText>
            </Pressable>
          </View>
          {answering && (
            <View style={styles.qaAnswering}>
              <ActivityIndicator size="small" color={palette.tint || "#DC0A2D"} />
              <ThemeText variant="body3" color="grayMedium">Thinking...</ThemeText>
            </View>
          )}
          {answer && (
            <View style={[styles.qaAnswer, { backgroundColor: palette.accentSoft || "#FFF4D6" }]}>
              <ThemeText variant="body2" color="graydark">{answer}</ThemeText>
            </View>
          )}
        </Card>

        {/* No cards yet */}
        {cards.length === 0 && !generating && !extracting && (
          <Card style={[styles.emptyCard, { backgroundColor: palette.graywhite }]}>
            <ThemeText variant="body2" color="grayMedium" style={{ textAlign: 'center', marginBottom: 16 }}>
              No flashcards for this lesson.{"\n"}AI can generate some for you!
            </ThemeText>
            <Pressable onPress={handleGenerate} style={[styles.generateBtn, { backgroundColor: palette.accentMint || "#10B981" }]}>
              <ThemeText variant="subtitle2" style={{ color: 'white', textAlign: 'center' }}>
                🤖 Generate flashcards with AI
              </ThemeText>
            </Pressable>
          </Card>
        )}

        {/* Extracting PDF text */}
        {extracting && (
          <Card style={[styles.emptyCard, { backgroundColor: palette.graywhite }]}>
            <ActivityIndicator size="large" color={palette.accentMint || "#10B981"} style={{ marginBottom: 12 }} />
            <ThemeText variant="body2" color="grayMedium" style={{ textAlign: 'center' }}>
              Extracting PDF text...
            </ThemeText>
          </Card>
        )}

        {/* Generating */}
        {generating && (
          <Card style={[styles.emptyCard, { backgroundColor: palette.graywhite }]}>
            <ActivityIndicator size="large" color={palette.accentMint || "#10B981"} style={{ marginBottom: 12 }} />
            <ThemeText variant="body2" color="grayMedium" style={{ textAlign: 'center' }}>
              AI is generating your flashcards...
            </ThemeText>
          </Card>
        )}

        {/* Hidden PDF text extractor */}
        {(extracting || extractingForQa) && fileBase64 && (
          <PdfTextExtractor
            base64Pdf={fileBase64}
            onText={handleExtractedText}
            onError={handleExtractionError}
          />
        )}

        {/* Card Viewer */}
        {cards.length > 0 && (
          <>
            {/* Progress */}
            <View style={styles.progressRow}>
              <ThemeText variant="subtitle3" style={{ color: 'rgba(255,255,255,0.8)' }}>
                {currentIndex + 1} / {cards.length}
              </ThemeText>
              <View style={[styles.progressBar, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
                <View style={[styles.progressFill, { backgroundColor: palette.accentMint || "#10B981", width: `${((currentIndex + 1) / cards.length) * 100}%` }]} />
              </View>
            </View>

            {/* Flashcard */}
            <Pressable onPress={() => setFlipped(!flipped)}>
              <Card style={[
                styles.flashcard,
                {
                  backgroundColor: flipped ? (palette.accentSoft || "#FFF4D6") : palette.graywhite,
                  borderWidth: 2,
                  borderColor: flipped ? (palette.accent || "#F59E0B") : (palette.accentSoft || "#FFF4D6"),
                }
              ]}>
                <ThemeText variant="subtitle3" color="grayMedium" style={{ marginBottom: 8 }}>
                  {flipped ? "ANSWER" : "QUESTION"}
                </ThemeText>
                <ThemeText variant="subtitle1" color="graydark" style={{ textAlign: 'center', lineHeight: 22 }}>
                  {flipped ? cards[currentIndex]?.back_text : cards[currentIndex]?.front_text}
                </ThemeText>
                <ThemeText variant="body3" color="grayMedium" style={{ marginTop: 16 }}>
                  {flipped ? "Answer revealed — nice!" : "Tap to reveal the answer"}
                </ThemeText>
              </Card>
            </Pressable>

            {/* Navigation */}
            <View style={styles.navRow}>
              <Pressable
                onPress={goPrev}
                disabled={currentIndex === 0}
                style={[styles.navBtn, { backgroundColor: currentIndex === 0 ? 'rgba(255,255,255,0.2)' : palette.graywhite }]}
              >
                <ThemeText variant="subtitle2" color={currentIndex === 0 ? "grayMedium" : "graydark"}>◀ Previous</ThemeText>
              </Pressable>
              <Pressable
                onPress={goNext}
                disabled={currentIndex === cards.length - 1}
                style={[styles.navBtn, { backgroundColor: currentIndex === cards.length - 1 ? 'rgba(255,255,255,0.2)' : palette.graywhite }]}
              >
                <ThemeText variant="subtitle2" color={currentIndex === cards.length - 1 ? "grayMedium" : "graydark"}>Next ▶</ThemeText>
              </Pressable>
            </View>

            {/* Regenerate */}
            <Pressable onPress={handleRegenerate} style={[styles.regenBtn, { borderColor: 'rgba(255,255,255,0.3)' }]}>
              <ThemeText variant="body3" style={{ color: 'rgba(255,255,255,0.8)', textAlign: 'center' }}>
                🔄 Delete and regenerate
              </ThemeText>
            </Pressable>
          </>
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
  hero: { borderRadius: 18, padding: 14 },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  emptyCard: { borderRadius: 16, padding: 24 },
  generateBtn: { borderRadius: 12, padding: 14 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 4 },
  progressBar: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  flashcard: { borderRadius: 20, padding: 28, alignItems: 'center', justifyContent: 'center', minHeight: 220 },
  navRow: { flexDirection: 'row', gap: 10 },
  navBtn: { flex: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  regenBtn: { borderRadius: 10, padding: 10, borderWidth: 1, marginTop: 4 },
  qaCard: { borderRadius: 16, padding: 14 },
  qaRow: { flexDirection: 'row', gap: 8 },
  qaInput: { flex: 1, borderWidth: 1, borderRadius: 8, padding: 10, fontSize: 14 },
  askBtn: { borderRadius: 8, paddingHorizontal: 16, paddingVertical: 10, justifyContent: 'center' },
  qaAnswering: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  qaAnswer: { borderRadius: 8, padding: 10, marginTop: 8 },
});
