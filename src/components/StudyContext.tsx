import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { Chess } from 'chess.js';
import { StudyState, Chapter, MoveNode, NewChapterPayload, StudyVisibility } from '../types/chess';
import { useRole } from './RoleContext';

export const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

// NAGs 1-6 are annotation glyphs; others (positional, etc.) are preserved separately
const ANNOTATION_NAGS = new Set([1, 2, 3, 4, 5, 6]);

/**
 * NAG number → PGN export string.
 * NAGs 1-6 are kept as inline symbols (!, ?, etc.) appended to the SAN move — this is
 * widely accepted by Lichess, Chess.com, ChessBase and conforms to practical PGN usage.
 * NAGs 10, 13, 18, 19 and anything else are exported as $N (the only strictly-legal form).
 * Unicode characters (∞, +−, −+) are NEVER emitted into the PGN movetext — they only
 * appear in the UI (NAG_SYMBOLS in MoveTree.tsx).
 */
const NAG_TO_PGN: Record<number, string> = {
  1: '!', 2: '?', 3: '!!', 4: '??', 5: '!?', 6: '?!',
  // positional NAGs — always $N in exported PGN
  10: '$10', 13: '$13', 18: '$18', 19: '$19',
};

export interface StudyContextType {
  state: StudyState;
  currentChapter: Chapter | null;
  currentMove: MoveNode | null;
  lastNag: number | null;
  nagKey: number;
  setCurrentMove: (moveId: string) => void;
  setCurrentChapter: (id: string) => void;
  navigateBack: () => void;
  navigateForward: () => void;
  addMove: (san: string, uci: string, nextFen: string, moveNumber: number, color: 'w' | 'b') => void;
  addMoveWithComment: (san: string, uci: string, nextFen: string, moveNumber: number, color: 'w' | 'b', comment?: string) => void;
  /** Toggle NAG 1-6 on current move */
  addNag: (nag: number) => void;
  /** Delete a variation branch by its root node id */
  deleteVariation: (rootNodeId: string) => void;
  /** Promote a variation to main line at ALL levels up to the chapter root */
  promoteVariation: (rootNodeId: string) => void;
  /** Export current chapter as full PGN string (with variations, NAGs, comments) */
  exportPgn: () => string | null;
  /** Export ALL chapters as a single PGN file (Study PGN — one game block per chapter) */
  exportStudyPgn: () => string | null;
  createChapter: (payload: NewChapterPayload) => void;
  deleteChapter: (id: string) => void;
  renameChapter: (id: string, title: string) => void;
  /** يضم نص PGN (متدرب رفعه مثلاً) في الفصل الحالي كـ variations، من غير ما يعمل فصل جديد */
  mergePgnIntoChapter: (pgnText: string) => { ok: boolean; message: string };
  /** Coach-only: toggle whether the student can see Engine Eval / Opening Book */
  visibility: StudyVisibility;
  setVisibility: (key: keyof StudyVisibility, value: boolean | number) => void;
  /** Slow-mode: seconds remaining before the student can move again (null = not locked) */
  cooldownLeft: number | null;
  /** Called after the student plays a move — starts the cooldown if slow-mode is on */
  triggerMoveCooldown: () => void;
}

// ── ID generation ─────────────────────────────────────────────────────────────

/**
 * Collision-safe ID generator.
 * Uses crypto.randomUUID() (RFC-4122, available in all modern browsers) with a
 * Math.random() fallback for environments that don't support it.
 * Eliminates the ~0.016% collision probability of the old 7-char Base36 approach.
 */
function uid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback: four random 32-bit words → 128-bit hex string (same entropy as UUID v4)
  const arr = new Uint32Array(4);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(arr);
  } else {
    for (let i = 0; i < 4; i++) arr[i] = Math.random() * 0xffffffff >>> 0;
  }
  return Array.from(arr, v => v.toString(16).padStart(8, '0')).join('-');
}

// ── Tree helpers ──────────────────────────────────────────────────────────────

function makeRoot(chapterId: string, fen: string): MoveNode {
  return {
    id: `root-${chapterId}`,
    san: 'START', uci: '', fen,
    parentId: null, childrenIds: [],
    moveNumber: 0, color: 'w',
  };
}

// ── PGN Parser — full recursive descent ──────────────────────────────────────

/**
 * Tokeniser for PGN movetext.
 * Returns an array of token objects understood by parseMovetext().
 */
type PgnToken =
  | { type: 'move';        san: string }
  | { type: 'number';      value: string }
  | { type: 'nag';         nag: number }
  | { type: 'comment';     text: string }
  | { type: 'varOpen' }
  | { type: 'varClose' }
  | { type: 'result';      value: string };

