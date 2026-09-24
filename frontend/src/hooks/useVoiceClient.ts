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
  } = useAppStore();

  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<PeerConnectionMap>({});
  const audioElementsRef = useRef<Record<string, HTMLAudioElement>>({});
  const rtcConfig: RTCConfiguration = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
    ],
  };

  // Close all peer connections
  const cleanupVoice = useCallback(() => {
    Object.values(peersRef.current).forEach((pc) => pc.close());
    peersRef.current = {};

    Object.values(audioElementsRef.current).forEach((audio) => {
      audio.srcObject = null;
      audio.remove();
    });
    audioElementsRef.current = {};

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
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

      // Add local tracks to the connection
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => {
          pc.addTrack(track, localStreamRef.current!);
        });
      }

      // Handle ICE candidates
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

      // Handle incoming remote audio stream
      pc.ontrack = (event) => {
        let audio = audioElementsRef.current[targetUserId];
        if (!audio) {
          audio = document.createElement("audio");
          audio.autoplay = true;
          audioElementsRef.current[targetUserId] = audio;
        }
        audio.srcObject = event.streams[0];
      };

      return pc;
    },
    [wsRef]
  );

  // Join a voice channel
  const joinVoiceChannel = async (channelId: string) => {
    try {
      cleanupVoice();

      // 1. Capture microphone
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      localStreamRef.current = stream;

      // 2. Set speaking detection via AudioContext
      const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const analyser = audioCtx.createAnalyser();
      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);
      analyser.fftSize = 256;
      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const checkVolume = () => {
        if (!localStreamRef.current) return;
        analyser.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((p, c) => p + c, 0) / dataArray.length;
        setSpeaking(myUserId, avg > 15 && !voice.isMuted);
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
    } catch (err) {
      console.error("[Voice] Microphone access error:", err);
      alert("Could not access microphone. Please grant microphone permissions.");
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
  };

  // Handle gateway voice signals & events
  const handleVoiceGatewayEvent = useCallback(
    async (payload: { t: string; d: any }) => {
      const { t, d } = payload;

      if (t === "VOICE_SERVER_UPDATE") {
        // We received list of existing peers in this room: create offers for each
        const peers = d.peers as string[];
        updateVoiceMembers(d.channelId, [myUserId, ...peers]);

        for (const peerId of peers) {
          const pc = getOrCreatePeer(peerId);
          const offer = await pc.createOffer();
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
        }
      } else if (t === "VOICE_STATE_UPDATE") {
        const { channelId, userId } = d;
        if (channelId && userId && userId !== myUserId) {
          // A new peer joined the voice channel: update our member list
          const currentMembers = useAppStore.getState().voice.channelMembers[channelId] || [myUserId];
          if (!currentMembers.includes(userId)) {
            updateVoiceMembers(channelId, [...currentMembers, userId]);
          }
        } else if (channelId === null && userId) {
          // Peer left the channel
          const currentVoiceChannelId = useAppStore.getState().voice.currentVoiceChannelId;
          if (currentVoiceChannelId) {
            const currentMembers = useAppStore.getState().voice.channelMembers[currentVoiceChannelId] || [];
            updateVoiceMembers(currentVoiceChannelId, currentMembers.filter((id) => id !== userId));
          }
          if (peersRef.current[userId]) {
            peersRef.current[userId].close();
            delete peersRef.current[userId];
          }
          if (audioElementsRef.current[userId]) {
            audioElementsRef.current[userId].remove();
            delete audioElementsRef.current[userId];
          }
        }
      } else if (t === "VOICE_SIGNAL") {
        const { senderUserId, signal } = d;
        const pc = getOrCreatePeer(senderUserId);

        if (signal.type === "offer") {
          await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
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
        } else if (signal.type === "candidate") {
          await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
        }
      }
    },
    [getOrCreatePeer, myUserId, updateVoiceMembers, wsRef]
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
