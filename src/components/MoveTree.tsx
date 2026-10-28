import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useStudy } from '../context/StudyContext';
import { useRole } from '../context/RoleContext';
import { MoveNode } from '../types/chess';
import { ChevronLeft, ChevronRight, Download, Upload, Layers } from 'lucide-react';

const NAG_SYMBOLS: Record<number, string> = {
  1:  '!',
  2:  '?',
  3:  '!!',
  4:  '??',
  5:  '!?',
  6:  '?!',
  10: '=',
  13: '∞',
  18: '+−',
  19: '−+',
};

const NAG_COLORS: Record<number, string> = {
  1: '#4caf50',
  2: '#f44336',
  3: '#2196f3',
  4: '#ff5722',
  5: '#ff9800',
  6: '#9c27b0',
};

// ── Context Menu ──────────────────────────────────────────────────────────────

interface ContextMenuState {
  x: number;
  y: number;
  nodeId: string;
  isMainLine: boolean;
}

const VariationContextMenu: React.FC<{
  menu: ContextMenuState;
  onClose: () => void;
  onDelete: (id: string) => void;
  onPromote: (id: string) => void;
}> = ({ menu, onClose, onDelete, onPromote }) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        left: menu.x,
        top: menu.y,
        zIndex: 9999,
        background: '#3e4248',
        border: '1px solid #5a606a',
        borderRadius: 6,
        overflow: 'hidden',
        boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
        minWidth: 180,
      }}
    >
      {!menu.isMainLine && (
        <button
          onClick={() => { onPromote(menu.nodeId); onClose(); }}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            width: '100%', padding: '9px 14px',
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: '#d0c7b3', fontSize: 13, fontFamily: 'monospace',
            textAlign: 'left',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = '#484d55')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          <span style={{ fontSize: 15 }}>⬆</span>
          Make Main Line
        </button>
      )}

      {!menu.isMainLine && <div style={{ height: 1, background: '#484d55' }} />}

      <button
        onClick={() => {
          if (!menu.isMainLine) { onDelete(menu.nodeId); onClose(); }
        }}
        disabled={menu.isMainLine}
        title={menu.isMainLine ? 'Cannot delete the main line' : undefined}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          width: '100%', padding: '9px 14px',
          background: 'transparent', border: 'none',
          cursor: menu.isMainLine ? 'not-allowed' : 'pointer',
          color: menu.isMainLine ? '#9f9f9f' : '#e57373',
          fontSize: 13, fontFamily: 'monospace',
          textAlign: 'left',
          opacity: menu.isMainLine ? 0.5 : 1,
        }}
        onMouseEnter={e => { if (!menu.isMainLine) (e.currentTarget.style.background = '#484d55'); }}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      >
        <span style={{ fontSize: 15 }}>🗑</span>
        {menu.isMainLine ? 'Main line (protected)' : 'Delete Variation'}
      </button>
    </div>
  );
};

// ── MoveToken ─────────────────────────────────────────────────────────────────

interface MoveTokenProps {
  node: MoveNode;
  isActive: boolean;
  onSelect: (id: string) => void;
  showNumber?: boolean;
  forceBlackNumber?: boolean;
  isVariation?: boolean;
  onContextMenu?: (e: React.MouseEvent, nodeId: string) => void;
}

