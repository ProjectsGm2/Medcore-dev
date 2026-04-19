import React, { useEffect, useRef, useState, useCallback } from "react";
import { base44 } from "@/api/apiClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Mic, MicOff, Video, VideoOff, PhoneOff,
  Users, Loader2, AlertTriangle, Copy, Check, X
} from "lucide-react";
import { cn } from "@/lib/utils";

const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
  ],
};

// Pre-join preview screen
function PreJoinScreen({ onJoin, onCancel, appointment }) {
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [stream, setStream] = useState(null);
  const [error, setError] = useState(null);
  const [devices, setDevices] = useState({ cameras: [], mics: [] });
  const [selectedCam, setSelectedCam] = useState("");
  const [selectedMic, setSelectedMic] = useState("");
  const videoRef = useRef(null);

  useEffect(() => {
    let localStream;
    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then(async (s) => {
        localStream = s;
        setStream(s);
        if (videoRef.current) videoRef.current.srcObject = s;
        const devs = await navigator.mediaDevices.enumerateDevices();
        setDevices({
          cameras: devs.filter((d) => d.kind === "videoinput"),
          mics: devs.filter((d) => d.kind === "audioinput"),
        });
      })
      .catch(() => setError("Camera/microphone access denied. Please allow permissions and try again."));

    return () => {
      localStream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const toggleMic = () => {
    stream?.getAudioTracks().forEach((t) => (t.enabled = micOn ? false : true));
    setMicOn((v) => !v);
  };

  const toggleCam = () => {
    stream?.getVideoTracks().forEach((t) => (t.enabled = camOn ? false : true));
    setCamOn((v) => !v);
  };

  const handleJoin = () => {
    // Stop preview stream — the call component will create its own
    stream?.getTracks().forEach((t) => t.stop());
    onJoin({ micOn, camOn, selectedCam, selectedMic });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div className="bg-slate-900 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-teal-500 flex items-center justify-center">
              <Video className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-white font-semibold text-sm">Video Consultation</p>
              {appointment && (
                <p className="text-slate-400 text-xs">{appointment.patient_name} · Dr. {appointment.doctor_name}</p>
              )}
            </div>
          </div>
          <button onClick={onCancel} className="text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {error ? (
            <div className="text-center py-8">
              <AlertTriangle className="w-10 h-10 text-amber-400 mx-auto mb-3" />
              <p className="text-white text-sm">{error}</p>
            </div>
          ) : (
            <>
              {/* Camera preview */}
              <div className="relative bg-slate-800 rounded-xl overflow-hidden aspect-video">
                <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                {!camOn && (
                  <div className="absolute inset-0 flex items-center justify-center bg-slate-800">
                    <VideoOff className="w-10 h-10 text-slate-500" />
                    <p className="text-slate-400 ml-2 text-sm">Camera off</p>
                  </div>
                )}
                {!stream && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
                  </div>
                )}
              </div>

              {/* Controls row */}
              <div className="flex items-center justify-center gap-4">
                <button
                  onClick={toggleMic}
                  className={cn(
                    "w-12 h-12 rounded-full flex items-center justify-center transition-all",
                    micOn ? "bg-slate-700 hover:bg-slate-600 text-white" : "bg-red-600 hover:bg-red-700 text-white"
                  )}
                >
                  {micOn ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
                </button>
                <button
                  onClick={toggleCam}
                  className={cn(
                    "w-12 h-12 rounded-full flex items-center justify-center transition-all",
                    camOn ? "bg-slate-700 hover:bg-slate-600 text-white" : "bg-red-600 hover:bg-red-700 text-white"
                  )}
                >
                  {camOn ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
                </button>
              </div>
              <div className="flex justify-center gap-6 text-xs text-slate-500">
                <span>{micOn ? "Mic On" : "Mic Off"}</span>
                <span>{camOn ? "Camera On" : "Camera Off"}</span>
              </div>

              {/* Device selectors */}
              {(devices.cameras.length > 1 || devices.mics.length > 1) && (
                <div className="grid grid-cols-2 gap-2">
                  {devices.cameras.length > 1 && (
                    <select
                      value={selectedCam}
                      onChange={(e) => setSelectedCam(e.target.value)}
                      className="text-xs bg-slate-800 border border-slate-600 text-slate-300 rounded-md px-2 py-1.5"
                    >
                      {devices.cameras.map((d) => (
                        <option key={d.deviceId} value={d.deviceId}>{d.label || "Camera"}</option>
                      ))}
                    </select>
                  )}
                  {devices.mics.length > 1 && (
                    <select
                      value={selectedMic}
                      onChange={(e) => setSelectedMic(e.target.value)}
                      className="text-xs bg-slate-800 border border-slate-600 text-slate-300 rounded-md px-2 py-1.5"
                    >
                      {devices.mics.map((d) => (
                        <option key={d.deviceId} value={d.deviceId}>{d.label || "Microphone"}</option>
                      ))}
                    </select>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <div className="px-5 pb-5 flex gap-3">
          <Button variant="outline" onClick={onCancel} className="flex-1 border-slate-600 text-slate-300 hover:bg-slate-800">
            Cancel
          </Button>
          {!error && (
            <Button
              onClick={handleJoin}
              disabled={!stream}
              className="flex-1 bg-cyan-600 hover:bg-cyan-700 text-white"
            >
              {stream ? "Join Call" : <><Loader2 className="w-4 h-4 animate-spin mr-2" />Loading...</>}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// Active call component
function ActiveCall({ appointment, appointmentId, currentUser, initialMic, initialCam, onEnd }) {
  const [status, setStatus] = useState("connecting");
  const [micOn, setMicOn] = useState(initialMic);
  const [camOn, setCamOn] = useState(initialCam);
  const [peerConnected, setPeerConnected] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [copied, setCopied] = useState(false);
  const [localStream, setLocalStream] = useState(null);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const pcRef = useRef(null);
  const callTimerRef = useRef(null);
  const processedSignals = useRef(new Set());
  const pollRef = useRef(null);
  const mountedRef = useRef(true);

  const isInitiator = currentUser?.role === "doctor";

  const storeSignal = useCallback(async (signal) => {
    if (!appointmentId) return;
    try {
      const appt = await base44.entities.Appointment.filter({ id: appointmentId });
      const existing = appt?.[0];
      if (!existing) return;
      let signals = [];
      try { signals = JSON.parse(existing.notes || "[]"); } catch { signals = []; }
      if (!Array.isArray(signals)) signals = [];
      signals.push({ ...signal, ts: Date.now() });
      if (signals.length > 40) signals = signals.slice(-40);
      await base44.entities.Appointment.update(appointmentId, { notes: JSON.stringify(signals) });
    } catch {}
  }, [appointmentId]);

  const pollSignals = useCallback(async (pc) => {
    if (!appointmentId || !mountedRef.current) return;
    try {
      const appt = await base44.entities.Appointment.filter({ id: appointmentId });
      const existing = appt?.[0];
      if (!existing) return;
      let signals = [];
      try { signals = JSON.parse(existing.notes || "[]"); } catch { signals = []; }
      if (!Array.isArray(signals)) return;

      for (const signal of signals) {
        const key = `${signal.ts}-${signal.type}-${signal.from}`;
        if (processedSignals.current.has(key)) continue;
        if (signal.from === currentUser?.id) continue;
        processedSignals.current.add(key);

        if (signal.type === "offer" && !isInitiator && pc.signalingState === "stable") {
          await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await storeSignal({ type: "answer", sdp: answer, from: currentUser?.id });
        } else if (signal.type === "answer" && isInitiator && pc.signalingState === "have-local-offer") {
          await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        } else if (signal.type === "ice" && pc.remoteDescription) {
          try { await pc.addIceCandidate(new RTCIceCandidate(signal.candidate)); } catch {}
        } else if (signal.type === "end") {
          if (mountedRef.current) endCall(false);
        }
      }
    } catch {}
  }, [appointmentId, currentUser, isInitiator, storeSignal]);

  useEffect(() => {
    mountedRef.current = true;
    let stream;

    const init = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (!mountedRef.current) { stream.getTracks().forEach((t) => t.stop()); return; }
        
        // Apply initial settings
        stream.getAudioTracks().forEach((t) => (t.enabled = initialMic));
        stream.getVideoTracks().forEach((t) => (t.enabled = initialCam));
        setLocalStream(stream);
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;

        const pc = new RTCPeerConnection(ICE_SERVERS);
        pcRef.current = pc;

        stream.getTracks().forEach((track) => pc.addTrack(track, stream));

        const remoteStream = new MediaStream();
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream;

        pc.ontrack = (event) => {
          event.streams[0].getTracks().forEach((track) => remoteStream.addTrack(track));
          if (mountedRef.current) {
            setPeerConnected(true);
            setStatus("in-call");
            callTimerRef.current = setInterval(() => setCallDuration((d) => d + 1), 1000);
          }
        };

        pc.onicecandidate = async (event) => {
          if (event.candidate) {
            await storeSignal({ type: "ice", candidate: event.candidate, from: currentUser?.id });
          }
        };

        pc.onconnectionstatechange = () => {
          if (!mountedRef.current) return;
          if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
            setPeerConnected(false);
            setStatus("reconnecting");
            // Try to reconnect
            setTimeout(() => {
              if (mountedRef.current && pc.connectionState !== "connected") {
                setStatus("waiting");
              }
            }, 5000);
          } else if (pc.connectionState === "connected") {
            setStatus("in-call");
          }
        };

        setStatus("waiting");

        if (isInitiator) {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          await storeSignal({ type: "offer", sdp: offer, from: currentUser?.id });
        }

        pollRef.current = setInterval(() => pollSignals(pc), 2000);
      } catch {
        if (mountedRef.current) setStatus("error");
      }
    };

    init();

    return () => {
      mountedRef.current = false;
      clearInterval(pollRef.current);
      clearInterval(callTimerRef.current);
      stream?.getTracks().forEach((t) => t.stop());
      pcRef.current?.close();
    };
  }, []);

  const endCall = useCallback(async (sendSignal = true) => {
    clearInterval(pollRef.current);
    clearInterval(callTimerRef.current);
    localStream?.getTracks().forEach((t) => t.stop());
    pcRef.current?.close();
    if (appointmentId && sendSignal) {
      await storeSignal({ type: "end", from: currentUser?.id });
      await base44.entities.Appointment.update(appointmentId, { video_status: "ended" });
    }
    onEnd(callDuration);
  }, [localStream, appointmentId, currentUser, storeSignal, callDuration, onEnd]);

  const toggleMic = () => {
    localStream?.getAudioTracks().forEach((t) => (t.enabled = !micOn));
    setMicOn((v) => !v);
  };

  const toggleCam = () => {
    localStream?.getVideoTracks().forEach((t) => (t.enabled = !camOn));
    setCamOn((v) => !v);
  };

  const formatDuration = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  const copyInviteLink = () => {
    const link = `${window.location.origin}/VideoCall?room=${appointmentId}&appointment=${appointmentId}&role=guest`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (status === "error") {
    return (
      <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center">
        <div className="bg-slate-900 rounded-2xl p-8 text-center max-w-sm mx-4">
          <AlertTriangle className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <p className="text-white font-semibold mb-2">Cannot access camera/microphone</p>
          <p className="text-slate-400 text-sm mb-4">Please allow permissions in your browser settings.</p>
          <Button onClick={() => onEnd(0)} className="bg-slate-700 hover:bg-slate-600">Close</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-800/90 border-b border-slate-700/50 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-teal-500 flex items-center justify-center">
            <Video className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-white text-sm font-semibold">Video Consultation</p>
            {appointment && (
              <p className="text-slate-400 text-xs">{appointment.patient_name} · Dr. {appointment.doctor_name}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {status === "in-call" && (
            <Badge className="bg-emerald-600 text-white border-0 flex items-center gap-1.5 text-xs">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              {formatDuration(callDuration)}
            </Badge>
          )}
          {(status === "waiting" || status === "connecting") && (
            <Badge className="bg-amber-600 text-white border-0 text-xs">
              <Loader2 className="w-3 h-3 animate-spin mr-1" />
              Waiting…
            </Badge>
          )}
          {status === "reconnecting" && (
            <Badge className="bg-orange-600 text-white border-0 text-xs">
              <Loader2 className="w-3 h-3 animate-spin mr-1" />
              Reconnecting…
            </Badge>
          )}
          <Badge variant="outline" className="border-slate-600 text-slate-400 flex items-center gap-1 text-xs">
            <Users className="w-3 h-3" /> {peerConnected ? 2 : 1}
          </Badge>
        </div>
      </div>

      {/* Video area */}
      <div className="flex-1 relative bg-slate-900 overflow-hidden">
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className={cn("w-full h-full object-cover transition-opacity duration-300", !peerConnected && "opacity-0")}
        />

        {!peerConnected && (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="w-20 h-20 rounded-full bg-slate-700 flex items-center justify-center mb-4">
              <Users className="w-9 h-9 text-slate-400" />
            </div>
            <p className="text-white text-lg font-semibold">
              {status === "connecting" ? "Setting up..." : status === "reconnecting" ? "Reconnecting..." : "Waiting for participant"}
            </p>
            <p className="text-slate-400 text-sm mt-1 mb-4">Share the link to invite</p>
            <Button onClick={copyInviteLink} className="bg-slate-700 hover:bg-slate-600 text-white gap-2" size="sm">
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? "Copied!" : "Copy Invite Link"}
            </Button>
          </div>
        )}

        {/* Local PiP */}
        <div className="absolute bottom-4 right-4 w-36 h-24 sm:w-48 sm:h-32 rounded-xl overflow-hidden border-2 border-slate-600 shadow-2xl bg-slate-800">
          <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
          {!camOn && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-800">
              <VideoOff className="w-5 h-5 text-slate-500" />
            </div>
          )}
          <div className="absolute bottom-1 left-2 text-xs text-white/70">You</div>
        </div>
      </div>

      {/* Controls */}
      <div className="shrink-0 bg-slate-800/90 border-t border-slate-700/50 px-6 py-4">
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={toggleMic}
            title={micOn ? "Mute" : "Unmute"}
            className={cn(
              "w-12 h-12 rounded-full flex items-center justify-center transition-all",
              micOn ? "bg-slate-700 hover:bg-slate-600 text-white" : "bg-red-600 hover:bg-red-700 text-white"
            )}
          >
            {micOn ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
          </button>

          <button
            onClick={toggleCam}
            title={camOn ? "Turn off camera" : "Turn on camera"}
            className={cn(
              "w-12 h-12 rounded-full flex items-center justify-center transition-all",
              camOn ? "bg-slate-700 hover:bg-slate-600 text-white" : "bg-red-600 hover:bg-red-700 text-white"
            )}
          >
            {camOn ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
          </button>

          <button
            onClick={() => endCall(true)}
            title="End call"
            className="w-14 h-14 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center text-white transition-all shadow-lg"
          >
            <PhoneOff className="w-6 h-6" />
          </button>

          <button
            onClick={copyInviteLink}
            title="Copy invite link"
            className="w-12 h-12 rounded-full bg-slate-700 hover:bg-slate-600 flex items-center justify-center text-white transition-all"
          >
            {copied ? <Check className="w-5 h-5 text-emerald-400" /> : <Copy className="w-5 h-5" />}
          </button>
        </div>
        <div className="flex justify-center mt-2 gap-6 text-xs text-slate-500">
          <span>{micOn ? "Mic On" : "Muted"}</span>
          <span>{camOn ? "Camera On" : "Camera Off"}</span>
        </div>
      </div>
    </div>
  );
}

// Call ended screen
function CallEndedScreen({ duration, appointment, onClose }) {
  const formatDuration = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center">
      <div className="bg-slate-900 rounded-2xl p-8 text-center max-w-sm mx-4 shadow-2xl">
        <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center mx-auto mb-4">
          <PhoneOff className="w-8 h-8 text-red-400" />
        </div>
        <p className="text-white text-xl font-bold mb-2">Call Ended</p>
        <p className="text-slate-400 text-sm">Duration: {formatDuration(duration)}</p>
        {appointment && (
          <p className="text-slate-300 text-sm mt-1">
            {appointment.patient_name} · Dr. {appointment.doctor_name}
          </p>
        )}
        <Button onClick={onClose} className="mt-6 bg-slate-700 hover:bg-slate-600 w-full">
          Close
        </Button>
      </div>
    </div>
  );
}

export default function VideoCallModal({ open, appointment, appointmentId, currentUser, onClose }) {
  const [phase, setPhase] = useState("prejoin"); // prejoin | call | ended
  const [callSettings, setCallSettings] = useState(null);
  const [endedDuration, setEndedDuration] = useState(0);

  // Reset phase when modal opens
  useEffect(() => {
    if (open) setPhase("prejoin");
  }, [open]);

  if (!open) return null;

  if (phase === "prejoin") {
    return (
      <PreJoinScreen
        appointment={appointment}
        onCancel={onClose}
        onJoin={(settings) => {
          setCallSettings(settings);
          setPhase("call");
        }}
      />
    );
  }

  if (phase === "call") {
    return (
      <ActiveCall
        appointment={appointment}
        appointmentId={appointmentId}
        currentUser={currentUser}
        initialMic={callSettings?.micOn ?? true}
        initialCam={callSettings?.camOn ?? true}
        onEnd={(duration) => {
          setEndedDuration(duration);
          setPhase("ended");
        }}
      />
    );
  }

  if (phase === "ended") {
    return (
      <CallEndedScreen
        duration={endedDuration}
        appointment={appointment}
        onClose={() => {
          setPhase("prejoin");
          onClose();
        }}
      />
    );
  }

  return null;
}