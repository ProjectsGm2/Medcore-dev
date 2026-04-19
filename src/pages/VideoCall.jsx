import React, { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/apiClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Mic, MicOff, Video, VideoOff, PhoneOff, Monitor,
  MonitorOff, Users, AlertTriangle, Copy, Check
} from "lucide-react";
import { cn } from "@/lib/utils";

// Simple WebRTC peer-to-peer video call using a signaling approach
// Room state stored in DiagnosisRecord entity repurposed as a simple signaling store
// We use base44 real-time subscriptions as the signaling channel

const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

export default function VideoCall({ currentUser }) {
  const urlParams = new URLSearchParams(window.location.search);
  const roomId = urlParams.get("room");
  const appointmentId = urlParams.get("appointment");

  const [appointment, setAppointment] = useState(null);
  const [status, setStatus] = useState("connecting"); // connecting | waiting | in-call | ended | error
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [screenShare, setScreenShare] = useState(false);
  const [copied, setCopied] = useState(false);
  const [peerConnected, setPeerConnected] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [localStream, setLocalStream] = useState(null);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const pcRef = useRef(null);
  const signalingRef = useRef(null);
  const callTimerRef = useRef(null);
  const screenStreamRef = useRef(null);

  // Fetch appointment info
  useEffect(() => {
    if (!appointmentId) return;
    base44.entities.Appointment.filter({ id: appointmentId }).then((res) => {
      setAppointment(res?.[0] || null);
    });
  }, [appointmentId]);

  // Start local media
  useEffect(() => {
    let stream;
    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then((s) => {
        stream = s;
        setLocalStream(s);
        if (localVideoRef.current) localVideoRef.current.srcObject = s;
        setStatus("waiting");
      })
      .catch(() => setStatus("error"));

    return () => {
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Set up WebRTC signaling via base44 real-time subscriptions on a "VideoSignal" concept
  // We use Appointment entity's notes field updates as a lightweight signaling channel
  useEffect(() => {
    if (!roomId || !localStream) return;

    const isInitiator = urlParams.get("role") === "host";
    let pc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = pc;

    // Add local tracks
    localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));

    // Remote stream
    const remoteStream = new MediaStream();
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream;

    pc.ontrack = (event) => {
      event.streams[0].getTracks().forEach((track) => remoteStream.addTrack(track));
      setPeerConnected(true);
      setStatus("in-call");
      callTimerRef.current = setInterval(() => setCallDuration((d) => d + 1), 1000);
    };

    pc.onicecandidate = async (event) => {
      if (event.candidate) {
        // Store ICE candidate in appointment notes as JSON signal
        await storeSignal({ type: "ice", candidate: event.candidate, from: currentUser?.id });
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
        setPeerConnected(false);
        setStatus("waiting");
      }
    };

    // Poll for signaling messages every 2 seconds
    const pollInterval = setInterval(async () => {
      await pollSignals(pc, isInitiator);
    }, 2000);

    if (isInitiator) {
      // Create offer
      pc.createOffer().then((offer) => {
        pc.setLocalDescription(offer);
        storeSignal({ type: "offer", sdp: offer, from: currentUser?.id });
      });
    }

    return () => {
      clearInterval(pollInterval);
      clearInterval(callTimerRef.current);
      pc.close();
    };
  }, [roomId, localStream]);

  const storeSignal = async (signal) => {
    if (!appointmentId) return;
    try {
      const appt = await base44.entities.Appointment.filter({ id: appointmentId });
      const existing = appt?.[0];
      if (!existing) return;
      let signals = [];
      try { signals = JSON.parse(existing.notes || "[]"); } catch { signals = []; }
      if (!Array.isArray(signals)) signals = [];
      signals.push({ ...signal, ts: Date.now() });
      // Keep only last 30 signals
      if (signals.length > 30) signals = signals.slice(-30);
      await base44.entities.Appointment.update(appointmentId, { notes: JSON.stringify(signals) });
    } catch {}
  };

  const processedSignals = useRef(new Set());

  const pollSignals = async (pc, isInitiator) => {
    if (!appointmentId) return;
    try {
      const appt = await base44.entities.Appointment.filter({ id: appointmentId });
      const existing = appt?.[0];
      if (!existing) return;
      let signals = [];
      try { signals = JSON.parse(existing.notes || "[]"); } catch { signals = []; }
      if (!Array.isArray(signals)) return;

      for (const signal of signals) {
        const key = `${signal.ts}-${signal.type}`;
        if (processedSignals.current.has(key)) continue;
        if (signal.from === currentUser?.id) continue; // skip own signals
        processedSignals.current.add(key);

        if (signal.type === "offer" && !isInitiator && pc.signalingState === "stable") {
          await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await storeSignal({ type: "answer", sdp: answer, from: currentUser?.id });
        } else if (signal.type === "answer" && isInitiator && pc.signalingState === "have-local-offer") {
          await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        } else if (signal.type === "ice" && pc.remoteDescription) {
          await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
        }
      }
    } catch {}
  };

  const toggleMic = () => {
    localStream?.getAudioTracks().forEach((t) => (t.enabled = !micOn));
    setMicOn((v) => !v);
  };

  const toggleCam = () => {
    localStream?.getVideoTracks().forEach((t) => (t.enabled = !camOn));
    setCamOn((v) => !v);
  };

  const toggleScreenShare = async () => {
    if (!screenShare) {
      try {
        const ss = await navigator.mediaDevices.getDisplayMedia({ video: true });
        screenStreamRef.current = ss;
        const videoTrack = ss.getVideoTracks()[0];
        const sender = pcRef.current?.getSenders().find((s) => s.track?.kind === "video");
        if (sender) sender.replaceTrack(videoTrack);
        if (localVideoRef.current) localVideoRef.current.srcObject = ss;
        setScreenShare(true);
        videoTrack.onended = () => toggleScreenShare();
      } catch {}
    } else {
      const videoTrack = localStream?.getVideoTracks()[0];
      const sender = pcRef.current?.getSenders().find((s) => s.track?.kind === "video");
      if (sender && videoTrack) sender.replaceTrack(videoTrack);
      if (localVideoRef.current) localVideoRef.current.srcObject = localStream;
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
      setScreenShare(false);
    }
  };

  const endCall = async () => {
    localStream?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    pcRef.current?.close();
    clearInterval(callTimerRef.current);
    if (appointmentId) {
      await base44.functions.invoke("videoRoom", { appointment_id: appointmentId, action: "end_room" });
      // Clear signals
      await base44.entities.Appointment.update(appointmentId, { notes: "[]", video_status: "ended" });
    }
    setStatus("ended");
  };

  const copyLink = () => {
    const link = window.location.href.replace("role=host", "role=guest");
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatDuration = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  if (!roomId) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-900">
        <div className="text-center text-white">
          <AlertTriangle className="w-10 h-10 text-amber-400 mx-auto mb-3" />
          <p className="text-lg font-semibold">Invalid video call link</p>
          <p className="text-slate-400 text-sm mt-1">No room ID found in URL</p>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-900">
        <div className="text-center text-white">
          <AlertTriangle className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <p className="text-lg font-semibold">Camera / Microphone Access Denied</p>
          <p className="text-slate-400 text-sm mt-1">Please allow camera and microphone access to join the call.</p>
        </div>
      </div>
    );
  }

  if (status === "ended") {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-900">
        <div className="text-center text-white">
          <PhoneOff className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <p className="text-2xl font-bold mb-2">Call Ended</p>
          <p className="text-slate-400">Duration: {formatDuration(callDuration)}</p>
          {appointment && (
            <p className="text-slate-300 text-sm mt-2">
              Consultation with {appointment.patient_name} — Dr. {appointment.doctor_name}
            </p>
          )}
          <Button onClick={() => window.close()} className="mt-6 bg-slate-700 hover:bg-slate-600">
            Close Window
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-slate-900 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 bg-slate-800/80 border-b border-slate-700/50 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-teal-500 flex items-center justify-center">
            <Video className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-white text-sm font-semibold">MedCore Video Consultation</p>
            {appointment && (
              <p className="text-slate-400 text-xs">{appointment.patient_name} · Dr. {appointment.doctor_name}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {status === "in-call" && (
            <Badge className="bg-emerald-600 text-white border-0 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              {formatDuration(callDuration)}
            </Badge>
          )}
          {status === "waiting" && (
            <Badge className="bg-amber-600 text-white border-0">Waiting for participant…</Badge>
          )}
          <Badge variant="outline" className="border-slate-600 text-slate-400 flex items-center gap-1.5">
            <Users className="w-3 h-3" /> {peerConnected ? 2 : 1} participant{peerConnected ? "s" : ""}
          </Badge>
        </div>
      </div>

      {/* Video area */}
      <div className="flex-1 relative bg-slate-900 overflow-hidden">
        {/* Remote video (main) */}
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className={cn(
            "w-full h-full object-cover transition-opacity duration-300",
            !peerConnected && "opacity-0"
          )}
        />

        {/* Waiting / connecting overlay */}
        {!peerConnected && (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="w-20 h-20 rounded-full bg-slate-700 flex items-center justify-center mb-4 animate-pulse">
              <Users className="w-9 h-9 text-slate-400" />
            </div>
            <p className="text-white text-lg font-semibold">
              {status === "connecting" ? "Setting up..." : "Waiting for the other participant"}
            </p>
            <p className="text-slate-400 text-sm mt-1">Share the call link to invite</p>
            <Button
              onClick={copyLink}
              className="mt-4 bg-slate-700 hover:bg-slate-600 text-white gap-2"
              size="sm"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? "Link Copied!" : "Copy Invite Link"}
            </Button>
          </div>
        )}

        {/* Local video (PiP) */}
        <div className="absolute bottom-4 right-4 w-40 h-28 sm:w-52 sm:h-36 rounded-xl overflow-hidden border-2 border-slate-600 shadow-2xl bg-slate-800">
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />
          {!camOn && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-800">
              <VideoOff className="w-6 h-6 text-slate-500" />
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

          <button
            onClick={toggleScreenShare}
            className={cn(
              "w-12 h-12 rounded-full flex items-center justify-center transition-all",
              screenShare ? "bg-cyan-600 hover:bg-cyan-700 text-white" : "bg-slate-700 hover:bg-slate-600 text-white"
            )}
          >
            {screenShare ? <MonitorOff className="w-5 h-5" /> : <Monitor className="w-5 h-5" />}
          </button>

          <button
            onClick={endCall}
            className="w-14 h-14 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center text-white transition-all shadow-lg"
          >
            <PhoneOff className="w-6 h-6" />
          </button>

          <button
            onClick={copyLink}
            className="w-12 h-12 rounded-full bg-slate-700 hover:bg-slate-600 flex items-center justify-center text-white transition-all"
            title="Copy invite link"
          >
            {copied ? <Check className="w-5 h-5 text-emerald-400" /> : <Copy className="w-5 h-5" />}
          </button>
        </div>

        <div className="flex justify-center mt-2 gap-6 text-xs text-slate-500">
          <span>{micOn ? "Mic On" : "Muted"}</span>
          <span>{camOn ? "Camera On" : "Camera Off"}</span>
          {screenShare && <span className="text-cyan-400">Screen Sharing</span>}
        </div>
      </div>
    </div>
  );
}