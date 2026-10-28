import React, { useEffect, useRef, useMemo, useState, useCallback, useImperativeHandle } from 'react';
import { Chess } from 'chess.js';
import { Chessground } from 'chessground';
import type { Api as CgApi } from 'chessground/api';
import type { Key } from 'chessground/types';
import type { DrawShape } from 'chessground/draw';

import 'chessground/assets/chessground.base.css';
import 'chessground/assets/chessground.brown.css';
import 'chessground/assets/chessground.cburnett.css';

import { useStudy, STARTING_FEN } from '../context/StudyContext';
import { useRole } from '../context/RoleContext';
import { getEngineBestMove, getEngineLines } from '../engine/engineBridge';

// ─── ألوان أسهم الهينت (Alt) ─────────────────────────────────────────────
// السهم الأول (أفضل سطر مفتوح) دايمًا أخضر. أي سطر تاني بيتقاس بالفرق بين
// تقييمه وتقييم أفضل سطر: فرق لحد نص نقطة (0.5) لسه يعتبر نقلة عادية/كويسة
// فيبقى أصفر، وأكتر من كده يبقى سهم أحمر (نقلة سيئة نسبيًا).
const HINT_YELLOW_MAX_DIFF = 0.5;
const HINT_ARROW_DURATION_MS = 3500;

// ─── NAG display data ────────────────────────────────────────────────────────
// annotation NAGs (1-6) → symbol + color shown as a badge stuck to the
// destination square of the move (Lichess-study style)
const ANNOTATION_NAGS = new Set([1, 2, 3, 4, 5, 6]);
const NAG_FLASH: Record<number, { symbol: string; color: string }> = {
  1: { symbol: '!',  color: '#4caf50' },
  2: { symbol: '?',  color: '#f44336' },
  3: { symbol: '!!', color: '#2196f3' },
  4: { symbol: '??', color: '#ff5722' },
  5: { symbol: '!?', color: '#ff9800' },
  6: { symbol: '?!', color: '#9c27b0' },
};

// ─── Board color theme ────────────────────────────────────────────────────
// كل ألوان اللوحة اتجمعت هنا في مكان واحد — غيّر القيم دي (أو مرّر theme
// prop تاني للكومبوننت) عشان تغيّر شكل اللوحة، من غير ما تلمس أي CSS تاني.
export interface BoardTheme {
  light: string;       // لون المربعات الفاتحة
  dark: string;        // لون المربعات الغامقة
  lastMove: string;    // هايلايت آخر نقلة
  selected: string;    // هايلايت المربع المختار
  moveDest: string;    // نقطة المربعات اللي ينفع تتحرك لها
}

export const DEFAULT_BOARD_THEME: BoardTheme = {
  light: '#f0d9b5',
  dark: '#b58863',
  lastMove: 'rgba(170,162,58,0.41)',
  selected: 'rgba(20,85,30,0.5)',
  moveDest: 'rgba(20,85,30,0.5)',
};

// ─── Preset themes for the in-board color picker ─────────────────────────
// كل عنصر هنا بيظهر كخيار في زرار تغيير الثيم فوق اللوحة. ضيف/عدّل براحتك.
export interface ThemePreset { name: string; theme: BoardTheme }
export const THEME_PRESETS: ThemePreset[] = [
  {
    name: 'بني كلاسيك',
    theme: DEFAULT_BOARD_THEME,
  },
  {
    name: 'أخضر',
    theme: {
      light: '#eeeed2',
      dark: '#769656',
      lastMove: 'rgba(246,246,105,0.55)',
      selected: 'rgba(20,85,30,0.5)',
      moveDest: 'rgba(20,85,30,0.5)',
    },
  },
  {
    name: 'أزرق',
    theme: {
      light: '#dee3e6',
      dark: '#8ca2ad',
      lastMove: 'rgba(155,199,0,0.41)',
      selected: 'rgba(20,85,140,0.5)',
      moveDest: 'rgba(20,85,140,0.5)',
    },
  },
  {
    name: 'رمادي',
    theme: {
      light: '#e8e8e8',
      dark: '#8f8f8f',
      lastMove: 'rgba(200,200,60,0.45)',
      selected: 'rgba(60,60,60,0.5)',
      moveDest: 'rgba(60,60,60,0.5)',
    },
  },
  {
    name: 'خشبي غامق',
    theme: {
      light: '#c8ac81',
      dark: '#7c5230',
      lastMove: 'rgba(255,215,0,0.35)',
      selected: 'rgba(20,85,30,0.5)',
      moveDest: 'rgba(20,85,30,0.5)',
    },
  },
  {
    name: 'أحمر',
    theme: {
      light: '#f0d0c8',
      dark: '#b5484a',
      lastMove: 'rgba(255,215,0,0.4)',
      selected: 'rgba(120,20,20,0.5)',
      moveDest: 'rgba(120,20,20,0.5)',
    },
  },
];

