import React, { useRef, useState, useEffect } from 'react';
import { Routes, Route, useNavigate, Navigate } from 'react-router-dom';
import { StudyProvider, useStudy } from './context/StudyContext';
import { RoleProvider, useRole } from './context/RoleContext';
import { ChessBoard, THEME_PRESETS } from './components/ChessBoard';
import type { ChessBoardHandle } from './components/ChessBoard';
import { MoveTree } from './components/MoveTree';
import { ChapterSidebar } from './components/ChapterSidebar';
import { EngineEval } from './components/EngineEval';
import { OpeningBook } from './components/OpeningBook';
import { VideoCall } from './components/VideoCall';
import { Upload, Settings, FlipVertical2, ChevronLeft, ChevronRight, Cpu, BookOpen, Eye, EyeOff, KeyRound, Lock, Unlock, Timer, Navigation2, Palette, Lightbulb, Volume2, VolumeX } from 'lucide-react';
import { useMoveSound, isSoundOn, setSoundOn, playMoveSound } from './sound/moveSound';
import { StudentLogin } from './pages/StudentLogin';

// Public Chrome Web Store edition is student-only: no coach controls are shown.
const STORE_BUILD = (import.meta as any).env?.VITE_STORE === '1';

const STUDENT_ONLY = (import.meta as any).env?.VITE_ROLE === 'student';
const COACH_PASSWORD = "admin"; 

const CoachAuthScreen: React.FC<{ onAuthenticate: () => void }> = ({ onAuthenticate }) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === COACH_PASSWORD) {
      onAuthenticate();
    } else {
      setError('Invalid coach password');
    }
  };

  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#42464c',
      color: '#d0c7b3',
      fontFamily: "'Inter', system-ui, sans-serif"
    }}>
      <form onSubmit={handleLogin} style={{
        background: '#3d4147',
        border: '1px solid #4e535c',
        padding: '32px',
        borderRadius: '8px',
        width: '100%',
        maxWidth: '360px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px'
      }}>
        <h2 style={{ textAlign: 'center', color: '#e8e0d0', margin: 0 }}>Coach Login</h2>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ fontSize: '13px', color: '#c8c8c8' }}>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{
              padding: '10px',
              background: '#42464d',
              border: '1px solid #575e67',
              borderRadius: '4px',
              color: '#e8e0d0',
              outline: 'none',
              fontSize: '14px'
            }}
          />
        </div>

        {error && <div style={{ color: '#f44336', fontSize: '12px' }}>{error}</div>}

        <button type="submit" style={{
          background: '#b58863',
          color: '#1a1a1a',
          border: 'none',
          padding: '12px',
          borderRadius: '4px',
          fontWeight: 700,
          cursor: 'pointer',
          fontSize: '14px'
        }}>
          Login
        </button>
      </form>
    </div>
  );
};

interface ProtectedRouteProps {
  children: React.ReactElement;
  allowedRoles: Array<'coach' | 'student'>;
  redirectTo: string;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRoles, redirectTo }) => {
  const { role, verifying } = useRole();

  if (verifying) {
    return (
      <div style={{
        height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#42464c', color: '#d0c7b3', fontFamily: "'Inter', system-ui, sans-serif",
        fontSize: 14,
      }}>
        Verifying permissions...
      </div>
    );
  }

  if (!allowedRoles.includes(role)) {
    return <Navigate to={redirectTo} replace />;
  }

  return children;
};

