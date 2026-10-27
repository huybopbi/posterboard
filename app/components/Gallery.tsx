"use client";

import { useMemo, useState } from "react";
import { resolveWallpaper } from "@/lib/assets";
import { isHiddenDuplicate } from "@/lib/duplicates";
import type { PosterType, WallpaperItem } from "@/lib/types";
import { WallpaperCard } from "./WallpaperCard";
import { WallpaperPreview } from "./WallpaperPreview";

const filters: Array<{ id: "all" | PosterType; label: string }> = [
  { id: "all",         label: "Tất cả"     },
  { id: "collections", label: "Collections" },
  { id: "photos",      label: "Photos"      },
  { id: "mercury",     label: "Mercury"     },
];

type Props = {
  items: WallpaperItem[];
  assetBase?: string;
};

export function Gallery({ items, assetBase = "" }: Props) {
  const ready = useMemo(
    () => items.map((item) => resolveWallpaper(assetBase, item)),
    [items, assetBase],
  );

  const [query,  setQuery]  = useState("");
  const [filter, setFilter] = useState<(typeof filters)[number]["id"]>("all");
  const [active, setActive] = useState<WallpaperItem | null>(null);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return ready.filter((item) => {
      if (isHiddenDuplicate(item.id)) return false;
      if (filter !== "all" && item.type !== filter) return false;
      if (!needle) return true;
      return item.name.toLowerCase().includes(needle);
    });
  }, [ready, query, filter]);

  return (
    <main className="page">
      {/* Header */}
      <header className="site-header">
        <h1>Tendies</h1>
        <p>Thư viện wallpaper PosterBoard cho iPhone. Xem lớp nền và lớp nổi, rồi tải file .tendies gốc.</p>
        {ready.length > 0 && (
          <span className="site-header-count">{visible.length} wallpaper</span>
        )}
      </header>

      {/* Sticky toolbar */}
      <div className="toolbar">
        <input
          className="search"
          value={query}
          placeholder="Tìm theo tên…"
          aria-label="Tìm theo tên"
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="filters">
          {filters.map((f) => (
            <button
              key={f.id}
              className="filter"
              type="button"
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {ready.length === 0 ? (
        <p className="empty">Chưa có file. Thêm .tendies vào content/tendies rồi chạy npm run publish.</p>
      ) : visible.length === 0 ? (
        <p className="empty">Không có wallpaper khớp bộ lọc.</p>
      ) : (
        <section className="grid">
          {visible.map((item, index) => (
            <WallpaperCard
              key={item.id}
              item={item}
              eager={index < 6}
              onOpen={setActive}
            />
          ))}
        </section>
      )}

      <p className="limits">
        Di chuột trên khung máy để thấy parallax. Mesh warp và ColorMatrix chỉ chạy đúng trên iPhone.
      </p>

      {/* Full-screen preview */}
      {active && (
        <WallpaperPreview
          item={active}
          onClose={() => setActive(null)}
        />
      )}
    </main>
  );
}