// الثيم اللي بيظهر مؤقتًا كإشارة "اتفضل العب" لما وضع تحديد سرعة الحركة
// يخلص عنده — لازم يكون لون مستقل تمامًا عن قائمة THEME_PRESETS (مش نفس
// أي ثيم موجود فيها)، عشان يفضل واضح ومتباين حتى لو الطالب أصلاً مختار
// ثيم قريب منه (زي الأخضر). دهبي/أصفر لامع مش موجود في أي preset تاني.
const UNLOCK_FLASH_THEME: BoardTheme = {
  light: '#fff3b0',
  dark: '#e2a900',
  lastMove: 'rgba(255,255,255,0.55)',
  selected: 'rgba(140,95,0,0.55)',
  moveDest: 'rgba(140,95,0,0.55)',
};

// ─── Board & animation styles ────────────────────────────────────────────────
// chessground بيرسم رقعة الشطرنج الأساسية كصورة واحدة (background-image) على
// عنصر cg-board، جايه من ملف ثيم الـ CSS المستورد — مفيش عناصر HTML فعلية
// بكلاس light/dark للمربعات العادية عشان نغيّرها بـ CSS selectors بسيطة.
// الحل: نولّد صورة SVG checkerboard بألوان الثيم ونفرضها بديلة للصورة
// الافتراضية على cg-board نفسها.
function buildCheckerboardDataUri(light: string, dark: string): string {
  const squares: string[] = [];
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const isLight = (row + col) % 2 === 0;
      squares.push(
        `<rect x="${col * 100}" y="${row * 100}" width="100" height="100" fill="${isLight ? light : dark}"/>`,
      );
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800">${squares.join('')}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function buildBoardStyle(theme: BoardTheme): string {
  const boardBg = buildCheckerboardDataUri(theme.light, theme.dark);
  return `
    cg-board {
      background-image: url("${boardBg}") !important;
      background-size: 100% 100% !important;
      background-position: 0 0 !important;
      background-repeat: no-repeat !important;
    }
    cg-board square.last-move { background-color: ${theme.lastMove} !important; }
    cg-board square.selected  { background-color: ${theme.selected} !important; }
    cg-board square.move-dest {
      background: radial-gradient(${theme.moveDest} 22%, rgba(0,0,0,0) 0) !important;
    }
    .cg-wrap coords.ranks coord,
    .cg-wrap coords.files coord {
      font-size: 11px !important;
      font-weight: 700 !important;
      opacity: 0.75 !important;
    }
    @keyframes nagPop {
      0%   { opacity: 0; transform: scale(0.25); }
      60%  { opacity: 1; transform: scale(1.3); }
      100% { opacity: 1; transform: scale(1); }
    }
  `;
}

function getLegalDests(chess: Chess): Map<Key, Key[]> {
  const dests = new Map<Key, Key[]>();
  chess.board().forEach((row, rank) =>
    row.forEach((piece, file) => {
      if (!piece) return;
      const sq = ('abcdefgh'[file] + (8 - rank)) as Key;
      const targets = chess.moves({ square: sq as any, verbose: true }).map((m: any) => m.to as Key);
      if (targets.length) dests.set(sq, targets);
    }),
  );
  return dests;
}

function fenToTurn(fen: string): 'white' | 'black' {
  return fen.split(' ')[1] === 'b' ? 'black' : 'white';
}