const MoveToken = React.memo<MoveTokenProps>(
  ({ node, isActive, onSelect, showNumber, forceBlackNumber, isVariation, onContextMenu }) => {
    const ref = useRef<HTMLButtonElement>(null);

    useEffect(() => {
      if (isActive && ref.current) {
        ref.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }, [isActive]);

    const prefix =
      showNumber && node.moveNumber
        ? node.color === 'w'
          ? `${node.moveNumber}.`
          : forceBlackNumber
          ? `${node.moveNumber}…`
          : null
        : null;

    const nagParts =
      node.nags
        ?.map(n => ({ symbol: NAG_SYMBOLS[n] ?? '', color: NAG_COLORS[n] ?? '#c8c8c8' }))
        .filter(p => p.symbol) ?? [];

    return (
      <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 1, lineHeight: 1 }}>
        {prefix && (
          <span style={{
            fontSize: 12, color: '#c8c8c8', fontFamily: 'monospace',
            userSelect: 'none', paddingRight: 2,
          }}>
            {prefix}
          </span>
        )}
        <button
          ref={ref}
          onClick={() => onSelect(node.id)}
          onContextMenu={
            onContextMenu
              ? (e) => { e.preventDefault(); onContextMenu(e, node.id); }
              : undefined
          }
          style={{
            padding: '3px 6px', borderRadius: 4, border: 'none', cursor: 'pointer',
            fontSize: 14, fontFamily: 'monospace', fontWeight: 600, lineHeight: 1.2,
            transition: 'all 0.1s',
            background: isActive ? '#b58863' : 'transparent',
            color: isActive ? '#1a1a1a' : isVariation ? '#c8c8c8' : '#d0c7b3',
            boxShadow: isActive ? '0 1px 4px rgba(0,0,0,0.3)' : 'none',
          }}
          onMouseEnter={e => {
            if (!isActive) {
              (e.currentTarget as HTMLElement).style.background = '#525760';
              (e.currentTarget as HTMLElement).style.color = '#e8e0d0';
            }
          }}
          onMouseLeave={e => {
            if (!isActive) {
              (e.currentTarget as HTMLElement).style.background = 'transparent';
              (e.currentTarget as HTMLElement).style.color = isVariation ? '#c8c8c8' : '#d0c7b3';
            }
          }}
        >
          {node.san}
          {nagParts.map((p, i) => (
            <span
              key={i}
              style={{
                fontSize: 15, fontWeight: 900, marginLeft: 1,
                color: p.color, lineHeight: 1,
                textShadow: '0 1px 4px rgba(0,0,0,0.4)',
              }}
            >
              {p.symbol}
            </span>
          ))}
        </button>
      </span>
    );
  },
);
MoveToken.displayName = 'MoveToken';

// ── CommentBubble ─────────────────────────────────────────────────────────────

const CommentBubble: React.FC<{ text: string }> = ({ text }) => (
  <span style={{
    display: 'inline-block', fontSize: 11, fontStyle: 'italic',
    color: '#c8c8c8', background: 'rgba(181,136,99,0.08)',
    border: '1px solid rgba(181,136,99,0.18)', borderRadius: 4,
    padding: '2px 7px', margin: '0 4px 2px 2px',
    lineHeight: 1.5, verticalAlign: 'middle',
    maxWidth: '100%', wordBreak: 'break-word',
  }}>
    {text}
  </span>
);

// ── RenderLine ────────────────────────────────────────────────────────────────

interface RenderLineProps {
  nodeId: string;
  moves: Record<string, MoveNode>;
  currentMoveId: string | null;
  onSelect: (id: string) => void;
  depth?: number;
  forceShowNumber?: boolean;
  isVariation?: boolean;
  /** Student mode: hide variations entirely */
  hideVariations?: boolean;
  onContextMenu?: (
    e: React.MouseEvent,
    nodeId: string,
    rootId: string,
    isMainLineAtThisLevel: boolean,
  ) => void;
  variationRootId?: string;
}

