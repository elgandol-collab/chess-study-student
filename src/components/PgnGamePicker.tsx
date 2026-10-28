import React, { useState, useCallback } from 'react';
import { X, Upload, ChevronRight, Calendar, Trophy } from 'lucide-react';

export interface PgnGame {
  index: number;
  white: string;
  black: string;
  result: string;
  date: string;
  event: string;
  opening?: string;
  eco?: string;
  pgn: string;
}

interface PgnGamePickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectGame: (game: PgnGame) => void;
  onLoadAll?: (games: PgnGame[]) => void;
}

function splitPgn(raw: string): PgnGame[] {
  const blocks = raw.trim().split(/\n\n(?=\[)/).filter(Boolean);
  return blocks.map((block, i) => {
    const tag = (key: string) =>
      block.match(new RegExp(`\\[${key}\\s+"([^"]*)"\\]`))?.[1] ?? '?';
    return {
      index:   i,
      white:   tag('White'),
      black:   tag('Black'),
      result:  tag('Result'),
      date:    tag('Date').replace(/\.\?\?/g, '').replace(/\?/g, ''),
      event:   tag('Event'),
      opening: tag('Opening') === '?' ? undefined : tag('Opening'),
      eco:     tag('ECO')     === '?' ? undefined : tag('ECO'),
      pgn:     block.trim(),
    };
  });
}

function resultBadge(result: string) {
  const map: Record<string, { label: string; bg: string; color: string }> = {
    '1-0':     { label: '1-0', bg: '#e8e0d0', color: '#1a1a1a' },
    '0-1':     { label: '0-1', bg: '#525760', color: '#e8e0d0' },
    '1/2-1/2': { label: '½-½', bg: '#5e646e', color: '#e8e0d0' },
  };
  const b = map[result] ?? { label: result, bg: '#525760', color: '#c8c8c8' };
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, fontFamily: 'monospace',
      padding: '2px 6px', borderRadius: 3,
      background: b.bg, color: b.color, flexShrink: 0,
    }}>
      {b.label}
    </span>
  );
}