// Returns the {col, row} grid position (0-7, 0-7) of a uci move's
// destination square, accounting for board orientation. col/row are
// counted from the top-left corner of the board as rendered.
function destSquareGrid(uci: string | undefined, flipped: boolean): { col: number; row: number } | null {
  if (!uci || uci.length < 4) return null;
  const file = uci.charCodeAt(2) - 97; // 'a' -> 0 .. 'h' -> 7
  const rank = parseInt(uci[3], 10);    // 1 .. 8
  if (file < 0 || file > 7 || Number.isNaN(rank) || rank < 1 || rank > 8) return null;

  const col = flipped ? 7 - file : file;
  const row = flipped ? rank - 1 : 8 - rank;
  return { col, row };
}

interface ChessBoardProps {
  flipped?: boolean;
  /** مرّر ألوان مخصصة للوحة، أو سيبها فاضية عشان تستخدم الثيم الافتراضي. */
  theme?: Partial<BoardTheme>;
}

export interface ChessBoardHandle {
  /** استدعيها من بره (زرار في التولبار مثلاً) عشان تعرض أسهم الهينت
   *  بالظبط زي ما لو المستخدم ضغط Alt — نفس التنفيذ الداخلي بالظبط. */
  triggerHint: () => void;
}

interface ChessBoardProps {
  flipped?: boolean;
  /** مرّر ألوان مخصصة للوحة، أو سيبها فاضية عشان تستخدم الثيم الافتراضي. */
  theme?: Partial<BoardTheme>;
  /** انديكس الثيم المختار من زرار الباليتة (اللي بقى عايش في التولبار فوق
   *  اللوحة دلوقتي، مش جوه الكومبوننت ده) — null يعني استخدم الديفولت. */
  pickedPresetIdx?: number | null;
}

