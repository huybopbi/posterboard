"use client";

import { useEffect, useRef, useState } from "react";
import type { WallpaperItem } from "@/lib/types";

type Props = {
  item: WallpaperItem;
  eager?: boolean;
  onOpen: (item: WallpaperItem) => void;
};

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function WallpaperCard({ item, eager = false, onOpen }: Props) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  // Handle images that load from cache (onLoad may not fire)
  useEffect(() => {
    const img = imgRef.current;
    if (img?.complete) {
      if (img.naturalWidth > 0) setLoaded(true);
      else setErrored(true);
    }
  }, []);

  return (
    <article
      className="card"
      onClick={() => onOpen(item)}
      role="button"
      tabIndex={0}
      aria-label={`Xem trước ${item.name}`}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onOpen(item)}
    >
      {/* Skeleton */}
      <div className={`card-skeleton${loaded || errored ? " done" : ""}`} aria-hidden="true" />

      {/* Poster */}
      {errored ? (
        <div className="card-error" aria-hidden="true">🖼</div>
      ) : (
        <img
          ref={imgRef}
          className={`card-img${loaded ? " done" : ""}`}
          src={item.poster}
          alt=""
          loading={eager ? "eager" : "lazy"}
          fetchPriority={eager ? "high" : "low"}
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => { setLoaded(true); setErrored(true); }}
        />
      )}

      {/* Bottom overlay */}
      <div className="card-overlay">
        <div className="card-badges">
          {item.kind === "layered" && <span className="badge badge-depth">Depth</span>}
          {item.kind === "video" && <span className="badge badge-video">Video</span>}
          <span className="badge">
            {item.type === "collections" ? "Collections" : item.type === "photos" ? "Photos" : "Mercury"}
          </span>
        </div>
        <span className="card-name">{item.name}</span>
        <div className="card-footer">
          <span className="card-size">{formatBytes(item.bytes)}</span>
          <a
            className="card-dl"
            href={item.download}
            download={item.fileName}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Tải ${item.fileName}`}
            title={`Tải ${item.fileName}`}
          >
            ↓
          </a>
        </div>
      </div>

      {/* Hover CTA */}
      <div className="card-hover-cta" aria-hidden="true">
        <span className="cta-pill">Xem trước</span>
      </div>
    </article>
  );
}
