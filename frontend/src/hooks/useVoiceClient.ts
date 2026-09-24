"use client";

import { useEffect, useRef, useCallback } from "react";
import { useAppStore } from "@/store/useAppStore";

interface PeerConnectionMap {
  [peerUserId: string]: RTCPeerConnection;
}

export function useVoiceClient(wsRef: React.RefObject<WebSocket | null>) {
  const {
    myUserId,
    voice,
    setVoiceChannel,
    setSpeaking,
    updateVoiceMembers,
    setMemberVoiceChannel,
  } = useAppStore();

  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<PeerConnectionMap>({});
  const audioElementsRef = useRef<Record<string, HTMLAudioElement>>({});
  const pendingCandidatesRef = useRef<Record<string, RTCIceCandidateInit[]>>({});

  // Robust STUN servers for peer-to-peer NAT traversal across different networks/devices
  const rtcConfig: RTCConfiguration = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      { urls: "stun:stun2.l.google.com:19302" },
      { urls: "stun:stun3.l.google.com:19302" },
      { urls: "stun:stun4.l.google.com:19302" },
      { urls: "stun:stun.services.mozilla.com" },
    ],
    iceCandidatePoolSize: 10,
  };

  // Close all peer connections cleanly
  const cleanupVoice = useCallback(() => {
    Object.values(peersRef.current).forEach((pc) => {
      try {
        pc.close();
      } catch {}
    });
    peersRef.current = {};
    pendingCandidatesRef.current = {};

    Object.values(audioElementsRef.current).forEach((audio) => {
      try {
        audio.pause();
        audio.srcObject = null;
        audio.remove();
      } catch {}
    });
    audioElementsRef.current = {};

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
  }, []);

  // Ensure local tracks are attached before negotiating
  const ensureLocalTracks = useCallback((pc: RTCPeerConnection) => {
    if (localStreamRef.current) {
      const senders = pc.getSenders();
      localStreamRef.current.getAudioTracks().forEach((track) => {
        const alreadyAdded = senders.some((s) => s.track?.id === track.id);
        if (!alreadyAdded) {
          pc.addTrack(track, localStreamRef.current!);
        }
      });
    }
  }, []);

  // Helper to create or get an RTCPeerConnection
  const getOrCreatePeer = useCallback(
    (targetUserId: string) => {
      if (peersRef.current[targetUserId]) {
        return peersRef.current[targetUserId];
      }

      const pc = new RTCPeerConnection(rtcConfig);
      peersRef.current[targetUserId] = pc;

      // Add local audio tracks to peer connection
      ensureLocalTracks(pc);

      // Relay ICE candidates over the WebSocket gateway
      pc.onicecandidate = (event) => {
        if (event.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(
            JSON.stringify({
              op: 5, // VOICE_SIGNAL
              d: {
                targetUserId,
                signal: { type: "candidate", candidate: event.candidate },
              },
            })
          );
        }
      };

      // Handle remote incoming audio stream
      pc.ontrack = (event) => {
        console.log(`[WebRTC] Received audio track from peer: ${targetUserId}`, event);
        const remoteTrack = event.track;

        let audio = audioElementsRef.current[targetUserId];
        if (!audio) {
          audio = document.createElement("audio");
          audio.autoplay = true;
          audio.setAttribute("playsinline", "true");
          audio.setAttribute("webkit-playsinline", "true");
          // Never use display:none as mobile browsers disable audio playback
          audio.style.position = "fixed";
          audio.style.top = "-9999px";
          audio.style.left = "-9999px";
          audio.style.width = "1px";
          audio.style.height = "1px";
          audio.style.opacity = "0.01";
          audio.style.pointerEvents = "none";
          document.body.appendChild(audio);
          audioElementsRef.current[targetUserId] = audio;
        }

        const remoteStream = event.streams[0] || new MediaStream([remoteTrack]);
        audio.srcObject = remoteStream;
        audio.volume = 1.0;
        audio.muted = false;

        const playAudio = () => {
          audio.play().catch((err) => {
            console.warn("[WebRTC] Autoplay pending user gesture:", err);
            const unlock = () => {
              audio.play().catch(() => {});
              window.removeEventListener("click", unlock);
              window.removeEventListener("touchstart", unlock);
            };
            window.addEventListener("click", unlock, { once: true });
            window.addEventListener("touchstart", unlock, { once: true });
          });
        };

        playAudio();

        remoteTrack.onunmute = () => {
          console.log(`[WebRTC] Track unmuted for ${targetUserId}`);
          playAudio();
        };

        // Direct hardware speaker routing and remote speaking activity indicator
        try {
          const AudioContextClass =
            window.AudioContext ||
            (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
          if (AudioContextClass) {
            const remoteCtx = new AudioContextClass();
            if (remoteCtx.state === "suspended") {
              const resumeCtx = () => {
                remoteCtx.resume().catch(() => {});
                window.removeEventListener("click", resumeCtx);
                window.removeEventListener("touchstart", resumeCtx);
              };
              window.addEventListener("click", resumeCtx, { once: true });
              window.addEventListener("touchstart", resumeCtx, { once: true });
            }

            const remoteSource = remoteCtx.createMediaStreamSource(remoteStream);
            const remoteAnalyser = remoteCtx.createAnalyser();
            remoteAnalyser.fftSize = 256;
            remoteSource.connect(remoteAnalyser);
            // Route through hardware speaker destination
            remoteSource.connect(remoteCtx.destination);

            const bufferLength = remoteAnalyser.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);

            const detectRemoteSpeaking = () => {
              if (remoteTrack.readyState === "ended") return;
              remoteAnalyser.getByteFrequencyData(dataArray);
              const avg = dataArray.reduce((acc, v) => acc + v, 0) / bufferLength;
              setSpeaking(targetUserId, avg > 12);
              requestAnimationFrame(detectRemoteSpeaking);
            };
            detectRemoteSpeaking();
          }
        } catch (e) {
          console.warn("[WebRTC] Web Audio speaker setup error:", e);
        }
      };

      return pc;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [wsRef, ensureLocalTracks]
  );

  // Join a voice channel
  const joinVoiceChannel = async (channelId: string) => {
    try {
      cleanupVoice();

      // 1. Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      localStreamRef.current = stream;

      // 2. Set speaking detection via AudioContext
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioCtx = new AudioCtx();
      const analyser = audioCtx.createAnalyser();
      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);
      analyser.fftSize = 256;
      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const checkVolume = () => {
        if (!localStreamRef.current) return;
        analyser.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((p, c) => p + c, 0) / dataArray.length;
        setSpeaking(myUserId, avg > 15 && !useAppStore.getState().voice.isMuted);
        requestAnimationFrame(checkVolume);
      };
      checkVolume();

      // 3. Emit VOICE_STATE_UPDATE over Gateway
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            op: 4,
            d: { channelId },
          })
        );
      }

      setVoiceChannel(channelId);
      setMemberVoiceChannel(myUserId, channelId);
    } catch (err) {
      console.error("[Voice] Microphone access error:", err);
      alert("Could not access microphone. Please allow microphone permissions in your browser.");
    }
  };

  // Leave voice channel
  const leaveVoiceChannel = () => {
    cleanupVoice();
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          op: 4,
          d: { channelId: null },
        })
      );
    }
    setVoiceChannel(null);
    setMemberVoiceChannel(myUserId, null);
  };

  // Handle gateway voice signals & events
  const handleVoiceGatewayEvent = useCallback(
    async (payload: { t: string; d: any }) => {
      const { t, d } = payload;

      if (t === "VOICE_SERVER_UPDATE") {
        // We received list of existing peers in this room: create offers for each
        const peers = (d.peers as string[]) || [];
        // Place myUserId in this channel, and existing peers
        setMemberVoiceChannel(myUserId, d.channelId);
        for (const peerId of peers) {
          setMemberVoiceChannel(peerId, d.channelId);
        }

        for (const peerId of peers) {
          try {
            const pc = getOrCreatePeer(peerId);
            ensureLocalTracks(pc);
            const offer = await pc.createOffer({
              offerToReceiveAudio: true,
            });
            await pc.setLocalDescription(offer);

            wsRef.current?.send(
              JSON.stringify({
                op: 5, // VOICE_SIGNAL
                d: {
                  targetUserId: peerId,
                  signal: { type: "offer", sdp: offer },
                },
              })
            );
          } catch (err) {
            console.error(`[WebRTC] Failed to create offer for ${peerId}:`, err);
          }
        }
      } else if (t === "VOICE_STATE_UPDATE") {
        const { channelId, userId } = d;
        if (userId) {
          setMemberVoiceChannel(userId, channelId || null);
        }
        if (channelId === null && userId) {
          if (peersRef.current[userId]) {
            peersRef.current[userId].close();
            delete peersRef.current[userId];
          }
          if (pendingCandidatesRef.current[userId]) {
            delete pendingCandidatesRef.current[userId];
          }
          if (audioElementsRef.current[userId]) {
            audioElementsRef.current[userId].pause();
            audioElementsRef.current[userId].remove();
            delete audioElementsRef.current[userId];
          }
        }
      } else if (t === "VOICE_SIGNAL") {
        const { senderUserId, signal } = d;
        const pc = getOrCreatePeer(senderUserId);

        try {
          if (signal.type === "offer") {
            await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));

            // Process any queued candidates that arrived before the offer
            const queued = pendingCandidatesRef.current[senderUserId] || [];
            for (const cand of queued) {
              await pc.addIceCandidate(new RTCIceCandidate(cand));
            }
            delete pendingCandidatesRef.current[senderUserId];

            ensureLocalTracks(pc);
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            wsRef.current?.send(
              JSON.stringify({
                op: 5,
                d: {
                  targetUserId: senderUserId,
                  signal: { type: "answer", sdp: answer },
                },
              })
            );
          } else if (signal.type === "answer") {
            await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));

            // Process any queued candidates that arrived before the answer
            const queued = pendingCandidatesRef.current[senderUserId] || [];
            for (const cand of queued) {
              await pc.addIceCandidate(new RTCIceCandidate(cand));
            }
            delete pendingCandidatesRef.current[senderUserId];
          } else if (signal.type === "candidate") {
            if (pc.remoteDescription && pc.remoteDescription.type) {
              await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
            } else {
              // Queue candidate until remoteDescription is set
              if (!pendingCandidatesRef.current[senderUserId]) {
                pendingCandidatesRef.current[senderUserId] = [];
              }
              pendingCandidatesRef.current[senderUserId].push(signal.candidate);
            }
          }
        } catch (signalErr) {
          console.error(`[WebRTC] Signaling error with ${senderUserId}:`, signalErr);
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [getOrCreatePeer, myUserId, updateVoiceMembers, wsRef, ensureLocalTracks, setMemberVoiceChannel]
  );

  // Mute / Unmute local audio track
  useEffect(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = !voice.isMuted;
      });
    }
  }, [voice.isMuted]);

  // Deafen / Undeafen audio playback
  useEffect(() => {
    Object.values(audioElementsRef.current).forEach((audio) => {
      audio.muted = voice.isDeafened;
    });
  }, [voice.isDeafened]);

  return {
    joinVoiceChannel,
    leaveVoiceChannel,
    handleVoiceGatewayEvent,
  };
}
