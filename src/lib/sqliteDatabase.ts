import { type SQLiteDatabase } from 'expo-sqlite';

/**
 * Initialize database tables.
 * This function is called by SQLiteProvider on app startup.
 */
export const initDatabase = async (db: SQLiteDatabase) => {
  try {
    // Enable foreign keys
    await db.execAsync('PRAGMA foreign_keys = ON;');

    await db.execAsync(`
      -- Departments
      CREATE TABLE IF NOT EXISTS departments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL
      );

      -- Cours
      CREATE TABLE IF NOT EXISTS courses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        department_id INTEGER,
        course_code TEXT NOT NULL,
        title TEXT,
        FOREIGN KEY(department_id) REFERENCES departments(id) ON DELETE CASCADE
      );

      -- Course materials (Files, PDFs, etc.)
      CREATE TABLE IF NOT EXISTS course_materials (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        course_id INTEGER,
        lecture_name TEXT,
        file_name TEXT,
        file_uri TEXT,
        file_base64 TEXT,
        FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE
      );

      -- Multiple files per lesson
      CREATE TABLE IF NOT EXISTS course_files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        material_id INTEGER,
        file_name TEXT,
        file_uri TEXT,
        file_base64 TEXT,
        FOREIGN KEY(material_id) REFERENCES course_materials(id) ON DELETE CASCADE
      );

      -- Past exams
      CREATE TABLE IF NOT EXISTS past_exams (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        course_id INTEGER,
        title TEXT,
        year TEXT,
        file_name TEXT,
        file_uri TEXT,
        file_base64 TEXT,
        correction TEXT,
        FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE
      );

      -- Calendar / Events (one-time)
      CREATE TABLE IF NOT EXISTS calendar_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        course_id INTEGER,
        title TEXT NOT NULL,
        event_date TEXT,
        event_time TEXT,
        FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE
      );

      -- Weekly course schedules
      CREATE TABLE IF NOT EXISTS course_schedules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        course_id INTEGER,
        day_of_week INTEGER, -- 0=Dimanche, 1=Lundi, ..., 6=Samedi
        start_time TEXT,
        end_time TEXT,
        location TEXT,
        FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE
      );

      -- Flashcard Decks
      CREATE TABLE IF NOT EXISTS flashcard_decks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        course_id INTEGER,
        material_id INTEGER,
        title TEXT,
        FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE,
        FOREIGN KEY(material_id) REFERENCES course_materials(id) ON DELETE CASCADE
      );

      -- Flashcards (Individual Cards)
      CREATE TABLE IF NOT EXISTS flashcards (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        deck_id INTEGER,
        front_text TEXT,
        back_text TEXT,
        FOREIGN KEY(deck_id) REFERENCES flashcard_decks(id) ON DELETE CASCADE
      );

      -- Quiz
      CREATE TABLE IF NOT EXISTS quizzes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        course_id INTEGER,
        material_id INTEGER,
        title TEXT,
        FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE,
        FOREIGN KEY(material_id) REFERENCES course_materials(id) ON DELETE CASCADE
      );

      -- Quiz Questions
      CREATE TABLE IF NOT EXISTS quiz_questions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        quiz_id INTEGER,
        question_text TEXT,
        options_json TEXT,
        correct_answer TEXT,
        FOREIGN KEY(quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE
      );
    `);

    // Seed default departments if they don't exist
    await db.execAsync(`
      INSERT OR IGNORE INTO departments (id, name) VALUES (1, 'ME');
      INSERT OR IGNORE INTO departments (id, name) VALUES (2, 'EEE');
      INSERT OR IGNORE INTO departments (id, name) VALUES (3, 'CSE');
      INSERT OR IGNORE INTO departments (id, name) VALUES (4, 'ALL');
    `);

    // Migration: add file_base64 column if upgrading from older version
    try {
      await db.execAsync('ALTER TABLE course_materials ADD COLUMN file_base64 TEXT');
    } catch {
      // Column already exists — ignore
    }

    // Migration: add correction column to past_exams
    try {
      await db.execAsync('ALTER TABLE past_exams ADD COLUMN correction TEXT');
    } catch {
      // Column already exists — ignore
    }

    console.log('Database initialized successfully.');
  } catch (error) {
    console.error('Error initializing database:', error);
  }
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface Course {
  id: number;
  department_id: number;
  course_code: string;
  title: string | null;
  pokemon?: string;
}

export interface CourseMaterial {
  id: number;
  course_id: number;
  lecture_name: string | null;
  file_name: string | null;
  file_uri: string | null;
  file_base64: string | null;
}

export interface CourseFile {
  id: number;
  material_id: number;
  file_name: string | null;
  file_uri: string | null;
  file_base64: string | null;
}

export interface PastExam {
  id: number;
  course_id: number;
  title: string | null;
  year: string | null;
  file_name: string | null;
  file_uri: string | null;
  file_base64: string | null;
  correction: string | null;
}

export interface FlashcardDeck {
  id: number;
  course_id: number;
  material_id: number | null;
  title: string | null;
}

export interface Flashcard {
  id: number;
  deck_id: number;
  front_text: string | null;
  back_text: string | null;
}

export interface Quiz {
  id: number;
  course_id: number;
  material_id: number | null;
  title: string | null;
}

export interface QuizQuestion {
  id: number;
  quiz_id: number;
  question_text: string | null;
  options_json: string | null;
  correct_answer: string | null;
}
