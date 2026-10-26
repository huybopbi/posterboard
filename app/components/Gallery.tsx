"use client";

import { useEffect, useMemo, useState } from "react";
import { resolveWallpaper } from "@/lib/assets";
import type { PosterType, WallpaperItem } from "@/lib/types";
import { PhoneFrame } from "./PhoneFrame";
import { WallpaperCard } from "./WallpaperCard";

const filters: Array<{ id: "all" | PosterType; label: string }> = [
  { id: "all", label: "Tất cả" },
  { id: "collections", label: "Collections" },
  { id: "photos", label: "Photos" },
  { id: "mercury", label: "Mercury" },
];

type Props = {
  items: WallpaperItem[];
  assetBase?: string;
};

export function Gallery({ items, assetBase = "" }: Props) {
  const ready = useMemo(() => items.map((item) => resolveWallpaper(assetBase, item)), [items, assetBase]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof filters)[number]["id"]>("all");
  const [active, setActive] = useState<WallpaperItem | null>(null);
  const [screen, setScreen] = useState<"locked" | "unlock">("locked");

  useEffect(() => {
    if (!active) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setActive(null);
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [active]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return ready.filter((item) => {
      if (filter !== "all" && item.type !== filter) return false;
      if (!needle) return true;
      return item.name.toLowerCase().includes(needle);
    });
  }, [ready, query, filter]);

  return (
    <main className="page">
      <header className="header">
        <h1>Tendies</h1>
        <p>Thư viện wallpaper PosterBoard. Xem lớp nền và lớp nổi trên khung khóa màn hình, rồi tải file .tendies gốc.</p>
      </header>
      <div className="toolbar">
        <input
          className="search"
          value={query}
          placeholder="Tìm theo tên"
          aria-label="Tìm theo tên"
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="filters">
          {filters.map((item) => (
            <button
              key={item.id}
              className="filter"
              type="button"
              aria-pressed={filter === item.id}
              onClick={() => setFilter(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      {ready.length === 0 ? (
        <p className="empty">Chưa có file. Thêm .tendies vào content/tendies rồi chạy npm run publish.</p>
      ) : visible.length === 0 ? (
        <p className="empty">Không có wallpaper khớp bộ lọc.</p>
      ) : (
        <section className="grid">
          {visible.map((item) => (
            <WallpaperCard
              key={item.id}
              item={item}
              onOpen={(next) => {
                setScreen("locked");
                setActive(next);
              }}
            />
          ))}
        </section>
      )}
      <p className="limits">
        Trong khung xem trước, bấm Khóa hoặc Mở khóa để đổi vị trí các lớp. Đồng hồ chỉ hiện lúc khóa. Di chuột trên khung máy để thấy parallax. Mesh warp và ColorMatrix chỉ chạy đúng trên iPhone.
      </p>
      {active && (
        <div className="backdrop" onClick={() => setActive(null)}>
          <div
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="preview-title"
            onClick={(event) => event.stopPropagation()}
          >
            <PhoneFrame item={active} interactive mode={screen} />
            <div className="dialog-copy">
              <h2 id="preview-title">{active.name}</h2>
              <div className="filters" role="group" aria-label="Trạng thái màn hình">
                <button className="filter" type="button" aria-pressed={screen === "locked"} onClick={() => setScreen("locked")}>
                  Khóa
                </button>
                <button className="filter" type="button" aria-pressed={screen === "unlock"} onClick={() => setScreen("unlock")}>
                  Mở khóa
                </button>
              </div>
              <p>
                {active.width}×{active.height} · {active.kind === "layered" ? "có lớp depth" : active.kind === "video" ? "video" : "ảnh"}
              </p>
              <p>
                {screen === "locked"
                  ? "Nền nằm sau đồng hồ. Phần trong suốt của lớp nổi để lộ giờ, phần đặc che lên đồng hồ."
                  : "Các lớp chuyển sang vị trí sau khi mở khóa. Dock nằm sau lớp nổi."}
              </p>
              <div className="card-actions">
                <a className="download" href={active.download} download={active.fileName}>
                  Tải {active.fileName}
                </a>
                <button className="text-button" type="button" onClick={() => setActive(null)}>
                  Đóng
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
