"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { WallpaperItem } from "@/lib/types";

type Props = {
  item: WallpaperItem;
  interactive?: boolean;
  mode?: "locked" | "unlock";
  replayKey?: number;
  onReady?: () => void;
};

function formatClock(date: Date) {
  return {
    time: date.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", hour12: false }),
    date: date.toLocaleDateString("vi-VN", { weekday: "long", day: "numeric", month: "long" }),
  };
}

export function PhoneFrame({
  item,
  interactive = false,
  mode = "locked",
  replayKey = 0,
  onReady,
}: Props) {
  const [shift, setShift] = useState({ x: 0, y: 0 });
  const [now, setNow] = useState(() => formatClock(new Date()));
  const [progress, setProgress] = useState(0);
  const progressRef = useRef(0);
  const rafRef = useRef(0);

  // Clock tick every 30 seconds
  useEffect(() => {
    const id = window.setInterval(() => setNow(formatClock(new Date())), 30_000);
    return () => window.clearInterval(id);
  }, []);

  // Frame list
  const frames = useMemo(
    () => [
      { bg: item.bg, fg: item.fg },
      ...(item.transitionFrames ?? []),
      { bg: item.unlockBg ?? item.bg, fg: item.unlockFg ?? item.fg },
    ],
    [item],
  );

  // Preload all frame images; fire onReady when done
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  useEffect(() => {
    const sources = frames
      .flatMap((f) => [f.bg, f.fg])
      .filter(Boolean) as string[];
    if (!sources.length) { onReadyRef.current?.(); return; }
    let remaining = sources.length;
    for (const src of sources) {
      const img = new Image();
      img.onload = img.onerror = () => { if (--remaining <= 0) onReadyRef.current?.(); };
      img.src = src;
    }
  }, [frames]);

  // Smooth animation with requestAnimationFrame
  const prevRef = useRef({ id: item.id, mode, replayKey });
  useEffect(() => {
    const prev = prevRef.current;
    const target = mode === "unlock" ? 1 : 0;

    // New item → snap instantly, no animation
    if (prev.id !== item.id) {
      prevRef.current = { id: item.id, mode, replayKey };
      cancelAnimationFrame(rafRef.current);
      progressRef.current = 0;
      setProgress(0);
      return;
    }

    prevRef.current = { id: item.id, mode, replayKey };

    // Replay → rewind to opposite end before animating
    const isReplay = prev.replayKey !== replayKey;
    const startFrom = isReplay ? (1 - target) : progressRef.current;
    if (isReplay) { progressRef.current = startFrom; setProgress(startFrom); }

    if (Math.abs(startFrom - target) < 0.005) return;

    cancelAnimationFrame(rafRef.current);
    const startedAt = performance.now();
    const duration = 820; // ms — slightly longer than before for more natural feel

    const tick = () => {
      const t = Math.max(0, Math.min(1, (performance.now() - startedAt) / duration));
      // Cubic ease-out: fast start, gentle deceleration
      const eased = 1 - Math.pow(1 - t, 3);
      const next = startFrom + (target - startFrom) * eased;
      progressRef.current = next;
      setProgress(next);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [item.id, mode, replayKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const bgShift = interactive ? `translate(${shift.x * -10}px, ${shift.y * -10}px)` : "none";
  const fgShift = interactive ? `translate(${shift.x * 16}px, ${shift.y * 16}px)` : "none";

  const frame = frames[Math.round(progress * (frames.length - 1))];
  const bgSrc = frame?.bg;
  const fgSrc = frame?.fg;

  const clockOpacity = Math.max(0, Math.min(1, 1 - progress * 1.6));

  return (
    <div
      className="phone"
      onPointerMove={
        interactive
          ? (e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setShift({
                x: (e.clientX - r.left) / r.width - 0.5,
                y: (e.clientY - r.top) / r.height - 0.5,
              });
            }
          : undefined
      }
      onPointerLeave={interactive ? () => setShift({ x: 0, y: 0 }) : undefined}
    >
      {/* Frames are preloaded before controls are enabled, so direct swaps do not flash. */}
      {item.video ? (
        <video
          className="layer"
          src={item.video}
          poster={bgSrc ?? item.poster}
          autoPlay
          muted
          loop
          playsInline
          style={{ transform: bgShift }}
        />
      ) : (
        bgSrc && <img className="layer" src={bgSrc} alt="" style={{ transform: bgShift }} />
      )}

      {/* Clock — continuous fade/slide driven by progress (60 fps via rAF) */}
      <div
        className="clock"
        style={{
          opacity: clockOpacity,
          transform: `translateY(${-progress * 20}px) scale(${1 - progress * 0.06})`,
        }}
      >
        <span>{now.date}</span>
        <time>{now.time}</time>
      </div>

      {/* Dock — slides up smoothly */}
      <div
        className="dock"
        aria-hidden="true"
        style={{ opacity: progress, transform: `translateY(${(1 - progress) * 28}px)` }}
      >
        <span /><span /><span /><span />
      </div>

      {fgSrc && <img className="layer fg" src={fgSrc} alt="" style={{ transform: fgShift }} />}

      <div className="island" />
    </div>
  );
}
