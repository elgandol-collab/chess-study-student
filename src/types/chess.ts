// ─────────────────────────────────────────────────
//  Core domain types for the Chess Study Platform
// ─────────────────────────────────────────────────

export interface MoveNode {
  id: string;
  san: string;          // e.g. "Nf3"
  uci: string;          // e.g. "g1f3"
  fen: string;          // board state AFTER this move
  parentId: string | null;
  childrenIds: string[];
  comment?: string;
  moveNumber: number;   // full-move number (1, 2, 3…)
  color: 'w' | 'b';     // which side just moved
  nags?: number[];      // Numeric Annotation Glyphs ($1, $2 …)
}

export interface Chapter {
  id: string;
  title: string;
  initialFen: string;   // FEN before any move
  moves: Record<string, MoveNode>;
  rootMoveId: string;   // virtual root node (START)
  orientation?: 'white' | 'black';
}

export interface StudyVisibility {
  engine: boolean;
  book: boolean;
  allowStudentHintArrows: boolean;
  /** Coach-controlled: when false the student board is view-only (no drag/click) */
  boardInteractive: boolean;
  /** Coach-controlled: when true, student can only make one move every `moveRateLimitSec` seconds */
  moveRateLimitEnabled: boolean;
  /** Cooldown duration in seconds between moves when moveRateLimitEnabled is true */
  moveRateLimitSec: number;
  /** Coach-controlled: allow the student to upload a .pgn file and merge it into the current chapter */
  allowStudentPgnUpload: boolean;
}

export interface StudyState {
  chapters: Chapter[];
  currentChapterId: string | null;
  currentMoveId: string | null;
  /** Coach-controlled toggles for what the student can see (synced live) */
  visibility?: StudyVisibility;
}

// Modal modes for ChapterModal
export type ChapterModalMode = 'empty' | 'fen' | 'pgn';

export interface NewChapterPayload {
  title: string;
  mode: ChapterModalMode;
  fen?: string;
  pgn?: string;
}

export interface EngineLine {
  depth: number;
  score: number;      // centipawns; use Infinity/-Infinity for mate
  mate?: number | null;
  pv: string[];       // SAN moves
}
