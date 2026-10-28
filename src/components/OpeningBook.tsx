import React, { useEffect, useState, useCallback } from 'react';
import { Chess } from 'chess.js';
import { useStudy } from '../context/StudyContext';
import { useRole, API } from '../context/RoleContext';
import { BookOpen, Trophy, Globe, Database } from 'lucide-react';

const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

interface BookMove { move: string; games: number; white: number; draws: number; black: number; }
interface TopGame {
  id: string; year: string;
  white: { name: string; rating: number };
  black: { name: string; rating: number };
  winner: 'white' | 'black' | 'draw';
  nextMove?: string;
  remainingSans?: string[];
}
type Tab = 'moves' | 'games';
type Source = 'local' | 'lichess';
type ExplorerDb = 'lichess' | 'masters';

const fmtGames = (n: number) => n >= 1_000_000 ? `${(n/1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n/1_000).toFixed(0)}K` : String(n);
const resultLabel = (w: TopGame['winner']) => w === 'white' ? '1-0' : w === 'black' ? '0-1' : '½-½';

/* ============================================================
   LICHESS OPENING EXPLORER — نفس الفكرة المستخرجة من app.js:
   يحتاج توكن شخصي (Bearer) بيتبعت لـ lichess.org بس، ومخزّن
   في localStorage عشان لو احتجت تغيّره مستقبلاً.
   ============================================================ */
const EXPLORER_TOKEN_KEY = 'chessAcademyLichessExplorerToken';
const STORE_BUILD = (import.meta as any).env?.VITE_STORE === '1';
// Store (public) build: the Lichess token is kept on the lesson server and never ships inside the extension.
const EXPLORER_DEFAULT_TOKEN = STORE_BUILD ? '' : '';   // private builds: put a Lichess token here if you want the explorer without the server
const EXPLORER_HOSTS = ['https://explorer.lichess.org', 'https://explorer.lichess.ovh'];
const PGN_RESULT_TOKENS = new Set(['1-0', '0-1', '1/2-1/2', '*']);

function getExplorerToken(): string {
  try {
    const saved = window.localStorage.getItem(EXPLORER_TOKEN_KEY);
    if (saved) return saved;
    window.localStorage.setItem(EXPLORER_TOKEN_KEY, EXPLORER_DEFAULT_TOKEN);
  } catch { /* localStorage غير متاح */ }
  return EXPLORER_DEFAULT_TOKEN;
}
function setExplorerToken(v: string) {
  try { window.localStorage.setItem(EXPLORER_TOKEN_KEY, v); } catch { /* ignore */ }
}

interface ExplorerRawMove { san: string; white: number; draws: number; black: number; }
interface ExplorerRawGame {
  id: string; year?: number | string;
  white?: { name?: string; rating?: number };
  black?: { name?: string; rating?: number };
  winner?: 'white' | 'black';
}
interface ExplorerResponse {
  moves?: ExplorerRawMove[];
  recentGames?: ExplorerRawGame[];
  topGames?: ExplorerRawGame[];
  opening?: { eco?: string; name?: string };
}

