import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

export type Role = 'coach' | 'student';

export interface Student {
  id: string;
  name: string;
}

interface RoleContextValue {
  role: Role;
  setRole: (r: Role) => void;
  currentStudent: Student | null;
  token: string | null;
  login: (password: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
  verifying: boolean;
  socket: Socket | null;
  resetAllSessions: () => Promise<{ ok: boolean; students?: { id: string; name: string; password: string }[]; error?: string }>;
}

const RoleContext = createContext<RoleContextValue>({
  role: 'coach',
  setRole: () => {},
  currentStudent: null,
  token: null,
  login: async () => ({ ok: false }),
  logout: async () => {},
  verifying: false,
  socket: null,
  resetAllSessions: async () => ({ ok: false }),
});

// ── عنوان الـ Backend ──────────────────────────────────────────────────────
// القيمة الافتراضية '' (نفس origin الفرونت إند، بورت 5000) — كل طلبات
// /auth, /evaluate, /book, /socket.io تُحوَّل تلقائياً إلى server.js (3001)
// عبر الـ proxy المعرّف في vite.config.js.
// لو احتجت تشاور على backend مختلف (مثلاً سيرفر بعيد)، عرّف VITE_API_URL.
const _storedApi = (() => { try { return localStorage.getItem('chess_server_url') || ''; } catch { return ''; } })();
export const API = _storedApi || (import.meta as any).env?.VITE_API_URL || '';

// هيدر إضافي مطلوب فقط عند استخدام ngrok مباشرة على الـ backend (Free plan)
const NGROK_HEADERS = { 'ngrok-skip-browser-warning': 'true' };

// The coach key is pasted once in the coach extension's options page (server.js creates it in coach.key).
const readCoachKey = (): string => { try { return localStorage.getItem('chess_coach_key') || ''; } catch { return ''; } };
const IS_COACH_BUILD = (import.meta as any).env?.VITE_ROLE === 'coach';
// Coach build only: if the key is missing or wrong, simply ask for it and remember it.
const askCoachKey = (): string => {
  const k = (window.prompt('Paste the COACH KEY (it is shown in the black server window, also saved in coach.key)\n\u0627\u0644\u0635\u0642 \u0645\u0641\u062a\u0627\u062d \u0627\u0644\u0645\u062f\u0631\u0628 (\u064a\u0638\u0647\u0631 \u0641\u064a \u0646\u0627\u0641\u0630\u0629 \u0627\u0644\u0633\u064a\u0631\u0641\u0631 \u0627\u0644\u0633\u0648\u062f\u0627\u0621)') || '').trim();
  if (k) { try { localStorage.setItem('chess_coach_key', k); } catch { /* ignore */ } }
  return k;
};
// Coach build: fetch the key from the server running on THIS computer (port 3002, loopback only).
const pairLocally = async (): Promise<string> => {
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 2500);
    const r = await fetch('http://127.0.0.1:3002/pair', { signal: ctl.signal, cache: 'no-store' });
    clearTimeout(timer);
    if (!r.ok) return '';
    const j = await r.json();
    const k = typeof j.key === 'string' ? j.key.trim() : '';
    if (k.length >= 16) { try { localStorage.setItem('chess_coach_key', k); } catch { /* ignore */ } return k; }
  } catch { /* the server is not on this computer (or not running yet) */ }
  return '';
};

// طلبات fetch العادية بتفضل عالقة (pending) للأبد لو السيرفر مش راد خالص
// (مش بيرفض الاتصال، بس مش بيرد) — الـ timeout ده بيضمن إن أي طلب يفشل
// برسالة واضحة بعد `timeoutMs` بدل ما يسيب الزرار عالق على "..." للأبد.
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 8000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

const CONNECTION_ERROR = 'تعذّر الاتصال بالسيرفر — تأكد إن الباك إند (server.js) شغال.';

