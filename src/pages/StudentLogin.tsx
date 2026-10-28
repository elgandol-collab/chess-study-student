import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRole } from '../context/RoleContext';

const STORE_BUILD = (import.meta as any).env?.VITE_STORE === '1';

export const StudentLogin: React.FC = () => {
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [shaking, setShaking]   = useState(false);
  const { login } = useRole();
  const navigate  = useNavigate();

  const handleSubmit = async () => {
    if (!password.trim() || loading) return;
    setLoading(true);
    setError('');

    const result = await login(password);

    if (result.ok) {
      navigate('/student');
    } else {
      setError(result.error ?? 'باسورد خاطئ');
      setShaking(true);
      setTimeout(() => setShaking(false), 500);
      setPassword('');
    }
    setLoading(false);
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSubmit();
  };

  return (
    <div style={{
      minHeight: '100vh', background: '#42464c',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      <style>{`
        @keyframes shake {
          0%,100%{transform:translateX(0)}
          20%{transform:translateX(-8px)}
          40%{transform:translateX(8px)}
          60%{transform:translateX(-6px)}
          80%{transform:translateX(6px)}
        }
        @keyframes fadeIn {
          from{opacity:0;transform:translateY(16px)}
          to{opacity:1;transform:translateY(0)}
        }
        .login-card { animation: fadeIn 0.35s ease; }
        .login-input:focus {
          outline: none;
          border-color: #cdae95 !important;
          box-shadow: 0 0 0 3px rgba(181,136,99,0.15);
        }
        .login-btn:hover:not(:disabled) { background: #c9a47a !important; }
        .login-btn:active:not(:disabled) { transform: scale(0.97); }
        .back-btn:hover { color: #d0c7b3 !important; }
      `}</style>

      <div
        className="login-card"
        style={{
          width: 380, background: '#3d4147',
          border: '1px solid #4e535c', borderRadius: 12,
          padding: '40px 36px', boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          animation: shaking ? 'shake 0.5s ease' : undefined,
        }}
      >
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 56, height: 56, background: '#b58863', borderRadius: 12,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 28, margin: '0 auto 14px',
            boxShadow: '0 4px 16px rgba(181,136,99,0.3)',
          }}>♟</div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#e8e0d0', margin: 0 }}>
            GM Essam Zone
          </h1>
          <p style={{ fontSize: 13, color: '#c8c8c8', margin: '6px 0 0' }}>
            Student Portal — أدخل باسوردك للدخول
          </p>
        </div>

        {/* Input */}
        <div style={{ marginBottom: 16 }}>
          <label style={{
            display: 'block', fontSize: 11, fontWeight: 700,
            color: '#c8c8c8', letterSpacing: '0.08em',
            textTransform: 'uppercase', marginBottom: 8,
          }}>الباسورد</label>
          <input
            className="login-input"
            type="password"
            value={password}
            onChange={e => { setPassword(e.target.value); setError(''); }}
            onKeyDown={handleKey}
            placeholder="أدخل باسوردك هنا"
            autoFocus
            disabled={loading}
            style={{
              width: '100%', padding: '11px 14px',
              background: '#42464d',
              border: `1px solid ${error ? '#f87171' : '#575e67'}`,
              borderRadius: 7, color: '#e8e0d0',
              fontSize: 15, fontFamily: 'monospace',
              letterSpacing: '0.1em',
              transition: 'border-color 0.2s, box-shadow 0.2s',
              boxSizing: 'border-box', direction: 'ltr',
              opacity: loading ? 0.6 : 1,
            }}
          />
          <div style={{
            height: 20, marginTop: 6, fontSize: 12, color: '#f87171',
            opacity: error ? 1 : 0, transition: 'opacity 0.2s', textAlign: 'right',
          }}>
            {error}
          </div>
        </div>

        {/* Submit */}
        <button
          className="login-btn"
          onClick={handleSubmit}
          disabled={loading}
          style={{
            width: '100%', padding: '12px',
            background: loading ? '#7a6040' : '#b58863',
            color: '#1a1a1a', border: 'none', borderRadius: 7,
            fontSize: 14, fontWeight: 700,
            cursor: loading ? 'not-allowed' : 'pointer',
            transition: 'background 0.15s, transform 0.1s',
            marginBottom: 20,
          }}
        >
          {loading ? '⏳ جاري التحقق...' : 'دخول 🎓'}
        </button>

        {/* Back */}
        <div style={{ textAlign: 'center', display: STORE_BUILD ? 'none' : undefined }}>
          <button
            className="back-btn"
            onClick={() => navigate('/')}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 12, color: '#a59f96', transition: 'color 0.15s',
            }}
          >
            ← رجوع للـ Coach
          </button>
        </div>
      </div>
    </div>
  );
};