export const PgnGamePicker: React.FC<PgnGamePickerProps> = ({
  isOpen, onClose, onSelectGame, onLoadAll,
}) => {
  const [games, setGames]     = useState<PgnGame[]>([]);
  const [search, setSearch]   = useState('');
  const [isDragging, setDrag] = useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const loadText = useCallback((text: string) => {
    setGames(splitPgn(text));
    setSearch('');
  }, []);

  const handleFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = e => loadText(e.target?.result as string ?? '');
    reader.readAsText(file);
  }, [loadText]);

  const handleClose = () => {
    setGames([]);
    setSearch('');
    onClose();
  };

  const filtered = games.filter(g =>
    [g.white, g.black, g.event, g.opening ?? '']
      .join(' ').toLowerCase().includes(search.toLowerCase()),
  );

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.82)',
      }}
      onClick={e => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div style={{
        position: 'relative', display: 'flex', flexDirection: 'column',
        width: 600, maxWidth: '95vw', maxHeight: '88vh',
        background: '#43474e', border: '1px solid #5a606a',
        borderRadius: 8, boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 20px', borderBottom: '1px solid #5a606a', flexShrink: 0,
        }}>
          <div>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: '#e8e0d0', margin: 0 }}>Load PGN</h2>
            {games.length > 0 && (
              <p style={{ fontSize: 11, color: '#c8c8c8', margin: '3px 0 0' }}>
                {games.length} game{games.length !== 1 ? 's' : ''} found
              </p>
            )}
          </div>
          <button
            onClick={handleClose}
            style={{
              width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: 4, border: 'none', cursor: 'pointer',
              background: 'transparent', color: '#c8c8c8',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#525760'; (e.currentTarget as HTMLElement).style.color = '#d0c7b3'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = '#c8c8c8'; }}
          >
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>

          {/* Drop zone */}
          {games.length === 0 && (
            <div
              onDragOver={e => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={e => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
              onClick={() => fileRef.current?.click()}
              style={{
                flex: 1, margin: 20, borderRadius: 8, cursor: 'pointer',
                border: `2px dashed ${isDragging ? '#b58863' : '#636a74'}`,
                background: isDragging ? 'rgba(181,136,99,0.07)' : 'transparent',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                gap: 10, minHeight: 200, transition: 'all 0.15s',
              }}
            >
              <Upload size={32} style={{ color: isDragging ? '#cdae95' : '#ab9e8a' }} />
              <p style={{ fontSize: 14, color: '#c8c8c8', fontWeight: 500, margin: 0 }}>
                Drop a .pgn file here
              </p>
              <p style={{ fontSize: 12, color: '#9f9f9f', margin: 0 }}>or click to browse</p>
              <input
                ref={fileRef} type="file" accept=".pgn,.txt"
                style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
            </div>
          )}

          {/* Game list */}
          {games.length > 0 && (
            <>
              {/* Search + actions */}
              <div style={{
                padding: '10px 16px', display: 'flex', gap: 8, alignItems: 'center',
                borderBottom: '1px solid #4e535c', flexShrink: 0,
              }}>
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search by player, event, opening…"
                  style={{
                    flex: 1, fontSize: 12, padding: '7px 12px', borderRadius: 5,
                    border: '1px solid #636a74', background: '#3e4249',
                    color: '#e8e0d0', outline: 'none',
                  }}
                  onFocus={e => (e.target.style.borderColor = '#b58863')}
                  onBlur={e => (e.target.style.borderColor = '#636a74')}
                />
                {onLoadAll && (
                  <button
                    onClick={() => { onLoadAll(filtered); handleClose(); }}
                    style={{
                      fontSize: 12, padding: '7px 14px', borderRadius: 5, cursor: 'pointer',
                      border: '1px solid #69717c', color: '#cdae95', background: 'transparent',
                      fontWeight: 600, whiteSpace: 'nowrap', transition: 'all 0.15s',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#b58863'; (e.currentTarget as HTMLElement).style.color = '#1a1a1a'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = '#cdae95'; }}
                  >
                    Load all ({filtered.length})
                  </button>
                )}
                <button
                  onClick={() => setGames([])}
                  title="Load different file"
                  style={{
                    fontSize: 12, padding: '7px 10px', borderRadius: 5, cursor: 'pointer',
                    border: '1px solid #5a606a', color: '#c8c8c8', background: 'transparent',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#d0c7b3'; (e.currentTarget as HTMLElement).style.background = '#454a51'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#c8c8c8'; (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                >↩</button>
              </div>

              {/* Rows */}
              <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
                {filtered.map(game => (
                  <div
                    key={game.index}
                    onClick={() => { onSelectGame(game); handleClose(); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '11px 16px', cursor: 'pointer',
                      borderBottom: '1px solid #41454c',
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#454a51'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
                  >
                    <span style={{ fontSize: 11, color: '#a59f96', fontFamily: 'monospace', width: 20, textAlign: 'right', flexShrink: 0 }}>
                      {game.index + 1}
                    </span>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: '#e8e0d0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {game.white}
                        </span>
                        <span style={{ fontSize: 11, color: '#9f9f9f', flexShrink: 0 }}>vs</span>
                        <span style={{ fontSize: 14, fontWeight: 600, color: '#e8e0d0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {game.black}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#9f9f9f' }}>
                        {game.event !== '?' && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>
                            <Trophy size={9} />{game.event}
                          </span>
                        )}
                        {game.date && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                            <Calendar size={9} />{game.date}
                          </span>
                        )}
                        {game.eco && (
                          <span style={{ fontFamily: 'monospace', color: '#cdae95', flexShrink: 0 }}>{game.eco}</span>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      {resultBadge(game.result)}
                      <ChevronRight size={13} style={{ color: '#a29f9a' }} />
                    </div>
                  </div>
                ))}

                {filtered.length === 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 80, fontSize: 13, color: '#9f9f9f' }}>
                    No games match "{search}"
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
