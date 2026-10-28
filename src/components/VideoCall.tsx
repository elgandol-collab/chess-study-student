import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Mic, MicOff, Video, VideoOff, PhoneOff } from 'lucide-react';
import { useRole, API } from '../context/RoleContext';

// ── TURN/STUN servers (حساب Metered الشخصي — نفس بيانات الاعتماد المستخدمة
//    في مشروع تحدي المدرب/الطالب السابق، تعمل بنفس الاستقرار هنا) ──
// Public STUN only. Relay (TURN) credentials are never part of the source: the store edition downloads them
// from the lesson server after login (see loadRtcConfig below).
const ICE_SERVERS: RTCConfiguration = { iceServers: [{ urls: 'stun:stun.relay.metered.ca:80' }] };

// Store (public) build: the relay credentials are NOT shipped inside the extension. They are
// requested from the lesson server after the student has logged in (GET /auth/ice).
const STORE_BUILD = (import.meta as any).env?.VITE_STORE === '1';
const STUN_ONLY: RTCConfiguration = { iceServers: [{ urls: 'stun:stun.relay.metered.ca:80' }] };
let serverRtcConfig: RTCConfiguration | null = null;
async function loadRtcConfig(): Promise<void> {
  if (!STORE_BUILD || serverRtcConfig) return;
  try {
    const token = sessionStorage.getItem('chess_token') || '';
    const r = await fetch(`${API}/auth/ice`, { headers: { Authorization: `Bearer ${token}`, 'ngrok-skip-browser-warning': 'true' } });
    if (!r.ok) return;
    const j = await r.json();
    if (j && Array.isArray(j.iceServers) && j.iceServers.length) serverRtcConfig = { iceServers: j.iceServers };
  } catch { /* fall back to STUN only */ }
}

type CallState = 'idle' | 'incoming' | 'active';

interface VideoCallProps {
  /** 'horizontal' = شريط أفقي مضغوط (الوضع الافتراضي القديم).
   *  'vertical'   = عمود رأسي مكبّر (فيديوهات أكبر فوق بعض، أزرار تحتها). */
  layout?: 'horizontal' | 'vertical';
}