const StudyLayout: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [flipped, setFlipped] = useState(false);
  const [resetResult, setResetResult] = useState<{ id: string; name: string; password: string }[] | null>(null);
  const [resetting, setResetting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { currentChapter, currentMove, navigateBack, navigateForward, createChapter, addNag, visibility, setVisibility, cooldownLeft } = useStudy();
  const { role, logout, resetAllSessions } = useRole();
  const navigate = useNavigate();

  const isStudent = role === 'student';

  // Move sound: each side (coach / student) turns it on or off for itself.
  const [soundOn, setSoundOnState] = useState<boolean>(isSoundOn());
  useMoveSound(currentChapter?.id ?? null, currentMove ?? null);
  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    setSoundOnState(next);
    if (next) playMoveSound('e4', true);   // short demo; this click also unlocks the browser's audio
  };
  // نفس التصريح المستخدم جوه ChessBoard — المدرب دايمًا يقدر يفعّل الأسهم،
  // المتدرب بس لو المدرب سامحله (بيتحكم في ظهور زرار اللمبة تحت بس، ومش
  // بيأثر على استقبال أي أسهم المدرب بيبعتها صراحةً).
  const hintArrowsAllowed = !isStudent || (visibility?.allowStudentHintArrows ?? false);

  const handleResetSessions = async () => {
    if (resetting) return;
    const confirmed = window.confirm(
      'سيتم تسجيل خروج كل الطلاب فوراً وتوليد باسوردات جديدة لهم.\nهل تريد الاستمرار؟'
    );
    if (!confirmed) return;

    setResetting(true);
    const result = await resetAllSessions();
    setResetting(false);

    if (result.ok && result.students) {
      setResetResult(result.students);
    } else {
      window.alert(result.error ?? 'حدث خطأ غير متوقع');
    }
  };

  // ── اختصار Ctrl+F: قلب اللوحة (Flip board) ──────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA'
      ) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setFlipped(v => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const boardMaxWidth = 'min(calc(100vh - 160px), 100%)';

  // ── تولبار الثيم/الهينت فوق اللوحة — الحالة دلوقتي عايشة هنا (مش جوه
  //    ChessBoard) عشان تبقى في بار مستقل فوق الرقعة، والكومبوننت بيتحكم
  //    فيها عن طريق ref (triggerHint) و prop (pickedPresetIdx) ──────────
  const chessBoardRef = useRef<ChessBoardHandle>(null);
  const [pickedPresetIdx, setPickedPresetIdx] = useState<number | null>(null);
  const [themePickerOpen, setThemePickerOpen] = useState(false);

  // ── حجم اللوحة الفعلي بيتقاس بالبكسل الحقيقي عشان يطابق المساحة
  //    المتاحة فعليًا جوه main، بدل الاعتماد على حساب نظري بـ vh ──────────
  const mainRef = useRef<HTMLElement>(null);
  const topBarRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [boardCapPx, setBoardCapPx] = useState<number | null>(null);

  useEffect(() => {
    const recompute = () => {
      const main = mainRef.current;
      if (!main) return;
      const mainRect = main.getBoundingClientRect();
      const topBarH = topBarRef.current?.getBoundingClientRect().height ?? 36;
      const toolbarH = toolbarRef.current?.getBoundingClientRect().height ?? 40;
      const PADDING_Y = 32; // main: padding '16px 12px' (top+bottom)
      const PADDING_X = 24; // main: padding '16px 12px' (left+right)
      const GAP = 8;         // main: gap بين كل صف والتاني (فوق اللوحة، اللوحة، تحتها)
      // دلوقتي 3 صفوف جوه main (بار الثيم/الهينت، اللوحة، التولبار تحتها)
      // يعني 2 gap بينهم، مش gap واحد بس
      const availableH = mainRect.height - PADDING_Y - GAP * 2 - topBarH - toolbarH;
      const availableW = mainRect.width - PADDING_X;
      const cap = Math.max(160, Math.min(availableH, availableW));
      setBoardCapPx(cap);
    };
    recompute();
    const ro = new ResizeObserver(recompute);
    if (mainRef.current) ro.observe(mainRef.current);
    window.addEventListener('resize', recompute);
    return () => { ro.disconnect(); window.removeEventListener('resize', recompute); };
  }, [sidebarOpen, isStudent]);

  const handleDirectPgnUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = (ev.target?.result as string) ?? '';
      const blocks = text.split(/(?=\[\s*Event\b)/i).filter(b => b.trim() !== '');
      blocks.forEach((block) => {
        const whiteMatch = block.match(/\[White\s+"([^"]*)"\]/i);
        const blackMatch = block.match(/\[Black\s+"([^"]*)"\]/i);
        createChapter({
          title: `${whiteMatch?.[1] ?? 'Unknown'} vs ${blackMatch?.[1] ?? 'Unknown'}`,
          mode: 'pgn',
          pgn: block.trim(),
        });
      });
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.onerror = () => alert('Error reading file');
    reader.readAsText(file);
  };

  const handleCoachTabClick = async () => {
    if (role === 'student') {
      await logout();
    }
    navigate('/');
  };

  const switchToStudent = () => {
    navigate('/student');
  };

  return (
    <>
    <div
      className="h-screen flex flex-col overflow-hidden"
      style={{ background: '#42464c', color: '#d0c7b3', fontFamily: "'Inter', system-ui, sans-serif" }}
    >
      <header style={{
        background: '#3d4147', borderBottom: '1px solid #4e535c',
        minHeight: '46px', display: 'flex', alignItems: 'center', flexWrap: 'wrap',
        gap: '6px', rowGap: 6, padding: '8px 12px', flexShrink: 0, zIndex: 10,
      }}>
        <button
          onClick={() => setSidebarOpen(v => !v)}
          style={{
            width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 4, background: 'transparent', border: 'none', cursor: 'pointer',
            color: '#c8c8c8', flexShrink: 0, transition: 'color 0.15s, background 0.15s',
          }}
        >
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
            <rect x="1" y="2" width="13" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
            <line x1="5" y1="2" x2="5" y2="13" stroke="currentColor" strokeWidth="1.2"/>
          </svg>
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginRight: 8 }}>
          <span style={{
            width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 4, background: '#b58863', color: '#1a1a1a', fontSize: 16, fontWeight: 900,
            flexShrink: 0, lineHeight: 1,
          }}>♟</span>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#e8e0d0', letterSpacing: '-0.3px' }}>
            {isStudent ? 'Student View' : 'Study'}
          </span>
          {currentChapter && (
            <>
              <span style={{ color: '#a29f9a' }}>/</span>
              <span style={{ fontSize: 13, color: '#c8c8c8', fontWeight: 400, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {currentChapter.title}
              </span>
            </>
          )}
        </div>

        <div style={{ flex: 1 }} />

        {isStudent && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '4px 10px', borderRadius: 20,
            background: 'linear-gradient(135deg, rgba(181,136,99,0.16), rgba(181,136,99,0.05))',
            border: '1px solid rgba(181,136,99,0.35)',
            fontSize: 11, fontWeight: 600, color: '#cdae95', letterSpacing: '0.02em',
            flexShrink: 0, whiteSpace: 'nowrap',
          }}>
            <span style={{ fontSize: 12, lineHeight: 1 }}>♛</span>
            Tools by @GM Essam
          </div>
        )}

        {/* ── حالة الأسهم الاسترشادية (Hint) عند المتدرب ────────────────────
            نور أخضر لما المدرب يفعّل allowStudentHintArrows، ورمادي لما يكون
            مقفول — جنبًا إلى جنب مع اختصار Alt اللي بيستخدمه المتدرب لعرضها. */}
        {isStudent && (
          <div
            title={visibility.allowStudentHintArrows ? 'الأسهم الاسترشادية متاحة — اضغط Alt' : 'الأسهم الاسترشادية غير متاحة حاليًا'}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '4px 10px', borderRadius: 20,
              background: visibility.allowStudentHintArrows ? 'rgba(74,222,128,0.12)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${visibility.allowStudentHintArrows ? 'rgba(74,222,128,0.4)' : '#575e67'}`,
              fontSize: 11, fontWeight: 600, letterSpacing: '0.02em',
              flexShrink: 0, whiteSpace: 'nowrap', transition: 'all 0.15s',
            }}
          >
            <span style={{
              width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
              background: visibility.allowStudentHintArrows ? '#4ade80' : '#5a5655',
              boxShadow: visibility.allowStudentHintArrows ? '0 0 6px 1px rgba(74,222,128,0.7)' : 'none',
              transition: 'all 0.2s',
            }} />
            <span style={{ color: visibility.allowStudentHintArrows ? '#86efac' : '#c8c8c8' }}>
              تلميح
            </span>
            <kbd style={{
              fontFamily: 'monospace', fontSize: 10, fontWeight: 700,
              padding: '1px 5px', borderRadius: 3,
              background: '#383b41', border: '1px solid #575e67',
              color: visibility.allowStudentHintArrows ? '#d0c7b3' : '#a39e9e',
            }}>
              Alt
            </kbd>
          </div>
        )}

        <div style={{
          display: STORE_BUILD ? 'none' : 'flex', alignItems: 'center', gap: 2,
          background: '#42464d', border: '1px solid #575e67',
          borderRadius: 6, padding: 3, flexShrink: 0,
        }}>
          <button
            onClick={handleCoachTabClick}
            style={{
              padding: '4px 12px', borderRadius: 4, border: 'none', cursor: 'pointer',
              fontSize: 11, fontWeight: 700, letterSpacing: '0.05em',
              transition: 'all 0.15s',
              background: !isStudent ? '#b58863' : 'transparent',
              color: !isStudent ? '#1a1a1a' : '#c8c8c8',
            }}
          >
            Coach
          </button>
          <button
            onClick={switchToStudent}
            style={{
              padding: '4px 12px', borderRadius: 4, border: 'none', cursor: 'pointer',
              fontSize: 11, fontWeight: 700, letterSpacing: '0.05em',
              transition: 'all 0.15s',
              background: isStudent ? '#b58863' : 'transparent',
              color: isStudent ? '#1a1a1a' : '#c8c8c8',
            }}
          >
            Student
          </button>
        </div>

        {!isStudent && (
          <>
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 14px', borderRadius: 5, cursor: 'pointer',
                fontSize: 12, fontWeight: 600, border: '1px solid #636a74',
                background: '#42464d', color: '#cdae95', transition: 'all 0.15s', flexShrink: 0,
              }}
            >
              <Upload size={12} />
              Load PGN
            </button>
            <input type="file" accept=".pgn,.txt" style={{ display: 'none' }} ref={fileInputRef} onChange={handleDirectPgnUpload} />

            <div style={{
              display: 'flex', alignItems: 'center', gap: 2,
              background: '#42464d', border: '1px solid #575e67',
              borderRadius: 6, padding: 3, flexShrink: 0,
            }}>
              <button
                onClick={() => setVisibility('engine', !visibility.engine)}
                title={visibility.engine ? 'Hide engine from student' : 'Show engine to student'}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '4px 9px', borderRadius: 4, border: 'none', cursor: 'pointer',
                  fontSize: 11, fontWeight: 700, letterSpacing: '0.05em',
                  transition: 'all 0.15s',
                  background: visibility.engine ? '#b58863' : '#5b616b',
                  color: visibility.engine ? '#1a1a1a' : '#f1f3f5',
                }}
              >
                <Cpu size={12} />
                {visibility.engine ? <Eye size={11} /> : <EyeOff size={11} />}
              </button>
              <button
                onClick={() => setVisibility('book', !visibility.book)}
                title={visibility.book ? 'Hide opening book from student' : 'Show opening book to student'}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '4px 9px', borderRadius: 4, border: 'none', cursor: 'pointer',
                  fontSize: 11, fontWeight: 700, letterSpacing: '0.05em',
                  transition: 'all 0.15s',
                  background: visibility.book ? '#b58863' : '#5b616b',
                  color: visibility.book ? '#1a1a1a' : '#f1f3f5',
                }}
              >
                <BookOpen size={12} />
                {visibility.book ? <Eye size={11} /> : <EyeOff size={11} />}
              </button>

              <div style={{ width: 1, height: 16, background: '#50555e', margin: '0 2px' }} />

              {/* تصريح حركة المتدرب على الرقعة */}
              <button
                onClick={() => setVisibility('boardInteractive', !visibility.boardInteractive)}
                title={visibility.boardInteractive ? 'منع المتدرب من الحركة' : 'السماح للمتدرب بالحركة'}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '4px 9px', borderRadius: 4, border: 'none', cursor: 'pointer',
                  fontSize: 11, fontWeight: 700, letterSpacing: '0.05em',
                  transition: 'all 0.15s',
                  background: visibility.boardInteractive ? '#b58863' : '#5b616b',
                  color: visibility.boardInteractive ? '#1a1a1a' : '#f1f3f5',
                }}
              >
                {visibility.boardInteractive ? <Unlock size={12} /> : <Lock size={12} />}
                حركة
              </button>

              {/* تصريح سرعة حركة المتدرب (كول-داون بعد كل نقلة) */}
              <button
                onClick={() => setVisibility('moveRateLimitEnabled', !visibility.moveRateLimitEnabled)}
                title={visibility.moveRateLimitEnabled ? 'إيقاف تحديد سرعة الحركة' : 'تحديد سرعة حركة المتدرب'}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '4px 9px', borderRadius: 4, border: 'none', cursor: 'pointer',
                  fontSize: 11, fontWeight: 700, letterSpacing: '0.05em',
                  transition: 'all 0.15s',
                  background: visibility.moveRateLimitEnabled ? '#60a5fa' : '#5b616b',
                  color: visibility.moveRateLimitEnabled ? '#1a1a1a' : '#f1f3f5',
                }}
              >
                <Timer size={12} />
                سرعة الحركة
              </button>
              {visibility.moveRateLimitEnabled && (
                <input
                  type="number"
                  min={3}
                  max={300}
                  value={visibility.moveRateLimitSec}
                  onChange={e => {
                    const v = Math.max(3, Math.min(300, Number(e.target.value) || 30));
                    setVisibility('moveRateLimitSec', v);
                  }}
                  title="عدد الثواني بين كل نقلة والتانية"
                  style={{
                    width: 38, height: 22, fontSize: 10, fontFamily: 'monospace', textAlign: 'center',
                    background: '#383b41', border: '1px solid #575e67', borderRadius: 4,
                    color: '#d0c7b3',
                  }}
                />
              )}

              {/* تصريح رفع المتدرب لملف PGN وضمه في الفصل الحالي */}
              <button
                onClick={() => setVisibility('allowStudentPgnUpload', !visibility.allowStudentPgnUpload)}
                title={visibility.allowStudentPgnUpload ? 'منع المتدرب من رفع PGN' : 'السماح للمتدرب برفع PGN'}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '4px 9px', borderRadius: 4, border: 'none', cursor: 'pointer',
                  fontSize: 11, fontWeight: 700, letterSpacing: '0.05em',
                  transition: 'all 0.15s',
                  background: visibility.allowStudentPgnUpload ? '#86efac' : '#5b616b',
                  color: visibility.allowStudentPgnUpload ? '#1a1a1a' : '#f1f3f5',
                }}
              >
                <Upload size={12} />
                رفع PGN
              </button>

              {/* تصريح الأسهم الاسترشادية لنقلات الإنجن المقترحة — مستقل تماماً
                  عن visibility.engine، يعني يفضل شغال حتى لو الإنجن ممنوع عن المتدرب */}
              <button
                onClick={() => setVisibility('allowStudentHintArrows', !visibility.allowStudentHintArrows)}
                title={visibility.allowStudentHintArrows ? 'إلغاء الأسهم الاسترشادية للمتدرب' : 'تفعيل الأسهم الاسترشادية للمتدرب'}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '4px 9px', borderRadius: 4, border: 'none', cursor: 'pointer',
                  fontSize: 11, fontWeight: 700, letterSpacing: '0.05em',
                  transition: 'all 0.15s',
                  background: visibility.allowStudentHintArrows ? '#c084fc' : '#5b616b',
                  color: visibility.allowStudentHintArrows ? '#1a1a1a' : '#f1f3f5',
                }}
              >
                <Navigation2 size={12} />
                أسهم استرشادية
              </button>
            </div>

            <button
              onClick={handleResetSessions}
              disabled={resetting}
              title="إنهاء كل جلسات الطلاب وتوليد باسوردات جديدة"
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 12px', borderRadius: 5,
                cursor: resetting ? 'not-allowed' : 'pointer',
                fontSize: 12, fontWeight: 600,
                border: '1px solid #636a74',
                background: '#42464d', color: resetting ? '#9f9f9f' : '#f87171',
                transition: 'all 0.15s', flexShrink: 0,
                opacity: resetting ? 0.6 : 1,
              }}
            >
              <KeyRound size={12} />
              {resetting ? '...' : 'Reset Sessions'}
            </button>
          </>
        )}

        <button
          style={{
            width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 4, background: 'transparent', border: 'none', cursor: 'pointer', color: '#c8c8c8', flexShrink: 0,
          }}
        >
          <Settings size={13} />
        </button>
      </header>

      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {(isStudent || sidebarOpen) && (
          <aside style={{
            width: 280, flexShrink: 0, display: 'flex', flexDirection: 'column',
            minHeight: 0, overflow: 'hidden', borderRight: '1px solid #4e535c',
          }}>
            {/* دايمًا mounted — الإخفاء بصري بس (0 ارتفاع) عشان EngineEval
                يقدر يفضل شغال في الخلفية ويغذي أسهم الهينت (Alt) حتى لو
                اللوحة نفسها مخفية عن المتدرب. لو عملنا هنا شرط رندر React
                عادي ({cond} && <EngineEval/>)، الكومبوننت كان بيتفصل
                (unmount) تمامًا وقت ما visibility.engine تبقى false، وده
                كان بيوقف الـ Stockfish ويمسح الـ engineBridge بالكامل —
                فيلغي أي فصل داخلي بين "إخفاء اللوحة" و"وقف الحساب" جوه
                EngineEval.tsx نفسه. */}
            <div style={{
              flexShrink: 0,
              minHeight: (!isStudent || visibility.engine) ? 260 : 0,
              maxHeight: (!isStudent || visibility.engine) ? 340 : 0,
              borderBottom: (!isStudent || visibility.engine) ? '2px solid #4e535c' : 'none',
              overflow: 'hidden', display: 'flex', flexDirection: 'column',
            }}>
              <EngineEval />
            </div>

            {!isStudent && (
              <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <ChapterSidebar />
              </div>
            )}
            <div style={{
              flexShrink: 0, borderTop: !isStudent ? '1px solid #4e535c' : 'none',
              padding: 10, display: 'flex', flexDirection: 'column', alignItems: 'center',
            }}>
              <VideoCall layout="vertical" />
            </div>
          </aside>
        )}

        <main ref={mainRef} style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          minWidth: 0, overflow: 'hidden', padding: '16px 12px', gap: 8,
        }}>
          {/* ── بار فوق اللوحة: تغيير الثيم + زرار الهينت البديل لـ Alt ──── */}
          <div style={{
            width: '100%',
            maxWidth: boardCapPx ? `${boardCapPx}px` : boardMaxWidth,
            flexShrink: 0,
          }}>
            <div ref={topBarRef} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: '#3d4147', border: '1px solid #4e535c', borderRadius: 5,
              padding: '5px 10px', gap: 8,
            }}>
              <div style={{ position: 'relative' }}>
                <button
                  onClick={() => setThemePickerOpen(o => !o)}
                  title="تغيير ألوان اللوحة"
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: 26, height: 26, borderRadius: 5, border: 'none', cursor: 'pointer',
                    background: themePickerOpen ? '#454a51' : 'transparent',
                    color: themePickerOpen ? '#cdae95' : '#c8c8c8', transition: 'all 0.15s',
                  }}
                >
                  <Palette size={14} />
                </button>

                {themePickerOpen && (
                  <div
                    style={{
                      position: 'absolute', top: '120%', left: 0, zIndex: 31,
                      background: 'rgba(20,18,16,0.97)', borderRadius: 6, padding: 6,
                      display: 'flex', flexDirection: 'column', gap: 4, minWidth: 140,
                      boxShadow: '0 4px 16px rgba(0,0,0,0.5)', border: '1px solid #575e67',
                    }}
                  >
                    {THEME_PRESETS.map((preset, idx) => (
                      <button
                        key={preset.name}
                        onClick={() => { setPickedPresetIdx(idx); setThemePickerOpen(false); }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          padding: '5px 8px', borderRadius: 4, border: 'none', cursor: 'pointer',
                          background: (pickedPresetIdx === idx) ? 'rgba(255,255,255,0.15)' : 'transparent',
                          color: '#e8e0d0', fontSize: 12, textAlign: 'right',
                        }}
                      >
                        <span style={{ display: 'flex', width: 18, height: 18, borderRadius: 3, overflow: 'hidden', flexShrink: 0 }}>
                          <span style={{ flex: 1, background: preset.theme.light }} />
                          <span style={{ flex: 1, background: preset.theme.dark }} />
                        </span>
                        {preset.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* بديل لزرار Alt — لو حد عنده مشكلة كيبورد أو Alt محجوز
                  عند النظام. بيختفي لو المدرب قافل تصريح تفعيل الأسهم. */}
              {hintArrowsAllowed && (
                <button
                  onClick={() => chessBoardRef.current?.triggerHint()}
                  title="أظهر أسهم استرشادية (بديل لزرار Alt)"
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: 26, height: 26, borderRadius: 5, border: 'none', cursor: 'pointer',
                    background: 'transparent', color: '#c8c8c8', transition: 'all 0.15s',
                  }}
                >
                  <Lightbulb size={14} />
                </button>
              )}
            </div>
          </div>

          <div style={{
            width: '100%',
            maxWidth: boardCapPx ? `${boardCapPx}px` : boardMaxWidth,
            aspectRatio: '1 / 1',
            flexShrink: 0,
          }}>
            <ChessBoard ref={chessBoardRef} flipped={flipped} pickedPresetIdx={pickedPresetIdx} />
          </div>

          <div ref={toolbarRef} style={{
            width: '100%',
            maxWidth: boardCapPx ? `${boardCapPx}px` : boardMaxWidth,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: '#3d4147', border: '1px solid #4e535c', borderRadius: 5,
            padding: '5px 10px', flexShrink: 0, gap: 8,
          }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              {!isStudent && (([
                { nag: 1, symbol: '!',  color: '#4caf50', title: 'Good' },
                { nag: 2, symbol: '?',  color: '#f44336', title: 'Mistake' },
                { nag: 3, symbol: '!!', color: '#2196f3', title: 'Brilliant' },
                { nag: 4, symbol: '??', color: '#ff5722', title: 'Blunder' },
                { nag: 5, symbol: '!?', color: '#ff9800', title: 'Interesting' },
                { nag: 6, symbol: '?!', color: '#9c27b0', title: 'Dubious' },
              ] as const).map(({ nag, symbol, color, title }) => {
                const active = currentMove?.nags?.includes(nag);
                return (
                  <button
                    key={nag}
                    onClick={() => addNag(nag)}
                    title={title}
                    style={{
                      width: 32, height: 28, borderRadius: 4, border: active ? `2px solid ${color}` : '2px solid transparent',
                      cursor: 'pointer', fontFamily: 'Georgia, serif', fontSize: 14, fontWeight: 900,
                      lineHeight: 1, padding: 0,
                      background: active ? `rgba(${color === '#4caf50' ? '76,175,80' : color === '#f44336' ? '244,67,54' : color === '#2196f3' ? '33,150,243' : color === '#ff5722' ? '255,87,34' : color === '#ff9800' ? '255,152,0' : '156,39,176'},0.22)` : '#3d4147',
                      color: active ? color : '#a39e9e',
                      transition: 'all 0.15s',
                    }}
                  >
                    {symbol}
                  </button>
                );
              }))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button
                onClick={toggleSound}
                title={soundOn ? 'Move sound: ON (click to mute)' : 'Move sound: OFF (click to turn on)'}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 28, height: 28, borderRadius: 4, border: 'none', cursor: 'pointer',
                  background: soundOn ? '#454a51' : 'transparent',
                  color: soundOn ? '#cdae95' : '#9f9f9f', transition: 'all 0.15s',
                }}
              >
                {soundOn ? <Volume2 size={14} /> : <VolumeX size={14} />}
              </button>
              <button
                onClick={() => setFlipped(v => !v)}
                title="Flip board"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 28, height: 28, borderRadius: 4, border: 'none', cursor: 'pointer',
                  background: flipped ? '#454a51' : 'transparent',
                  color: flipped ? '#cdae95' : '#9f9f9f', transition: 'all 0.15s',
                }}
              >
                <FlipVertical2 size={13} />
              </button>
              <div style={{ width: 1, height: 16, background: '#484d55', flexShrink: 0 }} />
              <button
                onClick={navigateBack}
                title="Previous move (←)"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 28, height: 28, borderRadius: 4, border: 'none', cursor: 'pointer',
                  background: 'transparent', color: '#c8c8c8', transition: 'all 0.15s',
                }}
              >
                <ChevronLeft size={15} />
              </button>
              <button
                onClick={navigateForward}
                title="Next move (→)"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 28, height: 28, borderRadius: 4, border: 'none', cursor: 'pointer',
                  background: 'transparent', color: '#c8c8c8', transition: 'all 0.15s',
                }}
              >
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        </main>

        <aside style={{
          width: 330, flexShrink: 0, display: 'flex', flexDirection: 'column',
          minHeight: 0, overflow: 'hidden',
          borderLeft: '1px solid #4e535c', background: '#3d4147',
        }}>
          {/* ── قفل سرعة الحركة: شريط تحت لوحة الإنجن مباشرة فيه العداد التنازلي ── */}
          {isStudent && cooldownLeft !== null && (
            <div style={{
              flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: '8px 12px', borderBottom: '2px solid #4e535c',
              background: 'rgba(96,165,250,0.06)',
            }}>
              <span style={{ fontSize: 20, fontWeight: 800, color: '#60a5fa', fontFamily: 'monospace', lineHeight: 1 }}>
                {cooldownLeft}
              </span>
              <span style={{ fontSize: 11, color: '#d0c7b3', whiteSpace: 'nowrap' }}>
                فكر كويس… النقلة الجاية بعد شوية
              </span>
            </div>
          )}

          <div style={{
            flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column',
            overflow: 'hidden', borderBottom: '2px solid #4e535c',
          }}>
            <MoveTree />
          </div>

     {(!isStudent || visibility.book) && (
            <div style={{
              flex: 1, minHeight: 0,
              overflow: 'hidden', display: 'flex', flexDirection: 'column',
            }}>
              <OpeningBook />
            </div>
          )}
        </aside>
      </div>
    </div>

    {/* Reset Sessions — shows newly generated student passwords */}
    {resetResult && (
      <div
        style={{
          position: 'fixed', inset: 0, zIndex: 200,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.72)',
        }}
        onClick={e => { if (e.target === e.currentTarget) setResetResult(null); }}
      >
        <div style={{
          width: '100%', maxWidth: 380,
          background: '#43474e', border: '1px solid #5a606a',
          borderRadius: 8, boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
          padding: '20px 22px',
        }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: '#e8e0d0', margin: '0 0 4px' }}>
            تم إنهاء كل الجلسات ✅
          </h2>
          <p style={{ fontSize: 12, color: '#c8c8c8', margin: '0 0 14px' }}>
            باسوردات جديدة — انسخها وأرسلها للطلاب
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
            {resetResult.map(s => (
              <div key={s.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 10px', borderRadius: 5,
                background: '#3e4249', border: '1px solid #575e67',
              }}>
                <span style={{ fontSize: 13, color: '#d0c7b3' }}>{s.name}</span>
                <span style={{
                  fontSize: 13, fontFamily: 'monospace', fontWeight: 700,
                  color: '#cdae95', letterSpacing: '0.05em',
                }}>
                  {s.password}
                </span>
              </div>
            ))}
          </div>

          <button
            onClick={() => setResetResult(null)}
            style={{
              width: '100%', padding: '10px',
              background: '#b58863', color: '#1a1a1a',
              border: 'none', borderRadius: 7,
              fontSize: 13, fontWeight: 700, cursor: 'pointer',
            }}
          >
            تم
          </button>
        </div>
      </div>
    )}
    </>
  );
};