const RenderLine: React.FC<RenderLineProps> = ({
  nodeId, moves, currentMoveId, onSelect, depth = 0, forceShowNumber = false,
  isVariation = false, hideVariations = false, onContextMenu, variationRootId,
}) => {
  const elements: React.ReactNode[] = [];
  let current: MoveNode | undefined = moves[nodeId];
  let firstToken = true;

  while (current) {
    const node = current;
    const showNum = forceShowNumber || node.color === 'w' || firstToken;
    const forceBlack = firstToken && node.color === 'b';

    if (node.comment) {
      elements.push(<CommentBubble key={`comment-${node.id}`} text={node.comment} />);
    }

    const rootId = isVariation ? (variationRootId ?? node.id) : node.id;

    const parentNode = node.parentId ? moves[node.parentId] : null;
    const indexInParent = parentNode ? parentNode.childrenIds.indexOf(node.id) : -1;
    const isMainLineAtThisLevel = indexInParent === 0 || indexInParent === -1;

    elements.push(
      <MoveToken
        key={node.id}
        node={node}
        isActive={node.id === currentMoveId}
        onSelect={onSelect}
        showNumber={showNum}
        forceBlackNumber={forceBlack}
        isVariation={isVariation}
        onContextMenu={
          onContextMenu && !hideVariations
            ? (e, _id) => onContextMenu(e, node.id, rootId, isMainLineAtThisLevel)
            : undefined
        }
      />,
    );
    firstToken = false;

    // Student: hide all variation lines
    if (!hideVariations) {
      const variations = node.childrenIds.slice(1);
      if (variations.length > 0) {
        elements.push(
          <span key={`var-group-${node.id}`} style={{ display: 'contents' }}>
            {variations.map(varId => (
              <VariationLine
                key={varId}
                nodeId={varId}
                moves={moves}
                currentMoveId={currentMoveId}
                onSelect={onSelect}
                depth={depth + 1}
                onContextMenu={onContextMenu}
              />
            ))}
          </span>,
        );
      }
    }

    current = node.childrenIds.length > 0 ? moves[node.childrenIds[0]] : undefined;
  }

  return <>{elements}</>;
};

// ── VariationLine ─────────────────────────────────────────────────────────────

interface VariationLineProps {
  nodeId: string;
  moves: Record<string, MoveNode>;
  currentMoveId: string | null;
  onSelect: (id: string) => void;
  depth: number;
  onContextMenu?: (
    e: React.MouseEvent,
    nodeId: string,
    rootId: string,
    isMainLineAtThisLevel: boolean,
  ) => void;
}

const VariationLine: React.FC<VariationLineProps> = ({
  nodeId, moves, currentMoveId, onSelect, depth, onContextMenu,
}) => {
  return (
    <span
      style={{
        color: '#c8c8c8', fontSize: 13,
        display: 'inline', marginLeft: 4, marginRight: 4,
      }}
    >
      {'( '}
      <RenderLine
        nodeId={nodeId}
        moves={moves}
        currentMoveId={currentMoveId}
        onSelect={onSelect}
        depth={depth}
        forceShowNumber
        isVariation
        onContextMenu={onContextMenu}
        variationRootId={nodeId}
      />
      {' )'}
    </span>
  );
};

// ── MoveTree (main export) ────────────────────────────────────────────────────

