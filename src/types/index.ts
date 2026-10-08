export interface Word {
  id: string;
  word: string;
  phonetic: string;
  commonMeaning: string;
  rareMeaning: string;
  usage: string;
  example: string;
  tags: string[];
  source: string;
  createdAt: number;
  updatedAt: number;
}
export interface StudyRecord {
  wordId: string;
  correctCount: number;
  wrongCount: number;
  mastery: number;
  lastReview: number;
  nextReview: number;
  lastResult: boolean;
  streakCorrect: number;
  streakWrong: number;
  lastWrong: number;
  wrongType: string;
  rareCorrect: number;
  rareTotal: number;
}
export interface DailyWordList {
  date: string;
  wordIds: string[];
}
export interface Attempt {
  id: string;
  sessionId: string;
  wordId: string;
  time: number;
  correct: boolean;
  type: string;
  rating: number;
}
export interface Settings {
  theme: string;
  goal: number;
  count: string;
  mode: string;
  rareFirst: boolean;
  audio: boolean;
  audioVersion?: number;
  readingAuto?: boolean;
}
export interface State {
  words: Word[];
  records: Record<string, StudyRecord>;
  days: DailyWordList[];
  attempts: Attempt[];
  settings: Settings;
  reading?: ReadingState;
}
export type SaveState = (next: State | ((current: State) => State)) => Promise<void>;
export interface ReadingSentence { english: string; translation: string; structure: string; grammar: string; pattern: string; application: string; applicationTranslation: string }
export interface ReadingVocabulary { wordId: string; sentence: number; quote?: string; meaning: string; partOfSpeech: string; usage: string; contrast: string; example: string; exampleTranslation: string }
export interface ReadingWordExplanation { word: string; quote: string; headword: string; phonetic: string; partOfSpeech: string; meaning: string; usage: string; grammar: string; collocations: string[]; contrast: string; example: string; exampleTranslation: string }
export interface ReadingLookup { surface: string; start: number; sentence: string; explanation: ReadingWordExplanation; createdAt: number }
export interface ReadingArticle { title: string; titleTranslation: string; sentences: ReadingSentence[]; vocabulary: ReadingVocabulary[]; unmatchedWordIds?: string[]; lookups?: ReadingLookup[] }
export interface ReadingBatch { id: string; createdAt: number; words: Word[]; status: "pending" | "generating" | "paused" | "failed" | "ready"; articles: ReadingArticle[]; autoEligible: boolean; runId?: string; error?: string; model?: string }
export interface ReadingState { version: 1; batches: ReadingBatch[] }
export interface Question {
  wordId: string;
  type: string;
  prompt: string;
  subtitle: string;
  options: string[];
  answer: string;
}
export interface Session {
  id: string;
  questions: Question[];
  index: number;
  answers: { wordId: string; correct: boolean }[];
  selected?: string;
  spelling?: string;
  rating?: number;
  completed: boolean;
  autoReview?: boolean;
  initialSize?: number;
}