function tokenisePgn(movetext: string): PgnToken[] {
  const tokens: PgnToken[] = [];
  // Strip headers
  const body = movetext.replace(/\[[^\]]*\]/g, '').trim();
  let i = 0;

  while (i < body.length) {
    const ch = body[i];

    // Whitespace
    if (/\s/.test(ch)) { i++; continue; }

    // Comment { ... }
    if (ch === '{') {
      const end = body.indexOf('}', i);
      if (end === -1) { i++; continue; }
      tokens.push({ type: 'comment', text: body.slice(i + 1, end).trim() });
      i = end + 1;
      continue;
    }

    // Comment ; until end of line
    if (ch === ';') {
      const end = body.indexOf('\n', i);
      i = end === -1 ? body.length : end + 1;
      continue;
    }

    // Variation open/close
    if (ch === '(') { tokens.push({ type: 'varOpen' });  i++; continue; }
    if (ch === ')') { tokens.push({ type: 'varClose' }); i++; continue; }

    // NAG  $N
    if (ch === '$') {
      let j = i + 1;
      while (j < body.length && /\d/.test(body[j])) j++;
      tokens.push({ type: 'nag', nag: parseInt(body.slice(i + 1, j), 10) });
      i = j;
      continue;
    }

    // Result tokens  * 1-0  0-1  1/2-1/2
    if (body.startsWith('1-0', i) || body.startsWith('0-1', i) || body.startsWith('1/2-1/2', i) || ch === '*') {
      const r = ch === '*' ? '*' : body.startsWith('1/2-1/2', i) ? '1/2-1/2' : body.slice(i, i + 3);
      tokens.push({ type: 'result', value: r });
      i += r.length;
      continue;
    }

    // Move number  e.g. "12." or "12..."
    if (/\d/.test(ch)) {
      let j = i;
      while (j < body.length && /[\d.]/.test(body[j])) j++;
      // It's a move-number token — skip (we reconstruct numbers from node data)
      tokens.push({ type: 'number', value: body.slice(i, j) });
      i = j;
      continue;
    }

    // SAN move  — read until whitespace / ( ) { ; $ or end
    let j = i;
    while (j < body.length && !/[\s(){};$]/.test(body[j])) j++;
    const word = body.slice(i, j);
    if (word.length > 0) tokens.push({ type: 'move', san: word });
    i = j;
  }

  return tokens;
}

/**
 * Parse a flat token list into a MoveNode map using a parentId stack.
 *
 * This is a single-pass recursive-descent parser that fully preserves:
 * - Main Line
 * - Variations (arbitrarily nested)
 * - Comments (before or after a move)
 * - NAGs ($N, !, ?, etc.)
 *
 * The chess.js instance is used only for SAN → UCI + FEN computation.
 * If chess.js rejects a SAN (bad token in the PGN) we skip it silently so
 * the rest of the game is not lost.
 */
function parseMovetextTokens(
  tokens: PgnToken[],
  initialFen: string,
  chapterId: string,
): { moves: Record<string, MoveNode>; rootMoveId: string } {
  const root = makeRoot(chapterId, initialFen);
  const moves: Record<string, MoveNode> = { [root.id]: root };

  // Each entry on the stack is [parentId, chess instance at that point]
  type StackEntry = { parentId: string; chess: Chess };
  const stack: StackEntry[] = [];
  let parentId = root.id;
  let chess = new Chess(initialFen);

  // Pending comment/nags to attach to the NEXT move token
  let pendingComment: string | null = null;
  let pendingNags: number[] = [];

  // Last inserted node id at current depth (to attach post-move comment/nag)
  let lastNodeId: string | null = null;

  for (let ti = 0; ti < tokens.length; ti++) {
    const tok = tokens[ti];

    if (tok.type === 'number') continue;
    if (tok.type === 'result') continue;

    if (tok.type === 'comment') {
      if (lastNodeId && moves[lastNodeId]) {
        // Post-move comment — attach to the last played move
        const existing = moves[lastNodeId].comment;
        moves[lastNodeId] = {
          ...moves[lastNodeId],
          comment: existing ? `${existing} ${tok.text}` : tok.text,
        };
      } else {
        // Pre-move comment — will be attached to next move
        pendingComment = pendingComment ? `${pendingComment} ${tok.text}` : tok.text;
      }
      continue;
    }

    if (tok.type === 'nag') {
      if (lastNodeId && moves[lastNodeId]) {
        const existing = moves[lastNodeId].nags ?? [];
        moves[lastNodeId] = { ...moves[lastNodeId], nags: [...existing, tok.nag] };
      } else {
        pendingNags.push(tok.nag);
      }
      continue;
    }

    if (tok.type === 'varOpen') {
      // Save current position: we'll replay from the parent's position
      const parent = moves[parentId];
      if (!parent) continue;
      // We need to step back: the variation starts from the parent of the last move
      const varParentId = lastNodeId
        ? (moves[lastNodeId]?.parentId ?? parentId)
        : parentId;
      const varParentNode = moves[varParentId];
      if (!varParentNode) continue;

      stack.push({ parentId, chess });
      // New chess instance at the position BEFORE the last move (variation's start)
      const varChess = new Chess(varParentNode.fen);
      parentId = varParentId;
      chess = varChess;
      lastNodeId = null;
      continue;
    }

    if (tok.type === 'varClose') {
      if (stack.length > 0) {
        const entry = stack.pop()!;
        parentId = entry.parentId;
        chess = entry.chess;
        lastNodeId = parentId === root.id ? null : parentId;
      }
      continue;
    }

    if (tok.type === 'move') {
      const san = tok.san;

      // Try to play the move on the current chess instance
      let result: ReturnType<Chess['move']>;
      try {
        result = chess.move(san);
      } catch {
        result = null;
      }
      if (!result) {
        // Invalid SAN — skip and keep parsing (don't abort the whole game)
        pendingComment = null;
        pendingNags = [];
        continue;
      }

      // Check if this exact UCI already exists as a child (dedup)
      const uci = `${result.from}${result.to}${result.promotion ?? ''}`;
      const parentNode = moves[parentId];
      const existingChildId = parentNode?.childrenIds.find(
        cid => moves[cid]?.uci === uci,
      );

      if (existingChildId) {
        // Move already in tree — navigate into it, attach any pending metadata
        if (pendingComment && !moves[existingChildId].comment) {
          moves[existingChildId] = { ...moves[existingChildId], comment: pendingComment };
        }
        parentId = existingChildId;
        lastNodeId = existingChildId;
      } else {
        const nodeId = uid();
        const moveNumber = result.color === 'w'
          ? chess.moveNumber() - 1   // after .move(), moveNumber already incremented for white
          : chess.moveNumber();

        const node: MoveNode = {
          id: nodeId,
          san: result.san,
          uci,
          fen: chess.fen(),
          parentId,
          childrenIds: [],
          moveNumber,
          color: result.color as 'w' | 'b',
          ...(pendingComment ? { comment: pendingComment } : {}),
          ...(pendingNags.length ? { nags: [...pendingNags] } : {}),
        };

        moves[parentId] = {
          ...moves[parentId],
          childrenIds: [...moves[parentId].childrenIds, nodeId],
        };
        moves[nodeId] = node;
        parentId = nodeId;
        lastNodeId = nodeId;
      }

      pendingComment = null;
      pendingNags = [];
    }
  }

  return { moves, rootMoveId: root.id };
}

