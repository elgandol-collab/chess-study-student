import { useEffect, useRef } from 'react';
// @ts-ignore - plain JS module (see synth.js)
import { render, classify } from './synth.js';

// Per-side setting (coach and student each choose for themselves; no permission is involved).
const KEY = 'chess_move_sound';
let ctx: AudioContext | null = null;
let master: GainNode | null = null;

export const isSoundOn = (): boolean => { try { return localStorage.getItem(KEY) !== '0'; } catch { return true; } };
export const setSoundOn = (on: boolean) => { try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* ignore */ } };

function audio(): AudioContext | null {
  try {
    if (!ctx) {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC({ latencyHint: 'interactive' });
      master = ctx.createGain();
      master.gain.value = 0.8;
      const comp = ctx.createDynamicsCompressor();
      master.connect(comp);
      comp.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  } catch { return null; }
}

// Browsers only let audio start after the user has touched the page once.
export const unlockAudio = () => { audio(); };

export function playMoveSound(san: string, fromUserClick = false) {
  if (!isSoundOn()) return;
  const c = audio();
  if (!c || !master) return;
  const kind = classify(san);
  const out = master;
  if (c.state === 'running') render(c, out, c.currentTime + 0.01, kind);
  else if (fromUserClick) c.resume().then(() => render(c, out, c.currentTime + 0.01, kind)).catch(() => {});
  // otherwise stay silent: never queue old sounds that would burst out on the first click
}

// Plays a sound whenever the current move changes inside the same chapter
// (own moves, the other side's moves arriving live, or stepping through the move list).
export function useMoveSound(chapterId: string | null, move: { id: string; san: string; parentId: string | null } | null) {
  const prev = useRef<{ chapter: string | null; move: string | null } | null>(null);

  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => { window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
  }, []);

  useEffect(() => {
    const cur = { chapter: chapterId, move: move?.id ?? null };
    const p = prev.current;
    prev.current = cur;
    if (!p || p.chapter !== cur.chapter) return;          // first render / switching chapter: silent
    if (cur.move && cur.move !== p.move && move && move.parentId !== null) playMoveSound(move.san);
  }, [chapterId, move?.id]);
}
