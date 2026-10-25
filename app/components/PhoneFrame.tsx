"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { WallpaperItem } from "@/lib/types";

type Props = {
  item: WallpaperItem;
  interactive?: boolean;
  mode?: "locked" | "unlock";
};

function formatClock(date: Date) {
  return {
    time: date.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", hour12: false }),
    date: date.toLocaleDateString("vi-VN", { weekday: "long", day: "numeric", month: "long" }),
  };
}

export function PhoneFrame({ item, interactive = false, mode = "locked" }: Props) {
  const [shift, setShift] = useState({ x: 0, y: 0 });
  const [now, setNow] = useState(() => formatClock(new Date()));
  const [progress, setProgress] = useState(mode === "unlock" ? 1 : 0);
  const progressRef = useRef(progress);
  const itemRef = useRef(item.id);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(formatClock(new Date())), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (itemRef.current !== item.id) {
      itemRef.current = item.id;
      const initial = mode === "unlock" ? 1 : 0;
      progressRef.current = initial;
      setProgress(initial);
      return;
    }

    const target = mode === "unlock" ? 1 : 0;
    const start = progressRef.current;
    if (start === target) return;
    const startedAt = performance.now();
    const duration = 720;

    const animate = () => {
      const elapsed = Math.max(0, Math.min(1, (performance.now() - startedAt) / duration));
      const eased = 1 - Math.pow(1 - elapsed, 3);
      const next = start + (target - start) * eased;
      progressRef.current = next;
      setProgress(next);
      if (elapsed >= 1) window.clearInterval(timer);
    };
    const timer = window.setInterval(animate, 1000 / 30);
    animate();
    return () => window.clearInterval(timer);
  }, [item.id, mode]);

  const bgShift = interactive ? `translate(${shift.x * -10}px, ${shift.y * -10}px)` : "none";
  const fgShift = interactive ? `translate(${shift.x * 16}px, ${shift.y * 16}px)` : "none";
  const frames = useMemo(
    () => [
      { bg: item.bg, fg: item.fg },
      ...(item.transitionFrames ?? []),
      { bg: item.unlockBg ?? item.bg, fg: item.unlockFg ?? item.fg },
    ],
    [item],
  );
  const frame = frames[Math.round(progress * (frames.length - 1))];
  const bgSrc = frame?.bg;
  const fgSrc = frame?.fg;

  useEffect(() => {
    for (const source of frames.flatMap((value) => [value.bg, value.fg]).filter(Boolean)) {
      const image = new Image();
      image.src = source as string;
    }
  }, [frames]);

  return (
    <div
      className="phone"
      onPointerMove={
        interactive
          ? (event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              setShift({
                x: (event.clientX - rect.left) / rect.width - 0.5,
                y: (event.clientY - rect.top) / rect.height - 0.5,
              });
            }
          : undefined
      }
      onPointerLeave={interactive ? () => setShift({ x: 0, y: 0 }) : undefined}
    >
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
      <div
        className="clock"
        style={{
          opacity: Math.max(0, Math.min(1, 1 - progress * 1.6)),
          transform: `translateY(${-progress * 20}px) scale(${1 - progress * 0.08})`,
        }}
      >
        <span>{now.date}</span>
        <time>{now.time}</time>
      </div>
      <div
        className="dock"
        aria-hidden="true"
        style={{ opacity: progress, transform: `translateY(${(1 - progress) * 28}px)` }}
      >
          <span />
          <span />
          <span />
          <span />
      </div>
      {fgSrc && <img className="layer fg" src={fgSrc} alt="" style={{ transform: fgShift }} />}
      <div className="island" />
    </div>
  );
}
