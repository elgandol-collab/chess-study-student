import React, { useEffect, useRef, useState } from 'react';
import { useStudy } from '../context/StudyContext';
import { useRole } from '../context/RoleContext';
import { Play, Square, Cpu, Layers3, Gauge } from 'lucide-react';
import { Chess } from 'chess.js';
import { localStockfish, EngineLine, EngineStats } from '../engine/localStockfish';
import { setEngineBestMove, setEngineLines } from '../engine/engineBridge';

const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const DEPTH_OPTIONS = [16, 20, 24, 28, 32];
const MULTIPV_OPTIONS = [1, 2, 3];
const THREADS_OPTIONS = [1, 2, 4];

function fmt(score: number) { return score > 0 ? `+${score.toFixed(2)}` : score.toFixed(2); }

function scoreColor(s: number) {
  if (s >= 1.5)  return '#4ade80';
  if (s >= 0.3)  return '#86efac';
  if (s > -0.3)  return '#c0b49a';
  if (s > -1.5)  return '#fca5a5';
  return '#f87171';
}

const PV_MAX_PLIES = 10;

function formatPV(initialFen: string, uciPv: string, maxPlies: number = PV_MAX_PLIES): string {
  if (!uciPv) return '';
  const chess = new Chess(initialFen);
  const moves = uciPv.trim().split(' ').slice(0, maxPlies);
  const parts: string[] = [];
  for (const uci of moves) {
    const from = uci.substring(0, 2), to = uci.substring(2, 4);
    const promotion = uci.length === 5 ? uci[4] : undefined;
    const num = chess.moveNumber();   // number of the move about to be played
    let move;
    try {
      // chess.js v1.x يعمل throw على حركة غير قانونية بدل ما يرجّع null
      move = chess.move({ from, to, promotion } as any);
    } catch {
      break;
    }
    if (!move) break;
    if (move.color === 'w') parts.push(`${num}. ${move.san}`);
    else parts.push(parts.length === 0 ? `${num}… ${move.san}` : move.san);
  }
  return parts.length > 0 ? parts.join(' ') : uciPv;
}