/**
 * Extract the FEN from a PGN's SetUp/FEN headers (for non-standard starting positions).
 */
function extractInitialFen(pgn: string): string {
  const setupMatch = pgn.match(/\[SetUp\s+"1"\]/i);
  if (!setupMatch) return STARTING_FEN;
  const fenMatch = pgn.match(/\[FEN\s+"([^"]+)"\]/i);
  return fenMatch ? fenMatch[1] : STARTING_FEN;
}

/**
 * Main entry point for PGN → internal tree conversion.
 *
 * Fully preserves: Main Line, Variations, Nested Variations, Comments, NAGs.
 * Replaces the old chess.history() approach that silently discarded everything
 * except the Main Line.
 */
function parsePgn(
  pgn: string,
  chapterId: string,
): { moves: Record<string, MoveNode>; rootMoveId: string; initialFen: string } | null {
  try {
    const initialFen = extractInitialFen(pgn);
    const tokens = tokenisePgn(pgn);
    const { moves, rootMoveId } = parseMovetextTokens(tokens, initialFen, chapterId);
    return { moves, rootMoveId, initialFen };
  } catch (e) {
    console.error('[parsePgn] failed:', e);
    return null;
  }
}

// ── PGN Merge helpers (رفع المتدرب لملف PGN وضمه في الفصل الحالي) ────────────

/** نسخة عميقة كفاية من خريطة النقلات — كل node وكل childrenIds array جديدة،
 *  عشان نقدر نعدل فيها بحرية من غير ما نلمس الـ state الأصلي. */
function cloneMovesMap(moves: Record<string, MoveNode>): Record<string, MoveNode> {
  const out: Record<string, MoveNode> = {};
  for (const [id, node] of Object.entries(moves)) {
    out[id] = { ...node, childrenIds: [...node.childrenIds] };
  }
  return out;
}

/** بيستنسخ فرع كامل (node + كل أولاده) من شجرة الـ PGN المرفوع، ويركّبه
 *  كفرع (variation) جديد تحت targetParentId في شجرة الفصل الحالي. */
function cloneParsedSubtree(
  parsedMoves: Record<string, MoveNode>,
  parsedNodeId: string,
  targetParentId: string,
  targetMoves: Record<string, MoveNode>,
): void {
  const src = parsedMoves[parsedNodeId];
  if (!src) return;
  const newId = uid();
  targetMoves[newId] = { ...src, id: newId, parentId: targetParentId, childrenIds: [] };
  targetMoves[targetParentId].childrenIds.push(newId);
  for (const childId of src.childrenIds) {
    cloneParsedSubtree(parsedMoves, childId, newId, targetMoves);
  }
}

/**
 * الدمج الفعلي: بيمشي في شجرة الـ PGN المرفوع نقلة نقلة، ولو لقى نقلة
 * موجودة أصلاً بنفس الـ uci تحت نفس الأب في شجرة الفصل، بيكمل فيها (من
 * غير تكرار) — ولو مش موجودة، بيضيفها كـ variation جديدة (مع كل الفروع
 * اللي جواها زي ما هي في الملف المرفوع).
 */
function mergeParsedIntoExisting(
  parsedMoves: Record<string, MoveNode>,
  parsedNodeId: string,
  existingParentId: string,
  targetMoves: Record<string, MoveNode>,
): void {
  const parsedNode = parsedMoves[parsedNodeId];
  if (!parsedNode) return;

  for (const childId of parsedNode.childrenIds) {
    const parsedChild = parsedMoves[childId];
    if (!parsedChild) continue;
    const existingParent = targetMoves[existingParentId];
    if (!existingParent) continue;

    const matchId = existingParent.childrenIds.find(cid => targetMoves[cid]?.uci === parsedChild.uci);

    if (matchId) {
      // النقلة موجودة أصلاً — كمّل الدمج جواها، واملى أي تعليق/NAG ناقص
      const existing = targetMoves[matchId];
      const patch: Partial<MoveNode> = {};
      if (!existing.comment && parsedChild.comment) patch.comment = parsedChild.comment;
      if ((!existing.nags || existing.nags.length === 0) && parsedChild.nags?.length) patch.nags = parsedChild.nags;
      if (Object.keys(patch).length) targetMoves[matchId] = { ...existing, ...patch };

      mergeParsedIntoExisting(parsedMoves, childId, matchId, targetMoves);
    } else {
      // نقلة/فرع جديد بالكامل — انسخه زي ما هو
      cloneParsedSubtree(parsedMoves, childId, existingParentId, targetMoves);
    }
  }
}