export const MoveTree: React.FC = () => {
  const {
    state,
    currentChapter, currentMove, setCurrentMove,
    navigateBack, navigateForward,
    deleteVariation, promoteVariation,
    exportPgn, exportStudyPgn,
    mergePgnIntoChapter, createChapter,
    visibility, setVisibility,
  } = useStudy();

  const { role } = useRole();
  const isStudent = role === 'student';
  const canUploadPgn = !isStudent || (visibility.allowStudentPgnUpload ?? false);

  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const pgnFileInputRef = useRef<HTMLInputElement>(null);
  const [pgnMergeMsg, setPgnMergeMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const handlePgnFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const text = (ev.target?.result as string) ?? '';

      // نفس طريقة المدرب بالظبط: لو الملف فيه أكتر من مباراة (كذا [Event "..."])،
      // كل مباراة تتحول لفصل مستقل جديد في قائمة الفصول على الشمال — بدل ما نحاول
      // ندمجهم كلهم فوق بعض في نفس الفصل الحالي (اللي كان بيعمل تشابك).
      const blocks = text.split(/(?=\[\s*Event\b)/i).filter(b => b.trim() !== '');

      if (blocks.length > 1) {
        blocks.forEach(block => {
          const whiteMatch = block.match(/\[White\s+"([^"]*)"\]/i);
          const blackMatch = block.match(/\[Black\s+"([^"]*)"\]/i);
          createChapter({
            title: `${whiteMatch?.[1] ?? 'Unknown'} vs ${blackMatch?.[1] ?? 'Unknown'}`,
            mode: 'pgn',
            pgn: block.trim(),
          });
        });
        setPgnMergeMsg({ ok: true, text: `اتعمل ${blocks.length} فصل جديد من المبارايات اللي في الملف.` });
      } else {
        // ملف بمباراة واحدة — سلوك الدمج القديم في الفصل الحالي لسه شغال زي ما هو
        const result = mergePgnIntoChapter(text);
        setPgnMergeMsg({ ok: result.ok, text: result.message });
      }

      setTimeout(() => setPgnMergeMsg(null), 4500);
    };
    reader.readAsText(file);
    if (pgnFileInputRef.current) pgnFileInputRef.current.value = '';
  }, [mergePgnIntoChapter, createChapter]);

  const handleVariationContextMenu = useCallback(
    (
      e: React.MouseEvent,
      _nodeId: string,
      rootId: string,
      isMainLineAtThisLevel: boolean,
    ) => {
      e.preventDefault();
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        nodeId: rootId,
        isMainLine: isMainLineAtThisLevel,
      });
    },
    [],
  );

  const handleExport = useCallback(() => {
    const pgn = exportPgn();
    if (!pgn) return;
    const blob = new Blob([pgn], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentChapter?.title ?? 'chapter'}.pgn`;
    a.click();
    URL.revokeObjectURL(url);
  }, [exportPgn, currentChapter]);

  const handleExportStudy = useCallback(() => {
    const pgn = exportStudyPgn();
    if (!pgn) return;
    const count = state.chapters.length;
    const blob = new Blob([pgn], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `study-${count}-chapters.pgn`;
    a.click();
    URL.revokeObjectURL(url);
  }, [exportStudyPgn, state.chapters.length]);

  if (!currentChapter) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100%', color: '#c8c8c8', fontSize: 13,
      }}>
        No chapter selected
      </div>
    );
  }

  const { moves, rootMoveId } = currentChapter;
  const root = moves[rootMoveId];
  const hasContent = root?.childrenIds.length > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', userSelect: 'none' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 12px', borderBottom: '1px solid #4e535c', flexShrink: 0,
      }}>
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
          textTransform: 'uppercase', color: '#c8c8c8',
        }}>
          Moves
          {isStudent && (
            <span style={{
              marginLeft: 6, fontSize: 9, color: '#cdae95',
              background: 'rgba(181,136,99,0.12)', border: '1px solid rgba(181,136,99,0.3)',
              borderRadius: 3, padding: '1px 5px', textTransform: 'none', letterSpacing: 0,
            }}>
              Main line only
            </span>
          )}
        </span>
        <div style={{ display: 'flex', gap: 2 }}>
          {[
            { icon: <ChevronLeft size={13} />, fn: navigateBack,    title: '← prev' },
            { icon: <ChevronRight size={13} />, fn: navigateForward, title: 'next →' },
          ].map(({ icon, fn, title }) => (
            <button
              key={title}
              onClick={fn}
              title={title}
              style={{
                width: 24, height: 24,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: 4, border: 'none', cursor: 'pointer',
                background: 'transparent', color: '#c8c8c8', transition: 'all 0.1s',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.color = '#d0c7b3';
                (e.currentTarget as HTMLElement).style.background = '#484d55';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.color = '#c8c8c8';
                (e.currentTarget as HTMLElement).style.background = 'transparent';
              }}
            >
              {icon}
            </button>
          ))}

          <div style={{ width: 1, height: 14, background: '#484d55', margin: '0 2px', alignSelf: 'center' }} />

          {/* ── رفع PGN وضمه في الفصل الحالي — أيقونة واضحة، مش متقصّة ── */}
          {canUploadPgn && (
            <button
              onClick={() => pgnFileInputRef.current?.click()}
              title="ارفع ملف PGN وضمه كـ variations في الفصل الحالي"
              style={{
                width: 24, height: 24,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: 4, border: 'none', cursor: 'pointer',
                background: 'transparent', color: '#86efac', transition: 'all 0.1s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(134,239,172,0.15)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              <Upload size={13} />
            </button>
          )}
          <input
            ref={pgnFileInputRef}
            type="file"
            accept=".pgn,.txt"
            style={{ display: 'none' }}
            onChange={handlePgnFileChange}
          />

          {/* Export buttons — مخفية للطالب */}
          {!isStudent && (
            <>
              <button
                onClick={handleExport}
                title="Chapter PGN — export current chapter"
                style={{
                  width: 24, height: 24,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: 4, border: 'none', cursor: 'pointer',
                  background: 'transparent', color: '#c8c8c8', transition: 'all 0.1s',
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.color = '#cdae95';
                  (e.currentTarget as HTMLElement).style.background = '#484d55';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.color = '#c8c8c8';
                  (e.currentTarget as HTMLElement).style.background = 'transparent';
                }}
              >
                <Download size={13} />
              </button>

              <button
                onClick={handleExportStudy}
                title={`Study PGN — export all ${state.chapters.length} chapters`}
                style={{
                  width: 24, height: 24,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: 4, border: 'none', cursor: 'pointer',
                  background: 'transparent', color: '#c8c8c8', transition: 'all 0.1s',
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.color = '#cdae95';
                  (e.currentTarget as HTMLElement).style.background = '#484d55';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.color = '#c8c8c8';
                  (e.currentTarget as HTMLElement).style.background = 'transparent';
                }}
              >
                <Layers size={13} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* توست نتيجة دمج الـ PGN — نجاح أو فشل */}
      {pgnMergeMsg && (
        <div style={{
          flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6,
          padding: '6px 12px', fontSize: 11, fontWeight: 600,
          borderBottom: '1px solid #4e535c',
          background: pgnMergeMsg.ok ? 'rgba(134,239,172,0.1)' : 'rgba(248,113,113,0.1)',
          color: pgnMergeMsg.ok ? '#86efac' : '#f87171',
        }}>
          {pgnMergeMsg.ok ? '✓' : '✕'} {pgnMergeMsg.text}
        </div>
      )}

      {/* Move content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px', minHeight: 0 }}>
        {!hasContent ? (
          <div style={{
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            height: '100%', gap: 6, opacity: 0.4,
          }}>
            <p style={{ color: '#c8c8c8', fontSize: 13 }}>No moves yet</p>
            <p style={{ color: '#9f9f9f', fontSize: 11 }}>Play on the board or load a PGN</p>
          </div>
        ) : (
          <div style={{
            display: 'flex', flexWrap: 'wrap',
            alignItems: 'baseline', gap: '2px 0', lineHeight: 1.8,
          }}>
            <RenderLine
              nodeId={rootMoveId}
              moves={moves}
              currentMoveId={currentMove?.id ?? null}
              onSelect={setCurrentMove}
              depth={0}
              hideVariations={isStudent}
              onContextMenu={isStudent ? undefined : handleVariationContextMenu}
            />
          </div>
        )}
      </div>

      {/* Context menu — only for coach */}
      {!isStudent && contextMenu && (
        <VariationContextMenu
          menu={contextMenu}
          onClose={() => setContextMenu(null)}
          onDelete={(id) => { deleteVariation(id); setContextMenu(null); }}
          onPromote={(id) => { promoteVariation(id); setContextMenu(null); }}
        />
      )}
    </div>
  );
};