export const EngineEval: React.FC = () => {
  const { currentMove, currentChapter, visibility } = useStudy();
  const { role } = useRole();

  const [lines, setLines]     = useState<EngineLine[]>([]);
  const [stats, setStats]     = useState<EngineStats | null>(null);
  const [status, setStatus]   = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [enabled, setEnabled] = useState(true);

  // ── إعدادات المحرك: قابلة للتحكم من شريط الأدوات بدل ما تكون ثوابت ──
  const [depth, setDepth]     = useState(24);
  const [multiPV, setMultiPV] = useState(2);
  const [threads, setThreads] = useState(1);

  const requestIdRef = useRef(0);

  const fen = currentMove?.fen ?? currentChapter?.initialFen ?? STARTING_FEN;

  // ── مخفي عن المتدرب لما المدرب يكون قافل الإنجن عنده ──────────────────
  // ده لازم يفضل bool عادي بيتحسب هنا، مش early-return قبل الـ hooks:
  // لو عملنا return null هنا قبل الـ useEffect's اللي تحت، عدد الـ hooks
  // اللي بتتنفذ هيتغيّر كل ما الـ role/visibility يتغيّروا (مخالفة لقاعدة
  // الـ Rules of Hooks)، وده كان بيمنع الـ cleanup effects (اللي بتنضف
  // engineBridge) من إنها تتنفذ أصلاً — فتفضل آخر نقلة/سطور اتنشرت قبل
  // كده عالقة في الـ bridge، وأسهم الـ Alt في ChessBoard بتفضل تقرأها
  // وتظهر حتى بعد ما تقفل الإنجن عن المتدرب.
  //
  // ── فصل "إخفاء اللوحة" عن "وقف الحساب" ──────────────────────────────
  // panelHidden: بيتحكم بس في عرض الـ UI (اللوحة نفسها) — لو true، اللوحة
  // بترجع null في الآخر، بس الـ hooks لسه بتتنفذ.
  // analysisDisabled: بيتحكم في تشغيل/إيقاف Stockfish فعليًا. أسهم الهينت
  // (Alt) مفروض تكون مستقلة تمامًا عن ظهور اللوحة (زي ما موضّح في تعليق
  // ChessBoard.tsx)، فلو allowStudentHintArrows مفعّلة، الإنجن لازم يفضل
  // شغال في الخلفية (بيحسب بس مش ظاهر) عشان يبقى عنده سطور يوريها وقت
  // الضغط على Alt، حتى لو اللوحة نفسها مخفية عن المتدرب.
  const panelHidden = role === 'student' && !visibility.engine;
  const hintArrowsAllowed = role !== 'student' || (visibility.allowStudentHintArrows ?? false);
  const analysisDisabled = panelHidden && !hintArrowsAllowed;

  useEffect(() => {
    if (analysisDisabled || !enabled) {
      localStockfish.stop();
      setLines([]);
      setStats(null);
      setStatus('idle');
      return;
    }

    requestIdRef.current += 1;
    const myRequestId = requestIdRef.current;

    setStatus('loading');
    const timer = setTimeout(() => {
      const turn = fen.split(' ')[1] || 'w';
      const mult = turn === 'b' ? -1 : 1;

      localStockfish.analyze(
        fen,
        { multipv: multiPV, depth, threads },
        (rawLines) => {
          if (myRequestId !== requestIdRef.current) return;
          const converted: EngineLine[] = rawLines.slice(0, multiPV).map((l) => ({
            depth: l.depth,
            score: l.score * mult,
            mateIn: l.mateIn != null ? l.mateIn * mult : l.mateIn,
            pv: l.pv,
          }));
          setLines(converted);
          setStatus(localStockfish.isReady ? 'ready' : 'loading');
        },
        (s) => {
          if (myRequestId !== requestIdRef.current) return;
          setStats(s);
        },
      );
    }, 300);

    return () => { clearTimeout(timer); };
  }, [fen, enabled, depth, multiPV, threads, analysisDisabled]);

  useEffect(() => {
    if (analysisDisabled || !enabled) return;
    localStockfish.init().catch(() => setStatus('error'));
  }, [enabled, analysisDisabled]);

  // ── نشر أفضل نقلة للجسر بتاع الإنجن عشان اللوحة تقدر تلعبها بزرار Space ──
  // ده مقصود يبقى مربوط بـ panelHidden (مش analysisDisabled): حتى لو
  // الإنجن شغال في الخلفية عشان أسهم الهينت، "أفضل نقلة" (واللعب الآلي
  // بزرار Space) لازم يفضل متاح بس لو اللوحة فعلاً ظاهرة للمستخدم — عشان
  // منمنعش استغلال الحساب اللي شغال في الخلفية كطريقة تانية للغش من غير
  // ما اللوحة تكون ظاهرة أصلاً.
  useEffect(() => {
    if (panelHidden || !enabled || !lines[0]?.pv) {
      setEngineBestMove(null, null);
      return;
    }
    const firstUci = lines[0].pv.trim().split(' ')[0] ?? null;
    setEngineBestMove(firstUci, fen);
  }, [enabled, lines, fen, panelHidden]);

  useEffect(() => {
    return () => setEngineBestMove(null, null);
  }, []);

  // ── نشر كل السطور المفتوحة حاليًا (1، 2، أو 3 حسب multiPV) للجسر عشان ──
  // أسهم الهينت (Alt) على اللوحة تعرض بالظبط نفس عدد السطور اللي المتدرب
  // فاتحها هنا — لو فاتح سطر واحد يظهر سهم واحد، لو تلاتة يظهر تلات أسهم.
  useEffect(() => {
    if (analysisDisabled || !enabled || lines.length === 0) {
      setEngineLines([], null);
      return;
    }
    const hintLines = lines
      .filter((l) => !!l.pv)
      .map((l) => ({ uci: l.pv.trim().split(' ')[0], score: l.score }));
    setEngineLines(hintLines, fen);
  }, [enabled, lines, fen, analysisDisabled]);

  useEffect(() => {
    return () => setEngineLines([], null);
  }, []);

  const best = lines[0];
  const bestScore = best
    ? (best.score === 99 || best.score === -99)
      ? `M${Math.abs(best.mateIn ?? 0)}`
      : fmt(best.score)
    : null;

  // الـ return null بيجي هنا، بعد ما كل الـ hooks اللي فوق اتنفذت بنفس
  // الترتيب في كل مرة — ده اللي بيضمن إن الـ cleanup تاعها يشتغل صح.
  if (panelHidden) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#3e4249' }}>
      {/* ── صف الحالة: تشغيل/إيقاف، اسم المحرك، التقييم الحالي ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '6px 10px', borderBottom: '1px solid #4e535c', flexShrink: 0,
      }}>
        <span style={{
          width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
          background: !enabled ? '#585f68' : status === 'ready' ? '#4ade80' : status === 'loading' ? '#facc15' : status === 'error' ? '#f87171' : '#585f68',
          boxShadow: enabled && status === 'ready' ? '0 0 6px #4ade8088' : 'none',
          transition: 'background 0.3s',
        }} />

        <span style={{ fontSize: 13, fontWeight: 700, color: '#c8c8c8', letterSpacing: '0.06em', textTransform: 'uppercase', flex: 1 }}>
          Stockfish
          {enabled && status === 'loading' && (
            <span style={{ marginLeft: 6, fontSize: 12, color: '#c8c8c8', fontWeight: 700 }}>analysing…</span>
          )}
        </span>

        {enabled && stats && (
          <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#d0c7b3' }}>
            d{best?.depth ?? 0}/{depth}
          </span>
        )}

        {enabled && bestScore && (
          <span style={{
            fontSize: 14, fontFamily: 'monospace', fontWeight: 700,
            color: scoreColor(best.score),
            padding: '1px 6px', borderRadius: 3,
            background: 'rgba(255,255,255,0.05)',
          }}>
            {bestScore}
          </span>
        )}

        <button
          onClick={() => setEnabled(v => !v)}
          title={enabled ? 'Stop engine' : 'Start engine'}
          style={{
            width: 26, height: 26, borderRadius: 4, border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: enabled ? 'rgba(248,113,113,0.12)' : 'rgba(74,222,128,0.12)',
            color: enabled ? '#f87171' : '#4ade80',
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = '0.75'}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = '1'}
        >
          {enabled ? <Square size={11} fill="#f87171" /> : <Play size={12} fill="#4ade80" />}
        </button>
      </div>

      {/* ── شريط إعدادات المحرك: Depth / MultiPV / Threads ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '5px 10px', borderBottom: '1px solid #4e535c', flexShrink: 0,
        opacity: enabled ? 1 : 0.4, pointerEvents: enabled ? 'auto' : 'none',
      }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#c8c8c8' }}>
          <Gauge size={11} />
          <select
            value={depth}
            onChange={e => setDepth(Number(e.target.value))}
            style={{
              background: '#383b41', border: '1px solid #575e67', borderRadius: 3,
              color: '#d0c7b3', fontSize: 10, fontFamily: 'monospace', padding: '2px 4px',
            }}
          >
            {DEPTH_OPTIONS.map(d => <option key={d} value={d}>d{d}</option>)}
          </select>
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#c8c8c8' }}>
          <Layers3 size={11} />
          <select
            value={multiPV}
            onChange={e => setMultiPV(Number(e.target.value))}
            style={{
              background: '#383b41', border: '1px solid #575e67', borderRadius: 3,
              color: '#d0c7b3', fontSize: 10, fontFamily: 'monospace', padding: '2px 4px',
            }}
          >
            {MULTIPV_OPTIONS.map(n => <option key={n} value={n}>{n} lines</option>)}
          </select>
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#c8c8c8' }}>
          <Cpu size={11} />
          <select
            value={threads}
            onChange={e => setThreads(Number(e.target.value))}
            title="محتاج بنية stockfish.wasm متعدد الـ threads + رؤوس COOP/COEP عشان يشتغل فوق 1"
            style={{
              background: '#383b41', border: '1px solid #575e67', borderRadius: 3,
              color: '#d0c7b3', fontSize: 10, fontFamily: 'monospace', padding: '2px 4px',
            }}
          >
            {THREADS_OPTIONS.map(t => <option key={t} value={t}>{t} CPU{t > 1 ? 's' : ''}</option>)}
          </select>
        </label>
      </div>

      {/* ── سطور التحليل الحية (MultiPV) ── */}
      <div style={{ flex: 1, minHeight: 0, maxHeight: 300, overflowY: 'auto' }}>
        {!enabled && (
          <div style={{ textAlign: 'center', fontSize: 13, color: '#a29f9a', padding: '10px 12px' }}>
            Engine stopped
          </div>
        )}

        {enabled && status === 'error' && (
          <div style={{ textAlign: 'center', fontSize: 13, color: '#f87171', padding: '10px 12px' }}>
            Engine offline
          </div>
        )}

        {enabled && (status === 'loading' || status === 'ready') && lines.length === 0 && (
          <div style={{ display: 'flex', gap: 6, padding: '8px 10px', flexDirection: 'column' }}>
            {Array.from({ length: multiPV }).map((_, i) => (
              <div key={i} style={{ height: 18, borderRadius: 3, background: '#454a51', animation: 'pulse 1.4s ease infinite', opacity: 0.6 }} />
            ))}
          </div>
        )}

        {enabled && lines.map((line, i) => {
          const isMate = line.score === 99 || line.score === -99;
          const scoreStr = isMate ? `M${Math.abs(line.mateIn ?? 0)}` : fmt(line.score);
          const pvStr = formatPV(fen, line.pv);
          return (
            <div
              key={i}
              style={{
                display: 'flex', flexDirection: 'column', gap: 2,
                padding: '5px 10px',
                borderBottom: i < lines.length - 1 ? '1px solid #464b52' : 'none',
              }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#42474e'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 15, fontFamily: 'monospace', fontWeight: 700, color: scoreColor(line.score), flexShrink: 0, width: 44 }}>
                  {scoreStr}
                </span>
                <span style={{ fontSize: 11, color: '#a59f96', fontFamily: 'monospace', flexShrink: 0 }}>
                  d{line.depth}
                </span>
              </div>
              <span style={{
                fontSize: 12, fontFamily: 'monospace', color: '#c8c8c8',
                display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                overflow: 'hidden', whiteSpace: 'normal', lineHeight: 1.35,
              }} title={pvStr}>
                {pvStr}
              </span>
            </div>
          );
        })}
      </div>

      <style>{`@keyframes pulse { 0%,100%{opacity:.4} 50%{opacity:.9} }`}</style>
    </div>
  );
};