// ── PGN Export helpers ────────────────────────────────────────────────────────

/**
 * Recursively build PGN token list for a line starting at nodeId.
 *
 * NAG export rules (see NAG_TO_PGN above):
 * - NAGs 1-6 → inline symbol appended to SAN (e.g. "Nf3!")
 * - NAGs 10, 13, 18, 19 → $N  (never Unicode in PGN movetext)
 * - Unknown NAGs → $N
 */
function buildPgnLine(
  nodeId: string,
  moves: Record<string, MoveNode>,
  isVariationStart: boolean = false,
): string[] {
  const tokens: string[] = [];
  let current: MoveNode | undefined = moves[nodeId];
  let forceNumber = isVariationStart;

  while (current) {
    const node = current;

    // Move number prefix
    if (node.moveNumber > 0) {
      if (node.color === 'w') {
        tokens.push(`${node.moveNumber}.`);
      } else if (forceNumber) {
        tokens.push(`${node.moveNumber}...`);
      }
    }
    forceNumber = false;

    // Split NAGs: inline (1-6) vs numeric ($N)
    const inlineSuffix: string[] = [];
    const numericNags: string[] = [];
    (node.nags ?? []).forEach(n => {
      const sym = NAG_TO_PGN[n];
      if (sym && n >= 1 && n <= 6) {
        inlineSuffix.push(sym);
      } else if (sym) {
        // Already formatted as "$N" in NAG_TO_PGN for positional NAGs
        numericNags.push(sym);
      } else {
        // Unknown NAG — always $N
        numericNags.push(`$${n}`);
      }
    });

    tokens.push(node.san + inlineSuffix.join(''));
    numericNags.forEach(n => tokens.push(n));

    // Comment
    if (node.comment) {
      tokens.push(`{ ${node.comment} }`);
    }

    // Sub-variations (childrenIds[1..])
    node.childrenIds.slice(1).forEach(varId => {
      tokens.push('(');
      tokens.push(...buildPgnLine(varId, moves, true));
      tokens.push(')');
    });

    // Advance to main line child
    current = node.childrenIds.length > 0 ? moves[node.childrenIds[0]] : undefined;
  }

  return tokens;
}

function chapterToPgn(chapter: Chapter): string {
  const root = chapter.moves[chapter.rootMoveId];
  if (!root || root.childrenIds.length === 0) return '';

  const lines: string[] = [];

  // Headers
  lines.push(`[Event "${chapter.title}"]`);
  lines.push(`[Site "Chess Study"]`);
  lines.push(`[Date "????.??.??"]`);
  lines.push(`[White "?"]`);
  lines.push(`[Black "?"]`);
  lines.push(`[Result "*"]`);
  if (chapter.initialFen && chapter.initialFen !== STARTING_FEN) {
    lines.push(`[SetUp "1"]`);
    lines.push(`[FEN "${chapter.initialFen}"]`);
  }
  lines.push('');

  // Build move text
  const firstMoveId = root.childrenIds[0];
  const tokens = buildPgnLine(firstMoveId, chapter.moves, false);

  // Variations off root (edge case)
  root.childrenIds.slice(1).forEach(varId => {
    tokens.push('(');
    tokens.push(...buildPgnLine(varId, chapter.moves, true));
    tokens.push(')');
  });

  tokens.push('*');

  // Wrap at ~80 chars
  let line = '';
  const moveLines: string[] = [];
  tokens.forEach(token => {
    if (line.length + token.length + 1 > 80 && line.length > 0) {
      moveLines.push(line);
      line = token;
    } else {
      line = line ? `${line} ${token}` : token;
    }
  });
  if (line) moveLines.push(line);

  lines.push(...moveLines);
  return lines.join('\n');
}

// ── Tree integrity helpers ────────────────────────────────────────────────────

/** Collect all descendant node IDs of a given node (inclusive, BFS). */
function collectSubtree(nodeId: string, moves: Record<string, MoveNode>): string[] {
  const ids: string[] = [];
  const queue = [nodeId];
  const seen = new Set<string>();
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (seen.has(id) || !moves[id]) continue; // cycle guard
    seen.add(id);
    ids.push(id);
    moves[id].childrenIds.forEach(cid => queue.push(cid));
  }
  return ids;
}

/**
 * Delete a variation subtree.
 *
 * GUARD: refuses to delete if rootNodeId is the FIRST child of its parent
 * (i.e. the Main Line). Only real variations (childrenIds[1..]) can be deleted.
 * This prevents accidental Main Line deletion even via direct API calls.
 */
