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

const CROSSFADE_MS = 22; // short enough that early frames (≥12 ms) never overlap

/**
 * Flicker-free two-slot crossfade.
 *
 * Root causes of the previous flickering:
 *  1. Stale closure: `aFront` was always the initial value inside the effect,
 *     so new src kept being written into `b` even while `b` was the visible
 *     front slot → src changed on a displayed img → flash.
 *  2. No busy-guard: rapid frames arrived before the previous 55 ms crossfade
 *     finished, overwriting mid-transition imgs → visible at partial opacity → flash.
 *
 * Fix:
 *  - Track which slot is front with a ref (never stale).
 *  - `busy` flag: only one crossfade runs at a time.
 *  - `pending`: queue the LATEST src; drain after crossfade completes.
 *  - RAF before flip: back slot is painted at opacity 0 before we switch
 *    `aFront`, so the CSS transition fires correctly (0 → 1, no flash-at-full-opacity).
 */
function CrossfadeImg({
  src,
  className,
  style,
}: {
  src?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [a, setA] = useState(src);
  const [b, setB] = useState<string | undefined>();
  const [aFront, setAFront] = useState(true);

  const st = useRef({ aFront: true, busy: false, cur: src, pending: undefined as string | undefined });

  // Stable reference — always reads current ref values, safe inside setTimeout/RAF
  const runNext = useRef<() => void>(() => {});
  runNext.current = () => {
    const s = st.current;
    if (s.pending === s.cur) { s.pending = undefined; return; }
    const incoming = s.pending;
    s.pending = undefined;
    s.cur = incoming;
    s.busy = true;

    // Write new src into BACK slot (opacity 0 → invisible → no flash)
    if (s.aFront) { setB(incoming); } else { setA(incoming); }

    // One browser paint later, flip — CSS transition fires cleanly
    requestAnimationFrame(() => {
      s.aFront = !s.aFront;
      setAFront(s.aFront);

      // After transition finishes, release lock and drain any queued src
      setTimeout(() => {
        s.busy = false;
        if (s.pending !== undefined) runNext.current();
      }, CROSSFADE_MS + 4);
    });
  };

  const prevRef = useRef(src);
  useEffect(() => {
    if (src === prevRef.current) return;
    prevRef.current = src;
    st.current.pending = src;
    if (!st.current.busy) runNext.current();
  }, [src]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!a && !b) return null;

  return (
    <>
      {a && (
        <img
          className={className}
          src={a}
          alt=""
          style={{ ...style, opacity: aFront ? 1 : 0, transition: `opacity ${CROSSFADE_MS}ms linear` }}
        />
      )}
      {b && (
        <img
          className={className}
          src={b}
          alt=""
          style={{ ...style, opacity: aFront ? 0 : 1, transition: `opacity ${CROSSFADE_MS}ms linear` }}
        />
      )}
    </>
  );
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
      {/* Background layer — crossfade between frames */}
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
        <CrossfadeImg className="layer" src={bgSrc} style={{ transform: bgShift }} />
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

      {/* Foreground depth layer — crossfade between frames */}
      <CrossfadeImg className="layer fg" src={fgSrc} style={{ transform: fgShift }} />

      <div className="island" />
    </div>
  );
}
