"use client";

import { categories } from "@/lib/categories";
import type { WallpaperItem } from "@/lib/types";

type Props = {
  query: string;
  category: string;
  onCategoryChange: (id: string) => void;
  categoryCounts: Map<string, number>;
  totalCount: number;
  visibleCount: number;
  showcase: WallpaperItem[];
  onBrowse: () => void;
};

export function Hero({
  query,
  category,
  onCategoryChange,
  categoryCounts,
  totalCount,
  visibleCount,
  showcase,
  onBrowse,
}: Props) {
  const filtering = query.trim() !== "" || category !== "all";

  const pick = (id: string) => {
    onCategoryChange(id);
    onBrowse();
  };

  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero-copy">
        <p className="hero-brand">Tendies</p>
        <h1 id="hero-title" className="hero-title">
          Kho wallpaper PosterBoard miễn phí cho iPhone
        </h1>
        <p className="hero-sub">
          Xem trước lớp nền và lớp nổi của từng wallpaper .tendies, rồi tải file gốc về dùng trên iOS.
        </p>

        <p className="hero-status" aria-live="polite">
          {filtering ? `Đang hiển thị ${visibleCount} / ${totalCount} wallpaper` : ""}
        </p>

        <div className="hero-chips" role="group" aria-label="Chọn nhanh thể loại">
          <button
            className="hero-chip"
            type="button"
            aria-pressed={category === "all"}
            onClick={() => pick("all")}
          >
            Tất cả
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              className="hero-chip"
              type="button"
              aria-pressed={category === c.id}
              disabled={(categoryCounts.get(c.id) ?? 0) === 0 && category !== c.id}
              onClick={() => pick(c.id)}
            >
              {c.label}
            </button>
          ))}
        </div>

        <dl className="hero-stats">
          <div className="hero-stat">
            <dt>Wallpaper</dt>
            <dd>{totalCount}</dd>
          </div>
          <div className="hero-stat">
            <dt>Thể loại</dt>
            <dd>{categories.length}</dd>
          </div>
        </dl>
      </div>

      {showcase.length > 0 && (
        <div className="hero-strip" aria-hidden="true">
          <div className="hero-track">
            {[0, 1].map((copy) => (
              <ul className="hero-set" key={copy}>
                {showcase.map((item) => (
                  <li className="hero-tile" key={item.id}>
                    <img
                      src={item.poster}
                      alt=""
                      width={390}
                      height={844}
                      loading="lazy"
                      decoding="async"
                      fetchPriority="low"
                    />
                  </li>
                ))}
              </ul>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
