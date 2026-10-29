"use client";

import { categories } from "@/lib/categories";
import type { WallpaperItem } from "@/lib/types";

type Props = {
  totalCount: number;
  showcase: WallpaperItem[];
};

export function Hero({ totalCount, showcase }: Props) {
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