export const OpeningBook: React.FC = () => {
  const { currentMove, currentChapter, addMove, addMoveWithComment, setCurrentMove, visibility } = useStudy();
  const { role } = useRole();
  const [source, setSource]   = useState<Source>('lichess');
  const [explorerDb, setExplorerDb] = useState<ExplorerDb>('masters');
  const [tab, setTab]         = useState<Tab>('moves');
  const [moves, setMoves]     = useState<BookMove[]>([]);
  const [topGames, setGames]  = useState<TopGame[]>([]);
  const [status, setStatus]   = useState<'idle'|'loading'|'ok'|'empty'|'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string>('book.db غير متاح');
  const [openingName, setOpeningName] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ text: string; ok: boolean } | null>(null);

  // إذا كان الدور student، اعرض فقط لو الكوتش فعّل ظهور Opening Book
  if (role === 'student' && !visibility.book) {
    return null;
  }

  const fen = currentMove?.fen ?? currentChapter?.initialFen ?? STARTING_FEN;

  const fetchBook = useCallback(async (f: string) => {
    setStatus('loading');
    try {
      // التعديل هنا: استخدام API الموثوق وإضافة الهيدر الخاص بـ ngrok
      const res = await fetch(`${API}/book`, { 
        method: 'POST', 
        headers: { 
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true'
        }, 
        body: JSON.stringify({ fen: f }) 
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setMoves(data.moves ?? []); setGames(data.topGames ?? []);
      setOpeningName(null);
      setStatus((data.moves?.length ?? 0) === 0 && (data.topGames?.length ?? 0) === 0 ? 'empty' : 'ok');
    } catch { setStatus('error'); setErrorMsg('book.db غير متاح'); setMoves([]); setGames([]); }
  }, []);

  // ── Lichess Opening Explorer (مستخرج من app.js) — قاعدتين: lichess (عام) و masters ──
  const fetchLichess = useCallback(async (f: string, db: ExplorerDb) => {
    setStatus('loading');
    const normFen = f === 'start' ? STARTING_FEN : f;
    const token = STORE_BUILD ? 'via-server' : getExplorerToken();
    if (!token) { setStatus('error'); setErrorMsg('محتاج توكن Lichess'); return; }

    const params = new URLSearchParams({ fen: normFen, variant: 'standard' });
    if (db === 'lichess') {
      params.set('speeds', 'blitz,rapid,classical');
      params.set('ratings', '1600,1800,2000,2200,2500');
      params.set('recentGames', '8');
    } else {
      params.set('topGames', '8');
    }
    const path = db === 'masters' ? '/masters' : '/lichess';

    let lastErr: 'auth' | 'rate' | 'other' = 'other';
    for (const host of (STORE_BUILD ? [`${API}/explorer`] : EXPLORER_HOSTS)) {
      try {
        const res = await fetch(`${host}${path}?${params.toString()}`, {
          headers: STORE_BUILD
            ? { Authorization: `Bearer ${sessionStorage.getItem('chess_token') || ''}`, 'ngrok-skip-browser-warning': 'true' }
            : { Authorization: `Bearer ${token}` },
        });
        if (res.status === 401 || res.status === 403) { lastErr = 'auth'; continue; }
        if (res.status === 429) { lastErr = 'rate'; continue; }
        if (!res.ok) { lastErr = 'other'; continue; }

        const data: ExplorerResponse = await res.json();
        const rows: BookMove[] = (data.moves ?? [])
          .map(m => {
            const g = (m.white || 0) + (m.draws || 0) + (m.black || 0);
            const wPct = g ? Math.round((m.white / g) * 100) : 0;
            const dPct = g ? Math.round((m.draws / g) * 100) : 0;
            return { move: m.san, games: g, white: wPct, draws: dPct, black: Math.max(0, 100 - wPct - dPct) };
          })
          .filter(r => r.games > 0);

        const rawGames = db === 'masters' ? data.topGames : data.recentGames;
        const games: TopGame[] = (rawGames ?? []).map(g => ({
          id: g.id,
          year: String(g.year ?? ''),
          white: { name: g.white?.name ?? '?', rating: g.white?.rating ?? 0 },
          black: { name: g.black?.name ?? '?', rating: g.black?.rating ?? 0 },
          winner: g.winner ?? 'draw',
        }));

        setMoves(rows); setGames(games);
        setOpeningName(data.opening?.name ? `${data.opening.eco ? data.opening.eco + ' · ' : ''}${data.opening.name}` : null);
        setStatus(rows.length === 0 && games.length === 0 ? 'empty' : 'ok');
        return;
      } catch {
        lastErr = 'other';
      }
    }

    setStatus('error');
    setOpeningName(null);
    setErrorMsg(
      lastErr === 'auth' ? 'توكن Lichess غير صالح' :
      lastErr === 'rate' ? 'تم تجاوز الحد المسموح من Lichess، حاول لاحقاً' :
      'تعذر الاتصال بـ Lichess'
    );
    setMoves([]); setGames([]);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => { source === 'local' ? fetchBook(fen) : fetchLichess(fen, explorerDb); }, 280);
    return () => clearTimeout(t);
  }, [fen, source, explorerDb, fetchBook, fetchLichess]);
  useEffect(() => { if (!feedback) return; const t = setTimeout(() => setFeedback(null), 2500); return () => clearTimeout(t); }, [feedback]);

  const handleGame = useCallback((game: TopGame) => {
    const sans = game.remainingSans;
    if (!sans || sans.length === 0) { setFeedback({ text: 'لا توجد نقلات', ok: false }); return; }

    const whiteName = game.white?.name ?? '?';
    const blackName = game.black?.name ?? '?';
    const comment = `${whiteName} – ${blackName}, ${game.year} ${resultLabel(game.winner)}`;

    // مكان الوقوف الحالي — هنرجع له بعد ما نضيف كل نقلات المباراة كـ variation،
    // بدل ما نفضل واقفين في آخر نقلة اتضافت (نهاية المباراة)
    const originMoveId = currentMove?.id ?? currentChapter?.rootMoveId ?? null;

    try {
      const chess = new Chess(fen === 'start' ? STARTING_FEN : fen);
      let addedCount = 0;

      for (let i = 0; i < sans.length; i++) {
        const result = chess.move(sans[i]);
        if (!result) break;
        const moveNumber = result.color === 'w' ? chess.moveNumber() - 1 : chess.moveNumber();
        const uci = `${result.from}${result.to}${result.promotion ?? ''}`;

        if (i === 0) {
          addMoveWithComment(result.san, uci, chess.fen(), moveNumber, result.color as 'w'|'b', comment);
        } else {
          addMove(result.san, uci, chess.fen(), moveNumber, result.color as 'w'|'b');
        }
        addedCount++;
      }

      if (originMoveId) setCurrentMove(originMoveId);
      setFeedback({ text: `✓ ${whiteName.split(',')[0]} vs ${blackName.split(',')[0]} — ${addedCount} نقلة`, ok: true });
    } catch { setFeedback({ text: 'خطأ أثناء الإضافة', ok: false }); }
  }, [fen, currentMove, currentChapter, addMove, addMoveWithComment, setCurrentMove]);

  // ── إدراج مباراة من Lichess: بنجيب الـ PGN كامل، نلاقي النقلة الحالية
  //    فيه، ونضيف الباقي كـ variation (زي زرار "Insert as variation" في app.js) ──
  const handleLichessGame = useCallback(async (game: TopGame) => {
    setFeedback({ text: 'جاري تحميل المباراة من Lichess…', ok: true });
    try {
      const res = await fetch(`https://lichess.org/game/export/${game.id}?literate=0`, {
        headers: { Accept: 'application/x-chess-pgn' },
      });
      if (!res.ok) throw new Error();
      const pgn = await res.text();

      const movetext = pgn.replace(/\{[^}]*\}/g, '').replace(/^\[.*\]\s*$/gm, '').trim();
      const sanTokens = movetext.split(/\s+/).filter(t => t && !/^\d+\.+$/.test(t) && !PGN_RESULT_TOKENS.has(t));

      const targetKey = (fen === 'start' ? STARTING_FEN : fen).split(' ').slice(0, 4).join(' ');
      const startKey = STARTING_FEN.split(' ').slice(0, 4).join(' ');

      const replay = new Chess();
      let matchIdx = targetKey === startKey ? 0 : -1;
      for (let i = 0; i < sanTokens.length; i++) {
        const mv = replay.move(sanTokens[i]);
        if (!mv) break;
        if (replay.fen().split(' ').slice(0, 4).join(' ') === targetKey) { matchIdx = i + 1; break; }
      }

      if (matchIdx === -1) { setFeedback({ text: 'الموقف الحالي غير موجود فى هذه المباراة', ok: false }); return; }
      const remaining = sanTokens.slice(matchIdx);
      if (remaining.length === 0) { setFeedback({ text: 'لا توجد نقلات بعد هذا الموقف', ok: false }); return; }

      // مكان الوقوف الحالي — هنرجع له بعد إضافة باقي المباراة كـ variation
      const originMoveId = currentMove?.id ?? currentChapter?.rootMoveId ?? null;

      const chess = new Chess(fen === 'start' ? STARTING_FEN : fen);
      const whiteName = game.white?.name ?? '?';
      const blackName = game.black?.name ?? '?';
      const comment = `${whiteName} – ${blackName}, ${game.year} ${resultLabel(game.winner)} (Lichess)`;
      let addedCount = 0;

      for (let i = 0; i < remaining.length; i++) {
        const result = chess.move(remaining[i]);
        if (!result) break;
        const moveNumber = result.color === 'w' ? chess.moveNumber() - 1 : chess.moveNumber();
        const uci = `${result.from}${result.to}${result.promotion ?? ''}`;

        if (i === 0) addMoveWithComment(result.san, uci, chess.fen(), moveNumber, result.color as 'w'|'b', comment);
        else addMove(result.san, uci, chess.fen(), moveNumber, result.color as 'w'|'b');
        addedCount++;
      }

      if (originMoveId) setCurrentMove(originMoveId);
      setFeedback({ text: `✓ ${whiteName.split(',')[0]} vs ${blackName.split(',')[0]} — ${addedCount} نقلة`, ok: true });
    } catch {
      setFeedback({ text: 'تعذر تحميل المباراة من Lichess', ok: false });
    }
  }, [fen, currentMove, currentChapter, addMove, addMoveWithComment, setCurrentMove]);

  const totalGames = moves.reduce((s, m) => s + m.games, 0);
  const Skeleton = () => (
    <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 5 }}>
      {[1,2,3,4].map(i => <div key={i} style={{ height: 24, borderRadius: 3, background: `rgba(255,255,255,${0.03 + i * 0.01})` }} />)}
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', position: 'relative' }}>

      {feedback && (
        <div style={{ position: 'absolute', bottom: 8, left: 8, right: 8, zIndex: 10, padding: '6px 10px', borderRadius: 5, fontSize: 13, fontFamily: 'monospace', background: feedback.ok ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)', border: `1px solid ${feedback.ok ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`, color: feedback.ok ? '#86efac' : '#fca5a5', textAlign: 'center', pointerEvents: 'none' }}>
          {feedback.text}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 10px', flexShrink: 0, borderBottom: '1px solid #4e535c', background: '#3d4147' }}>
        {/* زرار بديل: Local (book.db) ⇄ Lichess Opening Explorer */}
        <div style={{ display: 'flex', gap: 2, background: '#383c42', borderRadius: 4, padding: 2 }}>
          <button
            title="Local book.db"
            onClick={() => setSource('local')}
            style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '3px 6px', border: 'none', borderRadius: 3, cursor: 'pointer', fontSize: 11, fontWeight: 700, background: source === 'local' ? '#4e535b' : 'transparent', color: source === 'local' ? '#e8e0d0' : '#9f9f9f' }}
          >
            <Database size={10} /> Local
          </button>
          <button
            title="Lichess Opening Explorer"
            onClick={() => setSource('lichess')}
            style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '3px 6px', border: 'none', borderRadius: 3, cursor: 'pointer', fontSize: 11, fontWeight: 700, background: source === 'lichess' ? '#4e535b' : 'transparent', color: source === 'lichess' ? '#e8e0d0' : '#9f9f9f' }}
          >
            <Globe size={10} /> Lichess
          </button>
        </div>
        {status === 'ok' && totalGames > 0 && <span style={{ marginLeft: 'auto', fontSize: 12, color: '#a59f96', fontFamily: 'monospace' }}>{fmtGames(totalGames)}</span>}
      </div>

      {/* لما المصدر Lichess: اختيار قاعدة البيانات — Lichess (عام) أو Masters */}
      {source === 'lichess' && (
        <div style={{ display: 'flex', gap: 4, padding: '5px 10px', flexShrink: 0, background: '#3c4047', borderBottom: '1px solid #4e535c' }}>
          {(['lichess', 'masters'] as ExplorerDb[]).map(db => (
            <button
              key={db}
              onClick={() => setExplorerDb(db)}
              style={{ padding: '3px 9px', border: `1px solid ${explorerDb === db ? '#b58863' : '#5a606a'}`, borderRadius: 10, cursor: 'pointer', fontSize: 11.5, fontWeight: 700, background: explorerDb === db ? 'rgba(181,136,99,0.15)' : 'transparent', color: explorerDb === db ? '#cdae95' : '#9f9f9f', textTransform: 'capitalize' }}
            >
              {db === 'lichess' ? 'Lichess DB' : 'Masters'}
            </button>
          ))}
        </div>
      )}

      {source === 'lichess' && openingName && (
        <div style={{ padding: '4px 10px', fontSize: 12, color: '#cdae95', background: '#3c4047', borderBottom: '1px solid #4e535c', flexShrink: 0 }}>
          {openingName}
        </div>
      )}

      <div style={{ display: 'flex', flexShrink: 0, background: '#3c4047', borderBottom: '1px solid #4e535c' }}>
        {(['moves','games'] as Tab[]).map(id => (
          <button key={id} onClick={() => setTab(id)} style={{ flex: 1, padding: '6px 0', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, background: 'transparent', color: tab === id ? '#cdae95' : '#a59f96', borderBottom: `2px solid ${tab === id ? '#b58863' : 'transparent'}` }}>
            {id === 'moves' ? 'Moves' : 'Top Games'}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {status === 'loading' && <Skeleton />}
        {status === 'error' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 6, textAlign: 'center', padding: '0 12px' }}>
            <BookOpen size={20} style={{ color: '#a29f9a' }} />
            <span style={{ fontSize: 13, color: '#a59f96' }}>{errorMsg}</span>
            {source === 'lichess' && (
              <button
                onClick={() => {
                  if (STORE_BUILD) { fetchLichess(fen, explorerDb); return; }   // store build: the server holds the token
                  const v = window.prompt('الصق توكن Lichess الجديد (lichess.org/account/oauth/token):', getExplorerToken());
                  if (v) { setExplorerToken(v.trim()); fetchLichess(fen, explorerDb); }
                }}
                style={{ fontSize: 12, color: '#cdae95', background: 'transparent', border: '1px solid #5a606a', borderRadius: 3, padding: '3px 8px', cursor: 'pointer' }}
              >
                تحديث التوكن
              </button>
            )}
          </div>
        )}
        {status === 'empty' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 5, opacity: 0.4 }}>
            <BookOpen size={18} style={{ color: '#c8c8c8' }} />
            <span style={{ fontSize: 13, color: '#c8c8c8' }}>لا توجد بيانات لهذا الموقف</span>
          </div>
        )}

        {status === 'ok' && tab === 'moves' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '42px 52px 1fr 40px', padding: '4px 10px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#a59f96', borderBottom: '1px solid #222', background: '#3d4147', position: 'sticky', top: 0 }}>
              <span>Move</span><span>Games</span><span style={{ textAlign: 'center', paddingLeft: 4 }}>W / D / B</span><span style={{ textAlign: 'right' }}>%</span>
            </div>
            {moves.map((row, i) => {
              const pct = totalGames > 0 ? Math.round((row.games / totalGames) * 100) : 0;
              return (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '42px 52px 1fr 40px', alignItems: 'center', padding: '5px 10px', borderBottom: '1px solid #41454c', cursor: 'pointer' }} onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#42464d'} onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                  <span style={{ fontSize: 15, fontFamily: 'monospace', fontWeight: 700, color: '#d0c7b3' }}>{row.move}</span>
                  <span style={{ fontSize: 13, fontFamily: 'monospace', color: '#c8c8c8' }}>{fmtGames(row.games)}</span>
                  <div style={{ paddingRight: 6, paddingLeft: 4 }}>
                    <div style={{ display: 'flex', borderRadius: 2, overflow: 'hidden', height: 5 }}>
                      <div style={{ width: `${row.white}%`, background: '#d8d0c0' }} />
                      <div style={{ width: `${row.draws}%`, background: '#5a5a5a' }} />
                      <div style={{ width: `${row.black}%`, background: '#474c53', outline: '1px solid #5a606a' }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2, fontSize: 11, fontFamily: 'monospace', color: '#a59f96' }}>
                      <span>{row.white}%</span><span>{row.draws}%</span><span>{row.black}%</span>
                    </div>
                  </div>
                  <span style={{ textAlign: 'right', fontSize: 13, fontFamily: 'monospace', color: '#9f9f9f' }}>{pct}%</span>
                </div>
              );
            })}
          </>
        )}

        {status === 'ok' && tab === 'games' && (
          topGames.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 5, opacity: 0.4 }}>
              <Trophy size={18} style={{ color: '#c8c8c8' }} />
              <span style={{ fontSize: 13, color: '#c8c8c8' }}>لا توجد مباريات</span>
            </div>
          ) : (
            <>
              <div style={{ padding: '4px 10px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#a59f96', borderBottom: '1px solid #222', background: '#3d4147', position: 'sticky', top: 0, display: 'flex', justifyContent: 'space-between' }}>
                <span>Players</span><span>Result</span>
              </div>
              <div style={{ padding: '5px 10px', fontSize: 11, color: '#a59f96', borderBottom: '1px solid #41454c', background: '#3c4047', textAlign: 'center' }}>
                اضغط لإضافة المباراة كاملةً كـ Variation
              </div>
              {topGames.map((g, i) => {
                const hasData = source === 'local' ? !!(g.remainingSans && g.remainingSans.length > 0) : !!g.id;
                return (
                  <div
                    key={i}
                    onClick={() => { if (!hasData) return; source === 'local' ? handleGame(g) : handleLichessGame(g); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', cursor: hasData ? 'pointer' : 'default', opacity: hasData ? 1 : 0.4, background: 'transparent', borderBottom: '1px solid #41454c' }}
                    onMouseEnter={e => { if (hasData) (e.currentTarget as HTMLElement).style.background = '#42464d'; }}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
                  >
                    {source === 'local' && hasData && (
                      <span style={{ fontSize: 11, fontFamily: 'monospace', fontWeight: 700, padding: '1px 5px', borderRadius: 3, background: 'rgba(181,136,99,0.15)', border: '1px solid rgba(181,136,99,0.3)', color: '#cdae95', flexShrink: 0 }}>
                        {g.nextMove}{g.remainingSans!.length > 1 && <span style={{ color: '#6b5a3e', marginLeft: 3 }}>+{g.remainingSans!.length - 1}</span>}
                      </span>
                    )}
                    <span style={{ fontSize: 12.5, color: '#d0c7b3', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                      <span style={{ color: '#c8c8c8', fontFamily: 'monospace', fontSize: 11 }}>{g.white?.rating ?? ''}</span>{' '}{g.white?.name ?? '?'}
                      <span style={{ color: '#a59f96', margin: '0 4px' }}>–</span>
                      <span style={{ color: '#c8c8c8', fontFamily: 'monospace', fontSize: 11 }}>{g.black?.rating ?? ''}</span>{' '}{g.black?.name ?? '?'}
                    </span>
                    <span style={{
                      fontSize: 11, fontFamily: 'monospace', fontWeight: 700, flexShrink: 0,
                      padding: '2px 7px', borderRadius: 10, background: '#525760', color: '#e8e0d0',
                    }}>
                      {resultLabel(g.winner)}
                    </span>
                    <span style={{ fontSize: 11, color: '#9f9f9f', fontFamily: 'monospace', flexShrink: 0, width: 34, textAlign: 'right' }}>
                      {g.year}
                    </span>
                  </div>
                );
              })}
            </>
          )
        )}
      </div>
    </div>
  );
};