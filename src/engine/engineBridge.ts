// ─── جسر بسيط بين تحليل الإنجن (EngineEval) وتنفيذ النقلة على اللوحة (ChessBoard) ───
// بيخزن آخر "أفضل نقلة" اللي وصل لها الإنجن، مع الـ FEN اللي اتحسبت عليه، عشان
// أي مستهلك (زي زرار Space) يتأكد إن النقلة لسه متوافقة مع وضع اللوحة الحالي
// قبل ما ينفذها (تجنب تنفيذ نقلة قديمة لو اللوحة اتغيرت في نفس اللحظة).

export interface EngineBestMove {
  uci: string | null;   // مثال: "e2e4" أو "e7e8q"
  fen: string | null;   // الـ FEN اللي الإنجن كان بيحلل عليه وقت ما وصل للنقلة دي
}

type Listener = (state: EngineBestMove) => void;

let state: EngineBestMove = { uci: null, fen: null };
const listeners = new Set<Listener>();

export function setEngineBestMove(uci: string | null, fen: string | null): void {
  state = { uci, fen };
  listeners.forEach((l) => l(state));
}

export function getEngineBestMove(): EngineBestMove {
  return state;
}

export function subscribeEngineBestMove(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

// ─── حالة "كل السطور" — عشان أسهم الهينت (Alt) على اللوحة ────────────────
// نفس فكرة الحالة اللي فوق، لكن بدل ما نحتفظ بأفضل نقلة بس، بنحتفظ بكل
// سطور الـ MultiPV اللي فاتحها المدرب/المتدرب في EngineEval (سطر، سطرين،
// أو تلاتة)، كل سطر ومعاه أول نقلة فيه (uci) والتقييم بتاعه (score، من
// منظور اللاعب اللي هيلعب، يعني رقم أكبر = أحسن). الـ fen بنفس منطق فوق:
// عشان المستهلك (ChessBoard) يتأكد إن السطور دي لسه متوافقة مع وضع اللوحة
// الحالي قبل ما يعرضها كأسهم.

export interface EngineHintLine {
  uci: string;   // أول نقلة في السطر، مثال: "e2e4"
  score: number; // تقييم السطر من منظور اللاعب اللي دوره يلعب (أكبر = أحسن)
}

export interface EngineLinesState {
  lines: EngineHintLine[]; // بترتيب الأفضلية: lines[0] هو أفضل سطر
  fen: string | null;      // الـ FEN اللي السطور دي اتحسبت عليه
}

type LinesListener = (state: EngineLinesState) => void;

let linesState: EngineLinesState = { lines: [], fen: null };
const linesListeners = new Set<LinesListener>();

export function setEngineLines(lines: EngineHintLine[], fen: string | null): void {
  linesState = { lines, fen };
  linesListeners.forEach((l) => l(linesState));
}

export function getEngineLines(): EngineLinesState {
  return linesState;
}

export function subscribeEngineLines(listener: LinesListener): () => void {
  linesListeners.add(listener);
  return () => { linesListeners.delete(listener); };
}
