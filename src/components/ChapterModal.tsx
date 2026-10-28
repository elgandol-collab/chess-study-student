import React, { useState, useRef, useEffect } from 'react';
import { X, FileText, Hash, BookOpen, Upload } from 'lucide-react';
import { ChapterModalMode, NewChapterPayload } from '../types/chess';
import { STARTING_FEN } from '../context/StudyContext';

type TabId = 'empty' | 'fen' | 'pgn';

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'empty', label: 'Empty',    icon: <BookOpen size={12} /> },
  { id: 'fen',   label: 'From FEN', icon: <Hash size={12} /> },
  { id: 'pgn',   label: 'From PGN', icon: <FileText size={12} /> },
];

interface ChapterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (payload: NewChapterPayload) => void;
}

export const ChapterModal: React.FC<ChapterModalProps> = ({ isOpen, onClose, onConfirm }) => {
  const [activeTab, setActiveTab] = useState<TabId>('empty');
  const [title, setTitle]         = useState('');
  const [fenInput, setFen]        = useState(STARTING_FEN);
  const [pgnInput, setPgn]        = useState('');
  const [fenError, setFenError]   = useState('');
  const [pgnError, setPgnError]   = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const titleRef     = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => titleRef.current?.focus(), 80);
      setFenError(''); setPgnError('');
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [isOpen, onClose]);

  // الدالة الجراحية داخل الـ Modal
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = ev => {
      const text = (ev.target?.result as string) ?? '';
      const blocks = text.split(/(?=\[Event\s+")/g).filter(block => block.trim() !== '');

      if (blocks.length > 1) {
        // لو الملف فيه مباريات كتير، قطعهم وابعتهم فوراً
        blocks.forEach((block) => {
          const whiteMatch = block.match(/\[White\s+"([^"]*)"\]/);
          const blackMatch = block.match(/\[Black\s+"([^"]*)"\]/);
          const white = whiteMatch ? whiteMatch[1] : 'Unknown';
          const black = blackMatch ? blackMatch[1] : 'Unknown';
          onConfirm({ title: `${white} vs ${black}`, mode: 'pgn', pgn: block.trim() });
        });
        onClose(); // اقفل الـ Modal فوراً
      } else {
        setPgn(text);
        setPgnError('');
      }
      
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsText(file);
  };

  const validate = (): boolean => {
    if (activeTab === 'fen') {
      if (fenInput.trim().split(' ').length < 4) {
        setFenError('Invalid FEN — needs at least 4 fields.');
        return false;
      }
      setFenError('');
    }
    if (activeTab === 'pgn' && !pgnInput.trim()) {
      setPgnError('Paste a PGN or upload a file.');
      return false;
    }
    setPgnError('');
    return true;
  };

  const handleConfirm = () => {
    if (!validate()) return;
    onConfirm({
      title: title.trim() || `Chapter ${Date.now().toString(36).slice(-4)}`,
      mode: activeTab as ChapterModalMode,
      fen: activeTab === 'fen' ? fenInput.trim() : undefined,
      pgn: activeTab === 'pgn' ? pgnInput.trim() : undefined,
    });
    setTitle(''); setFen(STARTING_FEN); setPgn('');
    onClose();
  };

  if (!isOpen) return null;

  const inputStyle: React.CSSProperties = {
    width: '100%', fontSize: 13, padding: '8px 12px',
    borderRadius: 5, border: '1px solid #636a74',
    background: '#3e4249', color: '#e8e0d0',
    outline: 'none', boxSizing: 'border-box',
    transition: 'border-color 0.15s',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 10, color: '#c8c8c8',
    textTransform: 'uppercase', letterSpacing: '0.1em',
    fontWeight: 700, marginBottom: 6,
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.72)',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        position: 'relative', width: '100%', maxWidth: 440,
        borderRadius: 8, boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
        background: '#43474e', border: '1px solid #5a606a',
        maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 20px', borderBottom: '1px solid #5a606a', flexShrink: 0,
        }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: '#e8e0d0', margin: 0 }}>New Chapter</h2>
          <button
            onClick={onClose}
            style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4, border: 'none', cursor: 'pointer', background: 'transparent', color: '#c8c8c8' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#525760'; (e.currentTarget as HTMLElement).style.color = '#d0c7b3'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = '#c8c8c8'; }}
          >
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Title */}
          <div>
            <label style={labelStyle}>Chapter name</label>
            <input
              ref={titleRef}
              value={title}
              onChange={e => setTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleConfirm()}
              placeholder="e.g. London System – Main Line"
              style={inputStyle}
              onFocus={e => (e.target.style.borderColor = '#b58863')}
              onBlur={e => (e.target.style.borderColor = '#636a74')}
            />
          </div>

          {/* Tabs */}
          <div>
            <label style={labelStyle}>Starting position</label>
            <div style={{ display: 'flex', border: '1px solid #5a606a', borderRadius: 5, overflow: 'hidden' }}>
              {TABS.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    gap: 6, padding: '8px 4px', fontSize: 12, fontWeight: 500,
                    border: 'none', cursor: 'pointer', transition: 'all 0.15s',
                    background: activeTab === tab.id ? '#b58863' : 'transparent',
                    color: activeTab === tab.id ? '#1a1a1a' : '#c8c8c8',
                  }}
                >
                  {tab.icon}{tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* FEN */}
          {activeTab === 'fen' && (
            <div>
              <label style={labelStyle}>FEN string</label>
              <input
                value={fenInput}
                onChange={e => { setFen(e.target.value); setFenError(''); }}
                style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 11, borderColor: fenError ? '#ef4444' : '#636a74' }}
              />
              {fenError && <p style={{ fontSize: 11, color: '#f87171', marginTop: 5 }}>{fenError}</p>}
            </div>
          )}

          {/* PGN */}
          {activeTab === 'pgn' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={labelStyle}>PGN</label>
              <textarea
                value={pgnInput}
                onChange={e => { setPgn(e.target.value); setPgnError(''); }}
                placeholder={'[Event "..."]\n\n1. e4 e5 2. Nf3 *'}
                rows={6}
                style={{
                  ...inputStyle, fontFamily: 'monospace', fontSize: 11, resize: 'none',
                  borderColor: pgnError ? '#ef4444' : '#636a74',
                }}
              />
              {pgnError && <p style={{ fontSize: 11, color: '#f87171', margin: 0 }}>{pgnError}</p>}

              <button
                onClick={() => fileInputRef.current?.click()}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  padding: '8px 12px', borderRadius: 5, cursor: 'pointer',
                  fontSize: 12, color: '#c8c8c8', background: 'transparent',
                  border: '1px solid #636a74', transition: 'all 0.15s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#d0c7b3'; (e.currentTarget as HTMLElement).style.borderColor = '#b58863'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#c8c8c8'; (e.currentTarget as HTMLElement).style.borderColor = '#636a74'; }}
              >
                <Upload size={12} />
                Upload .pgn file
              </button>
              <input ref={fileInputRef} type="file" accept=".pgn,.txt" style={{ display: 'none' }} onChange={handleFileChange} />
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', justifyContent: 'flex-end', gap: 8,
          padding: '14px 20px', borderTop: '1px solid #5a606a', flexShrink: 0,
        }}>
          <button
            onClick={onClose}
            style={{ padding: '8px 16px', borderRadius: 5, fontSize: 13, cursor: 'pointer', border: '1px solid #636a74', color: '#c8c8c8', background: 'transparent', transition: 'all 0.15s' }}
          >Cancel</button>
          <button
            onClick={handleConfirm}
            style={{ padding: '8px 20px', borderRadius: 5, fontSize: 13, fontWeight: 700, cursor: 'pointer', border: 'none', background: '#b58863', color: '#1a1a1a', transition: 'background 0.15s' }}
          >Create chapter</button>
        </div>
      </div>
    </div>
  );
};