export const ChessBoard = React.forwardRef<ChessBoardHandle, ChessBoardProps>(({ flipped = false, theme, pickedPresetIdx = null }, ref) => {
  // ── فلاش الثيم عند انتهاء وضع تحديد سرعة الحركة ──────────────────────────
  // بيتفعّل مؤقتًا فوق أي ثيم مختار، وبيرجع تلقائي بعد شوية (شوف useEffect
  // تحت اللي بيرصد لحظة الانتقال من مقفول لمتاح).
  const [flashActive, setFlashActive] = useState(false);

  const boardTheme = useMemo<BoardTheme>(() => {
    if (flashActive) return UNLOCK_FLASH_THEME;
    if (pickedPresetIdx !== null) return THEME_PRESETS[pickedPresetIdx].theme;
    return { ...DEFAULT_BOARD_THEME, ...theme };
  }, [theme, pickedPresetIdx, flashActive]);

  const { currentChapter, currentMove, addMove, nagKey, visibility, cooldownLeft, triggerMoveCooldown } = useStudy();
  const { role, socket } = useRole();
  const isStudent = role === 'student';
  // تصريح الأسهم الاسترشادية — مستقل تمامًا عن visibility.engine (ممكن
  // يفضل شغال حتى لو المدرب مانع المتدرب من الاتصال بالإنجن/رؤية تقييمه)
  const hintArrowsAllowed = !isStudent || (visibility.allowStudentHintArrows ?? false);

  // ── تحديد سرعة حركة المتدرب (Slow-mode) ──────────────────────────────────
  // العداد نفسه بيتحسب مركزي في StudyContext (عشان يظهر في أماكن تانية زي
  // تحت الإنجن)، هنا بس بنستخدم قيمته عشان نقفل حركة اللوحة.
  const isRateLimited = role === 'student' && (visibility.moveRateLimitEnabled ?? false);
  const locked = isRateLimited && cooldownLeft !== null && cooldownLeft > 0;

  // لما القفل يخلص (كان متقفل وبقى متاح)، فعّل فلاش الثيم مؤقتًا
  const prevLockedRef = useRef(locked);
  useEffect(() => {
    if (prevLockedRef.current && !locked) {
      setFlashActive(true);
      const t = setTimeout(() => setFlashActive(false), 1600);
      prevLockedRef.current = locked;
      return () => clearTimeout(t);
    }
    prevLockedRef.current = locked;
  }, [locked]);

  // المدرب دايماً يقدر يحرك — المتدرب بس لو المدرب فعّل التصريح، وطالما مش متقفل بالعداد
  const canInteract = (role === 'coach' || (visibility.boardInteractive ?? false)) && !locked;
  const wrapperRef = useRef<HTMLDivElement>(null);
  const boardRef   = useRef<HTMLDivElement>(null);
  const cgRef      = useRef<CgApi | null>(null);
  const chess      = useMemo(() => new Chess(), []);
  const addMoveRef = useRef(addMove);
  const moveAudioRef = useRef<HTMLAudioElement | null>(null);
  const socketRef  = useRef(socket);
  const triggerMoveCooldownRef = useRef(triggerMoveCooldown);


  // ── حالة أسهم الهينت (Alt) ──────────────────────────────────────────────
  // remoteShapesRef: آخر شكل "حقيقي" للسهام/الدوائر (المرسومة يدويًا أو
  // جاية من الطرف التاني) — بنرجعلها لما وقت الهينت يخلص، عشان مانمسحش
  // رسمة حد تاني كانت موجودة قبل الضغط على Alt.
  // hintActiveRef: true طول ما أسهم الهينت ظاهرة، عشان نوقف استقبال شكل
  // جديد من الطرف التاني من إنه يمسح الهينت قبل ما تخلص مدتها.
  const remoteShapesRef = useRef<DrawShape[]>([]);
  const hintActiveRef = useRef(false);
  const hintTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { addMoveRef.current = addMove; }, [addMove]);
  useEffect(() => { socketRef.current = socket; }, [socket]);
  useEffect(() => { triggerMoveCooldownRef.current = triggerMoveCooldown; }, [triggerMoveCooldown]);

  // ── تنفيذ نقلة محليًا (من drag&drop أو من زرار Space) ───────────────────
  // نفس المنطق اللي كان جوه after() بالظبط، لكن مستقل عشان يتنفذ من أكتر
  // من مكان. بيرجع true لو النقلة اتنفذت فعلاً.
  const applyLocalMove = useCallback((from: string, to: string, promotion?: string): boolean => {
    try {
      const m = chess.move({ from: from as any, to: to as any, promotion: (promotion ?? 'q') as any });
      if (!m) return false;
      addMoveRef.current(
        m.san,
        `${m.from}${m.to}${m.promotion ?? ''}`,
        chess.fen(),
        chess.moveNumber(),
        m.color as 'w' | 'b',
      );
      // لو وضع تحديد السرعة شغال للمتدرب، ابدأ عداد القفل بعد النقلة دي
      triggerMoveCooldownRef.current();
      cgRef.current?.set({
        turnColor: fenToTurn(chess.fen()),
        movable: { color: fenToTurn(chess.fen()), dests: getLegalDests(chess) },
      });
      return true;
    } catch {
      cgRef.current?.set({ fen: chess.fen() });
      return false;
    }
  }, [chess]);

  // ── زرار Space: يلعب أفضل نقلة وصل لها الإنجن (EngineEval) لحظيًا ───────
  // بنقرأ من الجسر وقت الضغطة نفسها (مش subscription) عشان دايمًا نجيب آخر
  // قيمة، وبنتأكد إن الـ FEN اللي الإنجن حلل عليه لسه هو نفسه وضع اللوحة
  // الحالي — لو اتغير (مثلاً نقلة اتلعبت أو تم التنقل لموقع تاني) نتجاهلها
  // بدل ما نلعب نقلة قديمة غلط.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;

      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA'].includes(target.tagName)) return;
      if (!canInteract) return;

      const best = getEngineBestMove();
      if (!best.uci || !best.fen || best.fen !== chess.fen()) return;

      e.preventDefault();
      const from = best.uci.slice(0, 2);
      const to = best.uci.slice(2, 4);
      const promotion = best.uci.length === 5 ? best.uci[4] : undefined;
      applyLocalMove(from, to, promotion);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canInteract, chess, applyLocalMove]);

  // ── اعرض أسهم هينت باقتراحات الإنجن (سطر/سطرين/تلاتة حسب المفتوح) ────────
  // نفس المنطق اللي كان جوه handleAltDown بالظبط، لكن اتشال لدالة مستقلة
  // (triggerHintArrows) عشان تتنفذ من أكتر من مكان: زرار Alt على الكيبورد،
  // أو زرار بديل على اللوحة (لو حد عنده مشكلة في الكيبورد أو في مفتاح Alt
  // نفسه — بعض الأنظمة بتحجزه لقوائم النظام مثلاً).
  const clearHintArrows = useCallback(() => {
    hintActiveRef.current = false;
    if (hintTimeoutRef.current) {
      clearTimeout(hintTimeoutRef.current);
      hintTimeoutRef.current = null;
    }
    cgRef.current?.setShapes(remoteShapesRef.current);
  }, []);

  const triggerHintArrows = useCallback(() => {
    if (!hintArrowsAllowed) return; // المدرب قافل الأسهم الاسترشادية عن المتدرب

    const { lines, fen: linesFen } = getEngineLines();
    if (!lines.length || linesFen !== chess.fen()) return;

    const bestScore = lines[0].score;
    const hintShapes: DrawShape[] = lines.map((line, i) => {
      const diff = bestScore - line.score;
      const brush = i === 0 ? 'green' : diff <= HINT_YELLOW_MAX_DIFF ? 'yellow' : 'red';
      return {
        orig: line.uci.slice(0, 2) as Key,
        dest: line.uci.slice(2, 4) as Key,
        brush,
      } as DrawShape;
    });

    hintActiveRef.current = true;
    cgRef.current?.setShapes([...remoteShapesRef.current, ...hintShapes]);

    // ابعت نفس الأسهم للطرف التاني — بغض النظر عن حالة إنجنه هو (مقفول
    // أو مفتوح عنده)، لأن دي مجرد أسهم جاهزة اتحسبت هنا ومبعوتة زي ما
    // هي، مش تحليل بيشتغل عنده. لازم الباك إند يعمل relay لـ
    // 'board:hint-arrows' بين المدرب والمتدرب في نفس الجلسة، زي بالظبط
    // ما بيعمل مع 'board:shapes'.
    socketRef.current?.emit('board:hint-arrows', { shapes: hintShapes, fen: chess.fen() });

    if (hintTimeoutRef.current) clearTimeout(hintTimeoutRef.current);
    hintTimeoutRef.current = setTimeout(clearHintArrows, HINT_ARROW_DURATION_MS);
  }, [chess, hintArrowsAllowed, clearHintArrows]);

  // ── Alt: نفس الزرار البديل، لكن من الكيبورد ─────────────────────────────
  useEffect(() => {
    const handleAltDown = (e: KeyboardEvent) => {
      if (e.key !== 'Alt') return;
      if (e.repeat) return; // تجاهل التكرار لو المستخدم ماسك المفتاح

      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA'].includes(target.tagName)) return;

      e.preventDefault();
      triggerHintArrows();
    };

    window.addEventListener('keydown', handleAltDown);
    return () => {
      window.removeEventListener('keydown', handleAltDown);
      if (hintTimeoutRef.current) clearTimeout(hintTimeoutRef.current);
    };
  }, [triggerHintArrows]);

  // ── اكشف triggerHint للبره (زرار في التولبار فوق اللوحة) ─────────────────
  useImperativeHandle(ref, () => ({
    triggerHint: triggerHintArrows,
  }), [triggerHintArrows]);

  // ── استقبال أسهم الهينت (Alt) لما الطرف التاني يبعتها ────────────────────
  // بتتعرض هنا بنفس منطق العرض المحلي بالظبط (فوق فوق الرسمة الحالية،
  // وترجع تختفي وترجع الشكل الحقيقي بعد نفس المدة) — وده بيشتغل حتى لو
  // إنجن اللاعب الحالي مقفول أو غير مفعّل عنده، لأنها مجرد أسهم جاهزة
  // جاية من الطرف التاني مش تحليل محلي. بنتأكد إن الـ FEN لسه مطابق
  // لوضع اللوحة الحالي عشان ما نعرضش أسهم على موقع اتغيّر.
  //
  // ملحوظة مهمة: هنا مفيش أي شرط على hintArrowsAllowed عن قصد — التصريح
  // ده بيتحكم بس في قدرة المتدرب إنه هو نفسه "يفعّل" الأسهم (بـ Alt أو
  // بالزرار)، لكن أي أسهم المدرب بيبعتها صراحةً (لما هو يضغط Alt/الزرار
  // عنده) لازم تتعرض عند المتدرب دايمًا، بغض النظر عن حالة التصريح.
  useEffect(() => {
    if (!socket) return;
    const handleRemoteHint = (payload: { shapes: DrawShape[]; fen: string }) => {
      if (!payload || !Array.isArray(payload.shapes) || payload.fen !== chess.fen()) return;

      hintActiveRef.current = true;
      cgRef.current?.setShapes([...remoteShapesRef.current, ...payload.shapes]);

      if (hintTimeoutRef.current) clearTimeout(hintTimeoutRef.current);
      hintTimeoutRef.current = setTimeout(() => {
        hintActiveRef.current = false;
        hintTimeoutRef.current = null;
        cgRef.current?.setShapes(remoteShapesRef.current);
      }, HINT_ARROW_DURATION_MS);
    };
    socket.on('board:hint-arrows', handleRemoteHint);
    return () => { socket.off('board:hint-arrows', handleRemoteHint); };
  }, [socket, chess]);

  // ── Real move sound (public/sounds/Move.wav) ────────────────────────────
  const playMoveSound = (_isCapture: boolean) => {
    // Disabled in the extension: the synthesized sound (src/sound/moveSound.ts, with its on/off button)
    // replaces the Move.wav file, so the two never play together.
    return;
    try {
      if (!moveAudioRef.current) {
        moveAudioRef.current = new Audio('/sounds/Move.wav');
      }
      // cloneNode بيسمح بتشغيل الصوت أكتر من مرة بسرعة من غير ما يقطع نفسه
      const audio = moveAudioRef.current.cloneNode(true) as HTMLAudioElement;
      audio.play().catch(() => {});
    } catch (e) {
      console.error('Move sound error:', e);
    }
  };

  const currentFen = currentMove?.fen ?? currentChapter?.initialFen ?? STARTING_FEN;
  const prevFenRef = useRef<string | null>(null);

  // امسح أسهم الهينت فورًا لو الموقع اتغيّر (نقلة اتلعبت، أو تنقل لموقع
  // تاني) — عشان ما يفضلش سهم واقف على وضع قديم مايناسبش اللوحة الحالية.
  useEffect(() => {
    if (!hintActiveRef.current) return;
    hintActiveRef.current = false;
    if (hintTimeoutRef.current) {
      clearTimeout(hintTimeoutRef.current);
      hintTimeoutRef.current = null;
    }
    cgRef.current?.setShapes(remoteShapesRef.current);
  }, [currentFen]);

  // Sync position when move changes
  useEffect(() => {
    const fen = currentFen === 'start' ? STARTING_FEN : currentFen;
    try { chess.load(fen); } catch { return; }
    cgRef.current?.set({
      fen,
      turnColor: fenToTurn(fen),
      movable: {
        color: canInteract ? fenToTurn(fen) : undefined,
        dests: canInteract ? getLegalDests(chess) : new Map(),
      },
    });
    // شغّل صوت النقلة كل ما الموقع يتغيّر فعليًا — سواء من السحب على اللوحة،
    // أو التنقل بالكيبورد (أسهم يمين/شمال)، أو الضغط على نقلة في القائمة،
    // أو مزامنة اللايف من المدرب/المتدرب. أول تحميل (mount) بس مستثنى.
    if (prevFenRef.current !== null && prevFenRef.current !== fen) {
      playMoveSound(false);
    }
    prevFenRef.current = fen;
  }, [currentFen, canInteract]); // eslint-disable-line

  // Flip board when prop changes
  useEffect(() => {
    cgRef.current?.set({ orientation: flipped ? 'black' : 'white' });
  }, [flipped]);

  // Init board once
  useEffect(() => {
    if (!boardRef.current) return;
    cgRef.current?.destroy();
    cgRef.current = null;

    const fen = currentFen === 'start' ? STARTING_FEN : currentFen;
    try { chess.load(fen); } catch { /* ignore */ }

    cgRef.current = Chessground(boardRef.current, {
      fen,
      orientation: flipped ? 'black' : 'white',
      turnColor: fenToTurn(fen),
      movable: {
        free: false,
        color: canInteract ? fenToTurn(fen) : undefined,
        dests: canInteract ? getLegalDests(chess) : new Map(),
        events: {
          after(orig: Key, dest: Key) {
            applyLocalMove(orig as string, dest as string, 'q');
          },
        },
      },
      drawable: {
        enabled: true,
        visible: true,
        // كل ما حد يرسم سهم/دائرة أو يمسحها، ابعتها للطرف التاني فوراً —
        // مشاركة عادلة بين المدرب والطالب (زي بالظبط أي أداة رسم مباشرة).
        onChange: (shapes: DrawShape[]) => {
          remoteShapesRef.current = shapes;
          socketRef.current?.emit('board:shapes', shapes);
        },
      },
      highlight: { lastMove: true, check: true },
      animation: { enabled: true, duration: 150 },
      coordinates: true,
    });

    return () => { cgRef.current?.destroy(); cgRef.current = null; };
  }, []); // eslint-disable-line

  // Resize observer
  useEffect(() => {
    if (!wrapperRef.current) return;
    const ro = new ResizeObserver(() => { cgRef.current?.redrawAll(); });
    ro.observe(wrapperRef.current);
    return () => ro.disconnect();
  }, []);

  // استقبال السهام/الدوائر المرسومة عند الطرف التاني وعرضها فوراً على
  // اللوحة المحلية — setShapes() هنا استدعاء برمجي فمش بيعمل trigger لـ
  // onChange تاني (مفيش loop لا نهائي بين الطرفين).
  useEffect(() => {
    if (!socket) return;
    const handleRemoteShapes = (shapes: DrawShape[]) => {
      const safeShapes = Array.isArray(shapes) ? shapes : [];
      remoteShapesRef.current = safeShapes;
      // لو أسهم الهينت ظاهرة دلوقتي، سيبها زي ما هي وهي اللي هترجّع الشكل
      // الحقيقي لوحدها لما تخلص مدتها — عشان مانقطعش عرض الهينت في نصه.
      if (!hintActiveRef.current) {
        cgRef.current?.setShapes(safeShapes);
      }
    };
    socket.on('board:shapes', handleRemoteShapes);
    return () => { socket.off('board:shapes', handleRemoteShapes); };
  }, [socket]);

  // Annotation glyph (1-6) attached to the current move, if any — stays
  // visible (stuck to the destination square) as long as this move is
  // the current one, instead of flashing in the center and fading out.
  const annotationNag = currentMove?.nags?.find(n => ANNOTATION_NAGS.has(n) && NAG_FLASH[n]) ?? null;
  const nagInfo = annotationNag !== null ? NAG_FLASH[annotationNag] : null;
  const destGrid = nagInfo ? destSquareGrid(currentMove?.uci, flipped) : null;

  return (
    <>
      <style>{buildBoardStyle(boardTheme)}</style>
      <div
        ref={wrapperRef}
        style={{
          width: '100%',
          height: '100%',
          position: 'relative',
          borderRadius: 4,
          overflow: 'hidden',
          boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
        }}
      >
        <div
          ref={boardRef}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        />

        {/* ── NAG badge stuck to the destination square ───────────────────── */}
        {nagInfo && destGrid && (
          <svg
            viewBox="0 0 800 800"
            preserveAspectRatio="none"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 20 }}
          >
            <g
              key={`nag-${currentMove?.id}-${annotationNag}-${nagKey}`}
              style={{ transformBox: 'fill-box', transformOrigin: 'center', animation: 'nagPop 0.35s ease-out' }}
            >
              <circle
                cx={destGrid.col * 100 + 100 - 16}
                cy={destGrid.row * 100 + 16}
                r={17}
                fill={nagInfo.color}
                stroke="rgba(255,255,255,0.9)"
                strokeWidth={2.5}
              />
              <text
                x={destGrid.col * 100 + 100 - 16}
                y={destGrid.row * 100 + 16}
                textAnchor="middle"
                dominantBaseline="central"
                fill="#fff"
                fontFamily="Georgia, serif"
                fontWeight={900}
                fontSize={annotationNag !== null && [3, 4, 5, 6].includes(annotationNag) ? 17 : 22}
              >
                {nagInfo.symbol}
              </text>
            </g>
          </svg>
        )}
      </div>
    </>
  );
});

ChessBoard.displayName = 'ChessBoard';