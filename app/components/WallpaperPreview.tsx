"use client";

import { useCallback, useEffect, useState } from "react";
import type { WallpaperItem } from "@/lib/types";
import { PhoneFrame } from "./PhoneFrame";

type Props = {
  item: WallpaperItem;
  onClose: () => void;
};

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function WallpaperPreview({ item, onClose }: Props) {
  const [screen, setScreen] = useState<"locked" | "unlock">("locked");
  const [replayKey, setReplayKey] = useState(0);
  const [ready, setReady] = useState(false);

  // Lock body scroll, handle Escape
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const handleReady = useCallback(() => setReady(true), []);

  const handleScreenChange = (next: "locked" | "unlock") => {
    setScreen(next);
  };

  const handleReplay = () => {
    // Reset to locked, then after one tick switch to unlock so animation fires cleanly
    if (screen === "unlock") {
      setScreen("locked");
      window.setTimeout(() => {
        setScreen("unlock");
        setReplayKey((k) => k + 1);
      }, 60);
    } else {
      setReplayKey((k) => k + 1);
    }
  };

  const kindLabel =
    item.kind === "layered" ? "Depth wallpaper" :
    item.kind === "video"   ? "Video wallpaper" :
                              "Ảnh tĩnh";

  return (
    <div className="preview-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="preview-title">
      <div className="preview-wrap" onClick={(e) => e.stopPropagation()}>
        {/* Close */}
        <button className="close-btn" onClick={onClose} aria-label="Đóng">✕</button>

        {/* Phone */}
        <div className="preview-phone-col">
          <div style={{ position: "relative" }}>
            <PhoneFrame
              key={item.id}
              item={item}
              interactive
              mode={screen}
              replayKey={replayKey}
              onReady={handleReady}
            />
            {/* Loading spinner */}
            <div className={`phone-spinner${ready ? " hidden" : ""}`} aria-hidden="true">
              <div className="spinner" />
            </div>
          </div>
        </div>

        {/* Info panel */}
        <div className="preview-info-col">
          {/* Title */}
          <div className="preview-head">
            <h2 id="preview-title" className="preview-title">{item.name}</h2>
            <p className="preview-meta">
              {item.width}×{item.height} · {formatBytes(item.bytes)} · {kindLabel}
            </p>
          </div>

          {/* Badges */}
          <div className="preview-badges">
            {item.kind === "layered" && <span className="badge badge-depth">Depth</span>}
            {item.kind === "video"   && <span className="badge badge-video">Video</span>}
            <span className="badge">
              {item.type === "collections" ? "Collections" : item.type === "photos" ? "Photos" : "Mercury"}
            </span>
          </div>

          {/* Screen state toggle */}
          <div>
            <div className="screen-toggle" role="group" aria-label="Trạng thái màn hình">
              <button
                className="screen-btn"
                type="button"
                aria-pressed={screen === "locked"}
                onClick={() => handleScreenChange("locked")}
              >
                Khóa
              </button>
              <button
                className="screen-btn"
                type="button"
                aria-pressed={screen === "unlock"}
                onClick={() => handleScreenChange("unlock")}
              >
                Mở khóa
              </button>
            </div>
          </div>

          {/* Description */}
          <p className="preview-desc">
            {screen === "locked"
              ? "Nền nằm sau đồng hồ. Phần trong suốt của lớp nổi để lộ giờ, phần đặc che lên đồng hồ."
              : "Các lớp chuyển sang vị trí sau khi mở khóa. Dock hiện lên từ phía dưới."}
          </p>

          {/* Replay */}
          <button
            className="replay-btn"
            type="button"
            onClick={handleReplay}
            disabled={!ready}
            title="Xem lại hoạt ảnh chuyển trạng thái"
          >
            <span aria-hidden="true">↺</span>
            Xem lại chuyển động
          </button>

          {/* Download */}
          <a
            className="download-btn"
            href={item.download}
            download={item.fileName}
          >
            Tải {item.fileName}
          </a>
        </div>
      </div>
    </div>
  );
}