const CoachPage: React.FC = () => {
  return <StudyLayout />;
};

const StudentPage: React.FC = () => {
  return <StudyLayout />;
};

const LoginRoute: React.FC = () => {
  const { role, verifying } = useRole();
  
  if (verifying) return null;
  if (role === 'student') return <Navigate to="/student" replace />;
  
  return <StudentLogin />;
};

export default function App() {
  const [isCoachAuthenticated, setIsCoachAuthenticated] = useState(false);

  return (
    <RoleProvider>
      <StudyProvider>
        <Routes>
          <Route path="/login" element={<LoginRoute />} />
          
          <Route
            path="/"
            element={
              STUDENT_ONLY ? (
                <Navigate to="/login" replace />
              ) : isCoachAuthenticated ? (
                <ProtectedRoute allowedRoles={['coach']} redirectTo="/student">
                  <CoachPage />
                </ProtectedRoute>
              ) : (
                <CoachAuthScreen onAuthenticate={() => setIsCoachAuthenticated(true)} />
              )
            }
          />
          
          <Route 
            path="/student" 
            element={
              <ProtectedRoute allowedRoles={['student']} redirectTo="/login">
                <StudentPage />
              </ProtectedRoute>
            } 
          />
          
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </StudyProvider>
    </RoleProvider>
  );
}