export const VideoCall: React.FC<VideoCallProps> = ({ layout = 'horizontal' }) => {
  const { role, socket } = useRole();
  const isCoach = role === 'coach';

  const [callState, setCallState] = useState<CallState>('idle');
  const [micEnabled, setMicEnabled] = useState(false);
  const [videoEnabled, setVideoEnabled] = useState(false);
  const [remoteVideoActive, setRemoteVideoActive] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const localVideoStreamRef = useRef<MediaStream | null>(null);
  const pendingOfferSdpRef = useRef<string | null>(null);

  const localVideoElRef = useRef<HTMLVideoElement>(null);
  const remoteVideoElRef = useRef<HTMLVideoElement>(null);
  const remoteAudioElRef = useRef<HTMLAudioElement>(null);

  // ── تنظيف كامل للموارد ──────────────────────────────────────────────────
  const endCall = useCallback(() => {
    if (pcRef.current) { try { pcRef.current.close(); } catch { /* noop */ } pcRef.current = null; }
    if (localStreamRef.current) { localStreamRef.current.getTracks().forEach(t => t.stop()); localStreamRef.current = null; }
    if (localVideoStreamRef.current) { localVideoStreamRef.current.getTracks().forEach(t => t.stop()); localVideoStreamRef.current = null; }
    if (remoteAudioElRef.current) remoteAudioElRef.current.srcObject = null;
    if (remoteVideoElRef.current) remoteVideoElRef.current.srcObject = null;
    if (localVideoElRef.current) localVideoElRef.current.srcObject = null;
    pendingOfferSdpRef.current = null;
    setCallState('idle');
    setMicEnabled(false);
    setVideoEnabled(false);
    setRemoteVideoActive(false);
    setAudioBlocked(false);
  }, []);

  // ── إنشاء RTCPeerConnection (مرة واحدة لكل مكالمة) ─────────────────────
  const ensurePeerConnection = useCallback((): RTCPeerConnection => {
    if (pcRef.current) return pcRef.current;
    const pc = new RTCPeerConnection(STORE_BUILD ? (serverRtcConfig ?? STUN_ONLY) : ICE_SERVERS);

    pc.onicecandidate = (e) => {
      if (e.candidate && socket) {
        socket.emit('webrtc:ice', {
          candidate: { candidate: e.candidate.candidate, sdpMid: e.candidate.sdpMid, sdpMLineIndex: e.candidate.sdpMLineIndex },
        });
      }
    };
    pc.ontrack = (e) => {
      if (e.track.kind === 'video') {
        if (remoteVideoElRef.current) remoteVideoElRef.current.srcObject = e.streams[0];
        setRemoteVideoActive(true);
      } else {
        if (remoteAudioElRef.current) {
          remoteAudioElRef.current.srcObject = e.streams[0];
          remoteAudioElRef.current.play().then(() => {
            setAudioBlocked(false);
          }).catch((err) => {
            console.warn('remote audio autoplay blocked:', err);
            setAudioBlocked(true);
          });
        }
      }
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') endCall();
    };

    pcRef.current = pc;
    return pc;
  }, [socket, endCall]);

  // ── المايك: المدرب=caller دائماً (يبدأ)، الطالب=callee دائماً (يقبل) ───
  const toggleMic = useCallback(async () => {
    if (callState === 'idle' && isCoach) {
      // المدرب يبدأ مكالمة جديدة
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (e: any) {
        alert('تعذّر الوصول للميكروفون: ' + e.message + '\nتأكد من إعطاء إذن الميكروفون، ومن أن الصفحة تعمل عبر HTTPS أو localhost.');
        return;
      }
      localStreamRef.current = stream;
      await loadRtcConfig();
      const pc = ensurePeerConnection();
      stream.getTracks().forEach(t => pc.addTrack(t, stream));
      setMicEnabled(true);
      setCallState('active');
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket?.emit('webrtc:offer', { sdp: offer.sdp });
      } catch (e) {
        console.error('WebRTC offer error', e);
        endCall();
      }
    } else if (callState === 'incoming' && !isCoach) {
      // الطالب يقبل مكالمة واردة
      const offerSdp = pendingOfferSdpRef.current;
      if (!offerSdp) return;
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (e: any) {
        alert('تعذّر الوصول للميكروفون: ' + e.message + '\nتأكد من إعطاء إذن الميكروفون، ومن أن الصفحة تعمل عبر HTTPS أو localhost.');
        return;
      }
      localStreamRef.current = stream;
      await loadRtcConfig();
      const pc = ensurePeerConnection();
      stream.getTracks().forEach(t => pc.addTrack(t, stream));
      try {
        await pc.setRemoteDescription({ type: 'offer', sdp: offerSdp });
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket?.emit('webrtc:answer', { sdp: answer.sdp });
        pendingOfferSdpRef.current = null;
        setMicEnabled(true);
        setCallState('active');
      } catch (e) {
        console.error('WebRTC answer error', e);
        endCall();
      }
    } else if (callState === 'active') {
      // كتم/إلغاء كتم بدون قطع الاتصال
      const next = !micEnabled;
      localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = next; });
      setMicEnabled(next);
    }
  }, [callState, isCoach, micEnabled, socket, ensurePeerConnection, endCall]);

  // ── الفيديو: متاح لأي طرف بعد بدء المكالمة، عبر renegotiation ──────────
  const toggleVideo = useCallback(async () => {
    if (callState !== 'active') {
      alert(isCoach ? 'يجب تشغيل المايك أولاً قبل تفعيل الفيديو.' : 'يجب قبول المكالمة أولاً قبل تفعيل الفيديو.');
      return;
    }
    const pc = pcRef.current;
    if (!pc) return;

    if (!videoEnabled) {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 320 }, height: { ideal: 240 } } });
      } catch (e: any) {
        alert('تعذّر الوصول للكاميرا: ' + e.message + '\nتأكد من إعطاء إذن الكاميرا، ومن أن الصفحة تعمل عبر HTTPS أو localhost.');
        return;
      }
      localVideoStreamRef.current = stream;
      const videoTrack = stream.getVideoTracks()[0];
      pc.addTrack(videoTrack, stream);
      if (localVideoElRef.current) localVideoElRef.current.srcObject = stream;
      setVideoEnabled(true);
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket?.emit('webrtc:offer', { sdp: offer.sdp });
      } catch (e) {
        console.error('video renegotiation offer error', e);
      }
    } else {
      if (localVideoStreamRef.current) {
        localVideoStreamRef.current.getTracks().forEach(t => {
          const sender = pc.getSenders().find(s => s.track === t);
          if (sender) pc.removeTrack(sender);
          t.stop();
        });
        localVideoStreamRef.current = null;
      }
      if (localVideoElRef.current) localVideoElRef.current.srcObject = null;
      setVideoEnabled(false);
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket?.emit('webrtc:offer', { sdp: offer.sdp });
      } catch (e) {
        console.error('video renegotiation (stop) offer error', e);
      }
    }
  }, [callState, videoEnabled, isCoach, socket]);

  const hangUp = useCallback(() => {
    socket?.emit('webrtc:end-call');
    endCall();
  }, [socket, endCall]);

  // ── استقبال الرسائل من socket.io ────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    const handleOffer = async (payload: { sdp: string }) => {
      const pc = pcRef.current;
      if (pc && callState === 'active') {
        // إعادة تفاوض (مثلاً الطرف الآخر فعّل الفيديو) — رد فوري بدون انتظار المستخدم
        try {
          await pc.setRemoteDescription({ type: 'offer', sdp: payload.sdp });
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit('webrtc:answer', { sdp: answer.sdp });
        } catch (e) {
          console.error('renegotiation answer error', e);
        }
      } else if (!isCoach && callState === 'idle') {
        // أول offer عند الطالب — مكالمة جديدة واردة، ننتظر ضغطة المستخدم
        pendingOfferSdpRef.current = payload.sdp;
        setCallState('incoming');
      }
      // المدرب لا يستقبل أول offer أبداً (هو caller دائماً)؛ أي حالة أخرى تُتجاهل بأمان
    };

    const handleAnswer = async (payload: { sdp: string }) => {
      const pc = pcRef.current;
      if (!pc) return;
      try {
        await pc.setRemoteDescription({ type: 'answer', sdp: payload.sdp });
      } catch (e) {
        console.error('setRemoteDescription answer error', e);
      }
    };

    const handleIce = async (payload: { candidate: RTCIceCandidateInit }) => {
      const pc = pcRef.current;
      if (!pc || !payload.candidate) return;
      try {
        await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
      } catch (e) {
        console.error('addIceCandidate error', e);
      }
    };

    const handleEndCall = () => endCall();

    socket.on('webrtc:offer', handleOffer);
    socket.on('webrtc:answer', handleAnswer);
    socket.on('webrtc:ice', handleIce);
    socket.on('webrtc:end-call', handleEndCall);

    return () => {
      socket.off('webrtc:offer', handleOffer);
      socket.off('webrtc:answer', handleAnswer);
      socket.off('webrtc:ice', handleIce);
      socket.off('webrtc:end-call', handleEndCall);
    };
  }, [socket, callState, isCoach, endCall]);

  // تنظيف عند فك تركيب المكوّن (مثلاً تغيير الصفحة)
  useEffect(() => () => endCall(), [endCall]);

  // ── واجهة الأزرار ────────────────────────────────────────────────────────
  const micLabel =
    callState === 'idle' ? (isCoach ? 'تشغيل المايك' : null) :
    callState === 'incoming' ? 'قبول المكالمة' :
    micEnabled ? 'كتم المايك' : 'إلغاء الكتم';

  const showMicButton = callState !== 'idle' || isCoach;
  const showVideoButton = callState === 'active';

  const micButtonBg =
    callState === 'idle' ? '#50555e'
    : callState === 'incoming' ? '#1a6b8b'
    : micEnabled ? '#1a8b3a' : '#8b1a1a';

  const MicButton = micLabel && (showMicButton) && (
    <button
      onClick={toggleMic}
      title={micLabel}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
        padding: layout === 'vertical' ? '6px 8px' : '5px 10px',
        borderRadius: 5, border: 'none', cursor: 'pointer',
        fontSize: 11, fontWeight: 700, width: layout === 'vertical' ? '100%' : undefined,
        background: micButtonBg, color: '#e8e0d0', transition: 'all 0.15s',
      }}
    >
      {callState === 'active' && !micEnabled ? <MicOff size={12} /> : <Mic size={12} />}
      {micLabel}
    </button>
  );

  const VideoButton = showVideoButton && (
    <button
      onClick={toggleVideo}
      title={videoEnabled ? 'إيقاف الفيديو' : 'تشغيل الفيديو'}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
        padding: layout === 'vertical' ? '6px 8px' : '5px 10px',
        borderRadius: 5, border: 'none', cursor: 'pointer',
        fontSize: 11, fontWeight: 700, width: layout === 'vertical' ? '100%' : undefined,
        background: videoEnabled ? '#1a8b3a' : '#50555e',
        color: '#e8e0d0', transition: 'all 0.15s',
      }}
    >
      {videoEnabled ? <VideoOff size={12} /> : <Video size={12} />}
      {videoEnabled ? 'إيقاف الفيديو' : 'تشغيل الفيديو'}
    </button>
  );

  const HangUpButton = callState === 'active' && (
    <button
      onClick={hangUp}
      title="إنهاء المكالمة"
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: layout === 'vertical' ? 5 : 0,
        width: layout === 'vertical' ? '100%' : 26, height: layout === 'vertical' ? undefined : 26,
        padding: layout === 'vertical' ? '6px 8px' : 0,
        borderRadius: 5, border: 'none', cursor: 'pointer',
        background: '#8b1a1a', color: '#e8e0d0', fontSize: 11, fontWeight: 700,
      }}
    >
      <PhoneOff size={12} />
      {layout === 'vertical' && 'إنهاء المكالمة'}
    </button>
  );

  const remoteAudioEl = (
    <>
      <audio ref={remoteAudioElRef} autoPlay />
      {audioBlocked && (
        <button
          onClick={() => {
            remoteAudioElRef.current
              ?.play()
              .then(() => setAudioBlocked(false))
              .catch(() => { /* still blocked, leave as-is */ });
          }}
          title="اضغط لتفعيل صوت الطرف الآخر"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
            padding: '5px 10px', borderRadius: 5, border: 'none', cursor: 'pointer',
            fontSize: 11, fontWeight: 700, background: '#8b1a1a', color: '#e8e0d0',
          }}
        >
          🔇 اضغط لتفعيل الصوت
        </button>
      )}
    </>
  );

  // ── الوضع العمودي: فيديوهات مكبّرة فوق بعض، الأزرار تحتها بعرض كامل ───────
  if (layout === 'vertical') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, width: '100%' }}>
        <video
          ref={localVideoElRef}
          muted
          autoPlay
          playsInline
          style={{
            width: '100%', maxWidth: 200, aspectRatio: '4 / 3', borderRadius: 6, background: '#000',
            border: '2px solid #b58863', objectFit: 'cover',
            display: videoEnabled ? 'block' : 'none',
          }}
        />
        <video
          ref={remoteVideoElRef}
          autoPlay
          playsInline
          style={{
            width: '100%', maxWidth: 200, aspectRatio: '4 / 3', borderRadius: 6, background: '#000',
            border: '2px solid #575e67', objectFit: 'cover',
            display: remoteVideoActive ? 'block' : 'none',
          }}
        />
        {remoteAudioEl}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, width: '100%' }}>
          {MicButton}
          {VideoButton}
          {HangUpButton}
        </div>
      </div>
    );
  }

  // ── الوضع الأفقي (الافتراضي القديم): شريط مضغوط ──────────────────────────
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
        <video
          ref={localVideoElRef}
          muted
          autoPlay
          playsInline
          style={{
            width: 64, height: 48, borderRadius: 4, background: '#000',
            border: '1.5px solid #b58863', objectFit: 'cover',
            display: videoEnabled ? 'block' : 'none',
          }}
        />
        <video
          ref={remoteVideoElRef}
          autoPlay
          playsInline
          style={{
            width: 64, height: 48, borderRadius: 4, background: '#000',
            border: '1.5px solid #575e67', objectFit: 'cover',
            display: remoteVideoActive ? 'block' : 'none',
          }}
        />
      </div>
      {remoteAudioEl}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {MicButton}
        {VideoButton}
        {HangUpButton}
      </div>
    </div>
  );
};