function deleteVariationFromMoves(
  rootNodeId: string,
  moves: Record<string, MoveNode>,
): Record<string, MoveNode> {
  const node = moves[rootNodeId];
  if (!node || !node.parentId) return moves; // cannot delete root

  const parent = moves[node.parentId];
  if (!parent) return moves;

  // ── CRITICAL GUARD ──────────────────────────────────────────────────────────
  // Index 0 = Main Line. Only indices 1+ are real variations that can be deleted.
  const indexInParent = parent.childrenIds.indexOf(rootNodeId);
  if (indexInParent <= 0) {
    // Either not found (indexInParent === -1) or it IS the main line (=== 0).
    // In both cases: refuse silently. UI should never call this for index 0,
    // but this ensures data integrity even if called programmatically.
    return moves;
  }
  // ───────────────────────────────────────────────────────────────────────────

  const toRemove = new Set(collectSubtree(rootNodeId, moves));

  const newMoves: Record<string, MoveNode> = {};
  Object.entries(moves).forEach(([id, mv]) => {
    if (toRemove.has(id)) return;
    newMoves[id] = {
      ...mv,
      childrenIds: mv.childrenIds.filter(cid => !toRemove.has(cid)),
    };
  });

  return newMoves;
}

/**
 * Promote a variation to Main Line — RECURSIVE up to the chapter root.
 *
 * The old approach only swapped at one level (the direct parent). This meant
 * that deeply nested variations were promoted locally but remained hidden
 * behind ancestor variations. Now we walk the chain of ancestors and swap at
 * every level until we reach the chapter root, matching Lichess/ChessBase
 * behaviour.
 *
 * Strategy at each level:
 * - targetId becomes childrenIds[0] of its parent.
 * - The old childrenIds[0] is demoted to childrenIds[1].
 * - All other children keep their relative order.
 *
 * The old Main Line is fully preserved as a variation — nothing is deleted.
 */
function promoteVariationInMoves(
  rootNodeId: string,
  moves: Record<string, MoveNode>,
): Record<string, MoveNode> {
  const startNode = moves[rootNodeId];
  if (!startNode || !startNode.parentId) return moves;

  // Work on a mutable shallow copy so we can update iteratively
  const result: Record<string, MoveNode> = { ...moves };

  let targetId = rootNodeId;

  // Walk up the ancestor chain until we reach the root (parentId === null)
  while (true) {
    const node = result[targetId];
    if (!node || !node.parentId) break;

    const parent = result[node.parentId];
    if (!parent) break;

    const oldChildren = parent.childrenIds;
    const varIndex = oldChildren.indexOf(targetId);

    if (varIndex <= 0) {
      // Already main line at this level — keep walking up to handle ancestor levels
      // but the swap here is unnecessary (or node not found).
      // Move the target up one level and continue.
      targetId = node.parentId;
      continue;
    }

    // Swap: make targetId the first child
    const mainLineId = oldChildren[0];
    const others = oldChildren.filter((id, i) => i !== 0 && i !== varIndex);
    const newChildren = [targetId, mainLineId, ...others];

    result[parent.id] = { ...parent, childrenIds: newChildren };

    // Move up one level for the next iteration
    targetId = node.parentId;
  }

  return result;
}

// ── Context ───────────────────────────────────────────────────────────────────

const StudyContext = createContext<StudyContextType | undefined>(undefined);

// ── localStorage persistence key ──────────────────────────────────────────────
const STORAGE_KEY = 'chess_study_state';

function loadPersistedState(): StudyState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StudyState;
    // Sanity check — must have at least one chapter
    if (!parsed?.chapters?.length) return null;
    return parsed;
  } catch {
    return null;
  }
}

