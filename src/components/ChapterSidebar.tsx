import React, { useState } from 'react';
import { Plus, Trash2, Edit2, Check, ChevronRight } from 'lucide-react';
import { useStudy } from '../context/StudyContext';
import { ChapterModal } from './ChapterModal';
import { NewChapterPayload } from '../types/chess';

export const ChapterSidebar: React.FC = () => {
  const {
    state, currentChapter,
    createChapter, deleteChapter, renameChapter, setCurrentChapter,
  } = useStudy();

  const [modalOpen, setModalOpen]       = useState(false);
  const [editingId, setEditingId]       = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  const handleCreate = (payload: NewChapterPayload) => { createChapter(payload); setModalOpen(false); };

  const startEdit = (id: string, title: string, e: React.MouseEvent) => {
    e.stopPropagation(); setEditingId(id); setEditingTitle(title);
  };
  const commitEdit = () => {
    if (editingId && editingTitle.trim()) renameChapter(editingId, editingTitle.trim());
    setEditingId(null);
  };

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#3d4147' }}>

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 12px', borderBottom: '1px solid #4e535c', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#c8c8c8' }}>
              Chapters
            </span>
            {state.chapters.length > 0 && (
              <span style={{
                fontSize: 9, fontWeight: 600, fontFamily: 'monospace',
                padding: '1px 5px', borderRadius: 10,
                background: '#484d55', color: '#c8c8c8',
              }}>
                {state.chapters.length}
              </span>
            )}
          </div>
          <button
            onClick={() => setModalOpen(true)}
            title="New chapter"
            style={{
              width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: 4, border: 'none', cursor: 'pointer',
              background: '#484d55', color: '#c8c8c8', transition: 'all 0.15s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#b58863'; (e.currentTarget as HTMLElement).style.color = '#1a1a1a'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#484d55'; (e.currentTarget as HTMLElement).style.color = '#c8c8c8'; }}
          >
            <Plus size={12} />
          </button>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {state.chapters.length === 0 && (
            <div style={{ padding: '24px 16px', textAlign: 'center' }}>
              <p style={{ fontSize: 12, color: '#9f9f9f', marginBottom: 8 }}>No chapters yet</p>
              <button
                onClick={() => setModalOpen(true)}
                style={{ fontSize: 11, color: '#cdae95', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                Create first chapter →
              </button>
            </div>
          )}

          {state.chapters.map(chapter => {
            const isActive  = chapter.id === currentChapter?.id;
            const moveCount = Object.keys(chapter.moves).length - 1;
            const isEditing = editingId === chapter.id;

            return (
              <div
                key={chapter.id}
                onClick={() => !isEditing && setCurrentChapter(chapter.id)}
                className="group"
                style={{
                  position: 'relative',
                  display: 'flex', alignItems: 'flex-start', gap: 7,
                  padding: '9px 12px',
                  borderBottom: '1px solid #464b52',
                  borderLeft: `3px solid ${isActive ? '#b58863' : 'transparent'}`,
                  background: isActive ? '#454a51' : 'transparent',
                  cursor: 'pointer',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = '#42464d'; }}
                onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                <ChevronRight
                  size={10}
                  style={{
                    flexShrink: 0, marginTop: 3,
                    color: isActive ? '#cdae95' : '#a59f96',
                    transform: isActive ? 'rotate(90deg)' : 'none',
                    transition: 'transform 0.15s',
                  }}
                />

                <div style={{ flex: 1, minWidth: 0 }}>
                  {isEditing ? (
                    <input
                      autoFocus
                      value={editingTitle}
                      onClick={e => e.stopPropagation()}
                      onChange={e => setEditingTitle(e.target.value)}
                      onBlur={commitEdit}
                      onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditingId(null); }}
                      style={{
                        width: '100%', background: '#3e4249', border: '1px solid #b58863',
                        borderRadius: 3, padding: '2px 6px', fontSize: 12, color: '#e8e0d0',
                        outline: 'none',
                      }}
                    />
                  ) : (
                    <>
                      <div style={{
                        fontSize: 13, fontWeight: 500, lineHeight: 1.3,
                        color: isActive ? '#e8e0d0' : '#c8c8c8',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {chapter.title}
                      </div>
                      <div style={{ fontSize: 10, color: '#a59f96', marginTop: 2 }}>
                        {moveCount > 0 ? `${moveCount} move${moveCount !== 1 ? 's' : ''}` : 'Empty'}
                      </div>
                    </>
                  )}
                </div>

                {/* Action buttons — show on hover via inline trick */}
                {!isEditing && (
                  <div
                    className="chapter-actions"
                    style={{ display: 'flex', gap: 2, flexShrink: 0, opacity: 0, transition: 'opacity 0.15s' }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = '1'}
                  >
                    <button
                      title="Rename"
                      onClick={e => startEdit(chapter.id, chapter.title, e)}
                      style={{ padding: 4, borderRadius: 3, border: 'none', cursor: 'pointer', background: 'transparent', color: '#c8c8c8' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#d0c7b3'; (e.currentTarget as HTMLElement).style.background = '#525760'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#c8c8c8'; (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                    >
                      <Edit2 size={9} />
                    </button>
                    <button
                      title="Delete"
                      onClick={e => { e.stopPropagation(); deleteChapter(chapter.id); }}
                      style={{ padding: 4, borderRadius: 3, border: 'none', cursor: 'pointer', background: 'transparent', color: '#c8c8c8' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#f87171'; (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.1)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#c8c8c8'; (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                    >
                      <Trash2 size={9} />
                    </button>
                  </div>
                )}
                {isEditing && (
                  <button
                    onClick={e => { e.stopPropagation(); commitEdit(); }}
                    style={{ padding: 4, borderRadius: 3, border: 'none', cursor: 'pointer', background: 'transparent', color: '#cdae95', flexShrink: 0 }}
                  >
                    <Check size={10} />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{ padding: '10px 12px', borderTop: '1px solid #4e535c', flexShrink: 0 }}>
          <button
            onClick={() => setModalOpen(true)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: 6, padding: '7px 0', borderRadius: 4, cursor: 'pointer',
              fontSize: 12, color: '#c8c8c8',
              background: 'transparent', border: '1px solid #4e535c',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#d0c7b3'; (e.currentTarget as HTMLElement).style.borderColor = '#69717c'; (e.currentTarget as HTMLElement).style.background = '#42464d'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#c8c8c8'; (e.currentTarget as HTMLElement).style.borderColor = '#4e535c'; (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          >
            <Plus size={11} />
            New chapter
          </button>
        </div>
      </div>

      {/* CSS for hover visibility of action buttons */}
      <style>{`
        .group:hover .chapter-actions { opacity: 1 !important; }
      `}</style>

      <ChapterModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onConfirm={handleCreate}
      />
    </>
  );
};