export const RoleProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [role, setRole]              = useState<Role>('coach');
  const [currentStudent, setStudent] = useState<Student | null>(null);
  const [token, setToken]            = useState<string | null>(null);
  const [verifying, setVerifying]    = useState(true);
  const [socket, setSocket]          = useState<Socket | null>(null);
  const socketRef = useRef<Socket | null>(null);

  // ── Socket.io connection — created once, lives for the lifetime of the app ──
  useEffect(() => {
    // عند API = '' يتصل socket.io بنفس origin الصفحة (وبيتعمله proxy
    // تلقائياً لـ /socket.io على بورت 3001 عبر vite.config.js)
    const s = io(API || undefined, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
      extraHeaders: NGROK_HEADERS,
      auth: (cb: (data: object) => void) => cb({
        token: sessionStorage.getItem('chess_token') || undefined,
        coachKey: readCoachKey() || undefined,
      }),
    });
    socketRef.current = s;
    setSocket(s);

    if (IS_COACH_BUILD) {
      // Pair silently when there is no key yet; and again (at most every 10 s) if the server refuses the stored one.
      let lastPair = 0;
      const pairAndReconnect = () => {
        if (Date.now() - lastPair < 10000) return;
        lastPair = Date.now();
        pairLocally().then(k => { if (k) { s.disconnect(); s.connect(); } });
      };
      if (!readCoachKey()) pairAndReconnect();
      s.on('connect_error', (err: Error) => { if (err && err.message === 'unauthorized') pairAndReconnect(); });
    }

    return () => {
      s.disconnect();
      socketRef.current = null;
    };
  }, []);

  // عند تحميل التطبيق — تحقق من توكن محفوظ في sessionStorage
  // Re-introduce the socket to the server whenever the login token changes (login / logout / reload).
  const tokenSeenRef = useRef(false);
  useEffect(() => {
    if (!tokenSeenRef.current) { tokenSeenRef.current = true; return; }
    const s = socketRef.current;
    if (s) { s.disconnect(); s.connect(); }
  }, [token]);

  useEffect(() => {
    const saved = sessionStorage.getItem('chess_token');
    if (!saved) { setVerifying(false); return; }

    fetchWithTimeout(`${API}/auth/verify`, {
      method : 'POST',
      headers: { 'Authorization': `Bearer ${saved}`, ...NGROK_HEADERS },
    })
      .then(r => r.json())
      .then(data => {
        if (data.valid && data.student) {
          setToken(saved);
          setStudent(data.student);
          setRole('student');
        } else {
          sessionStorage.removeItem('chess_token');
        }
      })
      .catch(() => sessionStorage.removeItem('chess_token'))
      .finally(() => setVerifying(false));
  }, []);

  const login = async (password: string): Promise<{ ok: boolean; error?: string }> => {
    try {
      const res = await fetchWithTimeout(`${API}/auth/login`, {
        method : 'POST',
        headers: { 'Content-Type': 'application/json', ...NGROK_HEADERS },
        body   : JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) return { ok: false, error: data.error };

      setToken(data.token);
      setStudent(data.student);
      setRole('student');
      sessionStorage.setItem('chess_token', data.token);
      return { ok: true };
    } catch (err) {
      const timedOut = err instanceof DOMException && err.name === 'AbortError';
      return { ok: false, error: timedOut ? CONNECTION_ERROR : 'لا يمكن الاتصال بالسيرفر' };
    }
  };

  const logout = async () => {
    const t = token;
    setToken(null);
    setStudent(null);
    setRole('coach');
    sessionStorage.removeItem('chess_token');
    if (t) {
      await fetchWithTimeout(`${API}/auth/logout`, {
        method : 'POST',
        headers: { 'Authorization': `Bearer ${t}`, ...NGROK_HEADERS },
      }).catch(() => {});
    }
  };

  // Always call the latest `logout` from the force-logout socket listener
  // without re-subscribing the listener on every render.
  const logoutRef = useRef(logout);
  useEffect(() => { logoutRef.current = logout; });

  // ── Coach: revoke all student sessions + generate fresh passwords ──────────
  const resetAllSessions = async (): Promise<{ ok: boolean; students?: { id: string; name: string; password: string }[]; error?: string }> => {
    try {
      const callReset = () => fetchWithTimeout(`${API}/auth/reset-sessions`, {
        method : 'POST',
        headers: { 'Content-Type': 'application/json', 'x-coach-key': readCoachKey(), ...NGROK_HEADERS },
      });
      let res = await callReset();
      if (res.status === 401 && IS_COACH_BUILD && ((await pairLocally()) || askCoachKey())) {
        const s = socketRef.current; if (s) { s.disconnect(); s.connect(); }
        res = await callReset();
      }
      const data = await res.json();
      if (!res.ok) return { ok: false, error: data.error ?? 'فشل الطلب' };
      return { ok: true, students: data.students };
    } catch (err) {
      const timedOut = err instanceof DOMException && err.name === 'AbortError';
      return { ok: false, error: timedOut ? CONNECTION_ERROR : 'لا يمكن الاتصال بالسيرفر' };
    }
  };

  // ── Student: if the coach resets all sessions, log out immediately ─────────
  useEffect(() => {
    if (!socket) return;
    const handleForceLogout = () => {
      if (role === 'student') logoutRef.current();
    };
    socket.on('force-logout', handleForceLogout);
    return () => { socket.off('force-logout', handleForceLogout); };
  }, [socket, role]);

  return (
    <RoleContext.Provider value={{ role, setRole, currentStudent, token, login, logout, verifying, socket, resetAllSessions }}>
      {children}
    </RoleContext.Provider>
  );
};

export const useRole = () => useContext(RoleContext);