export const StudyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { role, socket } = useRole();
  const isCoach = role === 'coach';

  const [state, setState] = useState<StudyState>(() => {
    // Coach: try to restore from localStorage on first load
    // Student: always start empty and wait for coach's sync
    const persisted = loadPersistedState();
    if (persisted) return persisted;
    return { chapters: [], currentChapterId: null, currentMoveId: null, visibility: { engine: true, book: true, boardInteractive: false, moveRateLimitEnabled: false, moveRateLimitSec: 10, allowStudentPgnUpload: false, allowStudentHintArrows: false } };
  });
  const [lastNag, setLastNag] = useState<number | null>(null);
  const [nagKey, setNagKey] = useState(0);

  const currentChapter = state.chapters.find(c => c.id === state.currentChapterId) ?? null;
  const currentMove = currentChapter
    ? (currentChapter.moves[state.currentMoveId ?? ''] ?? null)
    : null;

  // Safe-default visibility (covers state synced from older sessions / before
  // the field existed)
  const visibility: StudyVisibility = {
    engine: true, book: true, boardInteractive: false,
    moveRateLimitEnabled: false, moveRateLimitSec: 10,
    allowStudentPgnUpload: false, allowStudentHintArrows: false,
    ...state.visibility,
  };

  // ── Real-time sync (Socket.io) ──────────────────────────────────────────────
  // Both: broadcast the full study state whenever it changes locally.
  // Both: receive the broadcast state and replace local state with it.

  // Tracks whether the next state change originated from a remote sync
  // (so the coach doesn't immediately re-broadcast a state it just received,
  // and so students don't loop) — guards against feedback loops.
  const applyingRemoteRef = useRef(false);

  // Coach → persist state to localStorage on every change so it survives page refresh
  useEffect(() => {
    if (!isCoach) return;
    if (state.chapters.length === 0) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Quota exceeded or private mode — fail silently
    }
  }, [state, isCoach]);

  // Student → re-request sync from coach whenever socket reconnects after a drop
  useEffect(() => {
    if (!socket || isCoach) return;
    const handleReconnect = () => {
      socket.emit('study:request-sync');
    };
    socket.on('connect', handleReconnect);
    return () => { socket.off('connect', handleReconnect); };
  }, [socket, isCoach]);

  // Both → broadcast full state on every local change
  useEffect(() => {
    if (!socket) return;
    if (applyingRemoteRef.current) { applyingRemoteRef.current = false; return; }
    if (state.chapters.length === 0) return; // skip initial empty state

    socket.emit('study:sync', state);
  }, [state, socket]);

  // Both → listen for full state broadcasts and apply them
  useEffect(() => {
    if (!socket) return;

    const handleSync = (incoming: StudyState) => {
      applyingRemoteRef.current = true;
      setState(incoming);
    };

    socket.on('study:sync', handleSync);

    // Only student asks the coach for the current state on join
    if (!isCoach) {
      socket.emit('study:request-sync');
    }

    return () => {
      socket.off('study:sync', handleSync);
    };
  }, [socket, isCoach]);

  // Coach → respond to a student's sync request with the current state
  useEffect(() => {
    if (!socket) return;
    if (!isCoach) return;

    const handleRequest = () => {
      if (state.chapters.length > 0) {
        socket.emit('study:sync', state);
      }
    };

    socket.on('study:request-sync', handleRequest);
    return () => {
      socket.off('study:request-sync', handleRequest);
    };
  }, [socket, isCoach, state]);

  // ── Chapter management ──────────────────────────────────────────────────────

  const createChapter = useCallback((payload: NewChapterPayload) => {
    const chapterId = uid();
    let moves: Record<string, MoveNode>, rootMoveId: string, initialFen = STARTING_FEN;

    if (payload.mode === 'pgn' && payload.pgn) {
      const parsed = parsePgn(payload.pgn, chapterId);
      if (parsed) {
        moves = parsed.moves;
        rootMoveId = parsed.rootMoveId;
        initialFen = parsed.initialFen;
      } else {
        const root = makeRoot(chapterId, STARTING_FEN);
        moves = { [root.id]: root };
        rootMoveId = root.id;
      }
    } else if (payload.mode === 'fen' && payload.fen) {
      initialFen = payload.fen;
      const root = makeRoot(chapterId, initialFen);
      moves = { [root.id]: root };
      rootMoveId = root.id;
    } else {
      const root = makeRoot(chapterId, STARTING_FEN);
      moves = { [root.id]: root };
      rootMoveId = root.id;
    }

    const newChapter: Chapter = {
      id: chapterId, title: payload.title, initialFen,
      moves, rootMoveId, orientation: 'white',
    };

    setState(prev => ({
      ...prev,
      chapters: [...prev.chapters, newChapter],
      currentChapterId: prev.currentChapterId ?? chapterId,
      currentMoveId: prev.currentMoveId ?? rootMoveId,
    }));
  }, []);

  // ── دمج PGN مرفوع (زي من المتدرب) داخل الفصل الحالي ─────────────────────────
  const mergePgnIntoChapter = useCallback((pgnText: string): { ok: boolean; message: string } => {
    const chapter = state.chapters.find(c => c.id === state.currentChapterId);
    if (!chapter) return { ok: false, message: 'مفيش فصل مفتوح دلوقتي.' };
    if (!pgnText.trim()) return { ok: false, message: 'الملف فاضي.' };

    const parsed = parsePgn(pgnText, chapter.id);
    if (!parsed) return { ok: false, message: 'مقدرتش أقرأ ملف الـ PGN ده — اتأكد إن صيغته صح.' };

    // لازم يبدأ من نفس وضع بداية الفصل عشان الدمج يبقى له معنى
    const chapterInitFen = (chapter.initialFen ?? STARTING_FEN).split(' ').slice(0, 4).join(' ');
    const parsedInitFen  = parsed.initialFen.split(' ').slice(0, 4).join(' ');
    if (chapterInitFen !== parsedInitFen) {
      return { ok: false, message: 'وضع البداية في الملف مختلف عن وضع بداية الفصل — مينفعش يتضم هنا.' };
    }

    setState(prev => {
      const ch = prev.chapters.find(c => c.id === prev.currentChapterId);
      if (!ch) return prev;
      const targetMoves = cloneMovesMap(ch.moves);
      mergeParsedIntoExisting(parsed.moves, parsed.rootMoveId, ch.rootMoveId, targetMoves);
      return {
        ...prev,
        chapters: prev.chapters.map(c => c.id === ch.id ? { ...c, moves: targetMoves } : c),
      };
    });

    return { ok: true, message: 'اتضم الـ PGN بنجاح في الفصل الحالي.' };
  }, [state.chapters, state.currentChapterId]);

  const deleteChapter = useCallback((id: string) => {
    setState(prev => {
      const filtered = prev.chapters.filter(c => c.id !== id);
      const nextId = prev.currentChapterId === id ? (filtered[0]?.id ?? null) : prev.currentChapterId;
      const nextChapter = filtered.find(c => c.id === nextId) ?? null;
      return {
        ...prev,
        chapters: filtered,
        currentChapterId: nextId,
        currentMoveId: nextChapter?.rootMoveId ?? null,
      };
    });
  }, []);

  const renameChapter = useCallback((id: string, title: string) => {
    setState(prev => ({
      ...prev,
      chapters: prev.chapters.map(c => c.id === id ? { ...c, title } : c),
    }));
  }, []);

  // ── Visibility (coach controls what the student sees) ──────────────────────

  const setVisibility = useCallback((key: keyof StudyVisibility, value: boolean | number) => {
    setState(prev => ({
      ...prev,
      visibility: {
        // نسخ كل الحقول الحالية أولاً (بما فيها أي حقل مضاف لاحقًا زي
        // allowStudentHintArrows) بدل إعادة بنائها من قايمة حقول محددة —
        // القايمة القديمة كانت بتسقط أي حقل مش موجود فيها صراحةً في كل
        // مرة يتغير فيها حقل تاني.
        engine: true,
        book: true,
        boardInteractive: false,
        moveRateLimitEnabled: false,
        moveRateLimitSec: 10,
        allowStudentPgnUpload: false,
        allowStudentHintArrows: false,
        ...prev.visibility,
        [key]: value,
      },
    }));
  }, []);

  // ── Slow-mode (تحديد سرعة حركة المتدرب) ─────────────────────────────────────
  // منطق العداد التنازلي عايش هنا مركزي عشان أي component (اللوحة، الشريط
  // الجانبي...إلخ) يقدر يعرض الحالة، مش بس اللوحة نفسها.
  const [cooldownLeft, setCooldownLeft] = useState<number | null>(null);
  const cooldownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const triggerMoveCooldown = useCallback(() => {
    if (role !== 'student' || !visibility.moveRateLimitEnabled) return;
    const sec = visibility.moveRateLimitSec || 10;
    if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
    setCooldownLeft(sec);
    cooldownTimerRef.current = setInterval(() => {
      setCooldownLeft(c => {
        if (c === null || c <= 1) {
          if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
          cooldownTimerRef.current = null;
          return null;
        }
        return c - 1;
      });
    }, 1000);
  }, [role, visibility.moveRateLimitEnabled, visibility.moveRateLimitSec]);

  // لو المدرب قفل الميزة، فك أي قفل شغال فوراً عند المتدرب
  useEffect(() => {
    if (!visibility.moveRateLimitEnabled && cooldownTimerRef.current) {
      clearInterval(cooldownTimerRef.current);
      cooldownTimerRef.current = null;
      setCooldownLeft(null);
    }
  }, [visibility.moveRateLimitEnabled]);

  useEffect(() => () => { if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current); }, []);

  // ── Navigation ──────────────────────────────────────────────────────────────

  const setCurrentChapter = useCallback((id: string) => {
    setState(prev => {
      const chapter = prev.chapters.find(c => c.id === id);
      if (!chapter) return prev;
      return { ...prev, currentChapterId: id, currentMoveId: chapter.rootMoveId };
    });
  }, []);

  const setCurrentMove = useCallback((moveId: string) => {
    setState(prev => {
      const chapter = prev.chapters.find(c => c.id === prev.currentChapterId);
      if (!chapter?.moves[moveId]) return prev;
      return { ...prev, currentMoveId: moveId };
    });
  }, []);

  const navigateBack = useCallback(() => {
    if (!currentMove?.parentId) return;
    setCurrentMove(currentMove.parentId);
  }, [currentMove, setCurrentMove]);

  const navigateForward = useCallback(() => {
    if (!currentMove || currentMove.childrenIds.length === 0) return;
    setCurrentMove(currentMove.childrenIds[0]);
  }, [currentMove, setCurrentMove]);

  // ── Add moves ───────────────────────────────────────────────────────────────

  const addMoveInternal = useCallback((
    san: string, uci: string, nextFen: string,
    moveNumber: number, color: 'w' | 'b',
    comment?: string,
  ) => {
    setState(prev => {
      const chapter = prev.chapters.find(c => c.id === prev.currentChapterId);
      const currentMv = chapter?.moves[prev.currentMoveId ?? ''];
      if (!chapter || !currentMv) return prev;

      const existing = currentMv.childrenIds.find(cid => chapter.moves[cid]?.uci === uci);
      if (existing) return { ...prev, currentMoveId: existing };

      const newId = uid();
      const newNode: MoveNode = {
        id: newId, san, uci, fen: nextFen,
        parentId: prev.currentMoveId,
        childrenIds: [], moveNumber, color,
        ...(comment ? { comment } : {}),
      };

      return {
        ...prev,
        chapters: prev.chapters.map(c =>
          c.id === prev.currentChapterId ? {
            ...c,
            moves: {
              ...c.moves,
              [prev.currentMoveId!]: {
                ...currentMv,
                childrenIds: [...currentMv.childrenIds, newId],
              },
              [newId]: newNode,
            },
          } : c
        ),
        currentMoveId: newId,
      };
    });
  }, []);

  const addMove = useCallback((
    san: string, uci: string, nextFen: string,
    moveNumber: number, color: 'w' | 'b',
  ) => {
    addMoveInternal(san, uci, nextFen, moveNumber, color);
  }, [addMoveInternal]);

  const addMoveWithComment = useCallback((
    san: string, uci: string, nextFen: string,
    moveNumber: number, color: 'w' | 'b', comment?: string,
  ) => {
    addMoveInternal(san, uci, nextFen, moveNumber, color, comment);
  }, [addMoveInternal]);

  // ── NAGs ────────────────────────────────────────────────────────────────────

  const addNag = useCallback((nag: number) => {
    let isAdding = false;
    setState(prev => {
      const chapter = prev.chapters.find(c => c.id === prev.currentChapterId);
      const move = chapter?.moves[prev.currentMoveId ?? ''];
      if (!chapter || !move || move.san === 'START') return prev;

      const currentNags = move.nags ?? [];
      const otherNags = currentNags.filter(n => !ANNOTATION_NAGS.has(n));
      const hasThisNag = currentNags.includes(nag);
      const newNags = hasThisNag ? otherNags : [...otherNags, nag];
      isAdding = !hasThisNag;

      return {
        ...prev,
        chapters: prev.chapters.map(c =>
          c.id === prev.currentChapterId ? {
            ...c,
            moves: {
              ...c.moves,
              [move.id]: { ...move, nags: newNags.length ? newNags : undefined },
            },
          } : c
        ),
      };
    });

    setTimeout(() => {
      if (isAdding) {
        setLastNag(nag);
        setNagKey(k => k + 1);
        setTimeout(() => setLastNag(null), 1200);
      }
    }, 0);
  }, []);

  // ── Variation: delete ───────────────────────────────────────────────────────

  const deleteVariation = useCallback((rootNodeId: string) => {
    setState(prev => {
      const chapter = prev.chapters.find(c => c.id === prev.currentChapterId);
      if (!chapter) return prev;

      const node = chapter.moves[rootNodeId];
      if (!node) return prev;

      // Guard check: deleteVariationFromMoves will also check, but we need
      // the toRemove set here for cursor relocation.
      const parent = chapter.moves[node.parentId ?? ''];
      if (!parent) return prev;
      const indexInParent = parent.childrenIds.indexOf(rootNodeId);
      if (indexInParent <= 0) return prev; // refuse to delete Main Line

      const toRemove = new Set(collectSubtree(rootNodeId, chapter.moves));
      const newMoves = deleteVariationFromMoves(rootNodeId, chapter.moves);

      const newCurrentMoveId = toRemove.has(prev.currentMoveId ?? '')
        ? (node.parentId ?? chapter.rootMoveId)
        : prev.currentMoveId;

      return {
        ...prev,
        chapters: prev.chapters.map(c =>
          c.id === prev.currentChapterId ? { ...c, moves: newMoves } : c
        ),
        currentMoveId: newCurrentMoveId,
      };
    });
  }, []);

  // ── Variation: promote to main line ────────────────────────────────────────

  const promoteVariation = useCallback((rootNodeId: string) => {
    setState(prev => {
      const chapter = prev.chapters.find(c => c.id === prev.currentChapterId);
      if (!chapter) return prev;

      const newMoves = promoteVariationInMoves(rootNodeId, chapter.moves);

      return {
        ...prev,
        chapters: prev.chapters.map(c =>
          c.id === prev.currentChapterId ? { ...c, moves: newMoves } : c
        ),
      };
    });
  }, []);

  // ── Export PGN ──────────────────────────────────────────────────────────────

  const exportPgn = useCallback((): string | null => {
    if (!currentChapter) return null;
    return chapterToPgn(currentChapter);
  }, [currentChapter]);

  /**
   * Export ALL chapters as one PGN file.
   * Each chapter becomes a separate game block separated by a blank line —
   * exactly like Lichess "Study PGN". One download = entire study.
   * Empty chapters are included as stubs so the chapter list is preserved.
   */
  const exportStudyPgn = useCallback((): string | null => {
    if (state.chapters.length === 0) return null;
    const blocks = state.chapters.map(chapter => chapterToPgn(chapter));
    return blocks.join('\n\n');
  }, [state.chapters]);

  // ── Effects ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    // Students don't bootstrap their own "Chapter 1" — they wait for the
    // coach's state via study:sync. Creating a local chapter here would
    // briefly flash before being overwritten by the incoming sync.
    // Coach: only create Chapter 1 if nothing was restored from localStorage.
    if (!isCoach) return;
    if (state.chapters.length === 0) createChapter({ title: 'Chapter 1', mode: 'empty' });
  }, []); // eslint-disable-line


  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA'
      ) return;

      if (e.key === 'ArrowLeft')  { navigateBack();    return; }
      if (e.key === 'ArrowRight') { navigateForward(); return; }

      const NAG_KEYS: Record<string, number> = {
        '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6,
      };
      if (NAG_KEYS[e.key] !== undefined) {
        e.preventDefault();
        addNag(NAG_KEYS[e.key]);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [navigateBack, navigateForward, addNag]);

  return (
    <StudyContext.Provider value={{
      state, currentChapter, currentMove, lastNag, nagKey,
      setCurrentMove, setCurrentChapter,
      navigateBack, navigateForward,
      addMove, addMoveWithComment, addNag,
      deleteVariation, promoteVariation,
      exportPgn, exportStudyPgn,
      createChapter, deleteChapter, renameChapter,
      mergePgnIntoChapter,
      visibility, setVisibility,
      cooldownLeft, triggerMoveCooldown,
    }}>
      {children}
    </StudyContext.Provider>
  );
};

export const useStudy = (): StudyContextType => {
  const ctx = useContext(StudyContext);
  if (!ctx) throw new Error('useStudy must be used within StudyProvider');
  return ctx;
};