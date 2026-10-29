"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { categories, getCategories, isCategoryId } from "@/lib/categories";
import { resolveWallpaper } from "@/lib/assets";
import { isHiddenDuplicate } from "@/lib/duplicates";
import type { PosterType, WallpaperItem } from "@/lib/types";
import { Hero } from "./Hero";
import { WallpaperCard } from "./WallpaperCard";
import { WallpaperPreview } from "./WallpaperPreview";

const filters: Array<{ id: "all" | PosterType; label: string }> = [
  { id: "all",         label: "Tất cả"     },
  { id: "collections", label: "Collections" },
  { id: "photos",      label: "Photos"      },
  { id: "mercury",     label: "Mercury"     },
];

const SHOWCASE_SIZE = 10;
const PHONE_RATIO = 390 / 844;

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
  const [category, setCategoryState] = useState<string>("all");

  // Sync the category with ?category=<id>. The page is statically exported, so the
  // query is read on the client after mount and written with history.replaceState.
  useEffect(() => {
    const read = () => {
      const value = new URLSearchParams(window.location.search).get("category");
      setCategoryState(isCategoryId(value) ? value : "all");
    };
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);

  const setCategory = useCallback((next: string) => {
    setCategoryState(next);
    const url = new URL(window.location.href);
    if (next === "all") url.searchParams.delete("category");
    else url.searchParams.set("category", next);
    window.history.replaceState(null, "", url);
  }, []);

  // Items matching search, type and duplicate rules, before the category filter.
  const matching = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return ready.filter((item) => {
      if (isHiddenDuplicate(item.id)) return false;
      if (filter !== "all" && item.type !== filter) return false;
      if (!needle) return true;
      return item.name.toLowerCase().includes(needle);
    });
  }, [ready, query, filter]);

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of matching) {
      for (const id of getCategories(item.id)) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return counts;
  }, [matching]);

  const visible = useMemo(
    () =>
      category === "all"
        ? matching
        : matching.filter((item) => getCategories(item.id).includes(category)),
    [matching, category],
  );

  // Catalog size after the duplicate rules, independent of search and filters.
  const totalCount = useMemo(
    () => ready.filter((item) => !isHiddenDuplicate(item.id)).length,
    [ready],
  );

  // A few phone-shaped posters, evenly spread over the catalog, for the hero strip.
  const showcase = useMemo(() => {
    const phones = ready.filter(
      (item) =>
        !isHiddenDuplicate(item.id) &&
        item.kind !== "video" &&
        Math.abs(item.width / item.height - PHONE_RATIO) < 0.02,
    );
    const step = phones.length / SHOWCASE_SIZE;
    return phones.length <= SHOWCASE_SIZE
      ? phones
      : Array.from({ length: SHOWCASE_SIZE }, (_, i) => phones[Math.floor(i * step)]);
  }, [ready]);

  const toolbarRef = useRef<HTMLDivElement>(null);
  const browse = useCallback(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    toolbarRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }, []);

  return (
    <main className="page">
      <Hero
        query={query}
        onQueryChange={setQuery}
        category={category}
        onCategoryChange={setCategory}
        categoryCounts={categoryCounts}
        totalCount={totalCount}
        visibleCount={visible.length}
        showcase={showcase}
        onBrowse={browse}
      />

      {/* Sticky toolbar */}
      <div className="toolbar" ref={toolbarRef}>
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
        <div className="categories" role="group" aria-label="Lọc theo thể loại">
          <button
            className="category"
            type="button"
            aria-pressed={category === "all"}
            onClick={() => setCategory("all")}
          >
            Tất cả <span className="category-count">{matching.length}</span>
          </button>
          {categories.map((c) => {
            const count = categoryCounts.get(c.id) ?? 0;
            return (
              <button
                key={c.id}
                className="category"
                type="button"
                aria-pressed={category === c.id}
                disabled={count === 0 && category !== c.id}
                onClick={() => setCategory(c.id)}
              >
                {c.label} <span className="category-count">{count}</span>
              </button>
            );
          })}
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
