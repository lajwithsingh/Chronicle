"use client";
import { useRef, useState, useCallback } from "react";

export function useVideoPlayer() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);

  const toggle = useCallback(() => {
    if (!videoRef.current) return;
    if (playing) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
    setPlaying((p) => !p);
  }, [playing]);

  const handleTimeUpdate = useCallback(() => {
    if (!videoRef.current) return;
    setProgress(videoRef.current.currentTime);
  }, []);

  const handleLoadedMetadata = useCallback(() => {
    if (!videoRef.current) return;
    setDuration(videoRef.current.duration);
  }, []);

  const seek = useCallback((time: number) => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = time;
    setProgress(time);
  }, []);

  const toggleMute = useCallback(() => {
    if (!videoRef.current) return;
    videoRef.current.muted = !videoRef.current.muted;
    setMuted((m) => !m);
  }, []);

  return {
    videoRef,
    playing,
    progress,
    duration,
    muted,
    toggle,
    toggleMute,
    seek,
    handleTimeUpdate,
    handleLoadedMetadata,
  };
}
