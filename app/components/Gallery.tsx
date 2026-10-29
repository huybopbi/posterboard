"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { categories, getCategories, isCategoryId } from "@/lib/categories";
import { resolveWallpaper } from "@/lib/assets";
import { isHiddenDuplicate } from "@/lib/duplicates";
import { formatDisplayName } from "@/lib/displayName";
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

const sorts = [
  { id: "popular",   label: "Phổ biến nhất" },
  { id: "newest",    label: "Mới cập nhật" },
  { id: "size-desc", label: "Dung lượng ↓" },
  { id: "size-asc",  label: "Dung lượng ↑" },
] as const;
type SortId = (typeof sorts)[number]["id"];
const SORT_KEY = "pb-sort";
const isSortId = (value: unknown): value is SortId =>
  sorts.some((s) => s.id === value);

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
  const [sort, setSortState] = useState<SortId>("popular");
  const [shortcut, setShortcut] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Sort: ?sort=<id> wins, then localStorage, then "popular".
  useEffect(() => {
    const read = () => {
      const fromUrl = new URLSearchParams(window.location.search).get("sort");
      let stored: string | null = null;
      try { stored = window.localStorage.getItem(SORT_KEY); } catch {}
      setSortState(isSortId(fromUrl) ? fromUrl : isSortId(stored) ? stored : "popular");
    };
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);

  const setSort = useCallback((next: SortId) => {
    setSortState(next);
    try { window.localStorage.setItem(SORT_KEY, next); } catch {}
    const url = new URL(window.location.href);
    if (next === "popular") url.searchParams.delete("sort");
    else url.searchParams.set("sort", next);
    window.history.replaceState(null, "", url);
  }, []);

  // Preview: ?preview=<id>. pushState on open so Back closes the modal;
  // popstate (and the initial load) re-read the param. Unknown ids are dropped.
  const byId = useMemo(() => new Map(ready.map((item) => [item.id, item])), [ready]);
  useEffect(() => {
    const read = (initial: boolean) => {
      const id = new URLSearchParams(window.location.search).get("preview");
      const item = id ? byId.get(id) ?? null : null;
      setActive(item);
      if (initial && id && !item) {
        const url = new URL(window.location.href);
        url.searchParams.delete("preview");
        window.history.replaceState(window.history.state, "", url);
      }
    };
    read(true);
    const onPop = () => read(false);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [byId]);

  const openPreview = useCallback((item: WallpaperItem) => {
    setActive(item);
    const url = new URL(window.location.href);
    url.searchParams.set("preview", item.id);
    window.history.pushState({ pbPreview: item.id }, "", url);
  }, []);

  const closePreview = useCallback(() => {
    const state = window.history.state as { pbPreview?: string } | null;
    if (state?.pbPreview) {
      // We pushed this entry; going back removes the param and popstate closes the modal.
      window.history.back();
      return;
    }
    setActive(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("preview");
    window.history.replaceState(null, "", url);
  }, []);

  // Title follows the open preview.
  useEffect(() => {
    if (!active) return;
    // Next's metadata hydration can rewrite <title> after a direct ?preview= load,
    // so keep re-applying ours while the modal is open.
    const want = `${formatDisplayName(active.name)} · Posterboards`;
    const base = document.title === want ? null : document.title;
    let saved = base;
    const apply = () => {
      if (document.title === want) return;
      saved = document.title;
      document.title = want;
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.head, { subtree: true, childList: true, characterData: true });
    return () => {
      observer.disconnect();
      if (saved !== null) document.title = saved;
    };
  }, [active]);

  // Quick search: Ctrl/Cmd+K anywhere, "/" when not already typing.
  useEffect(() => {
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
    setShortcut(fine ? (mac ? "⌘K" : "Ctrl K") : null);
    const onKey = (e: KeyboardEvent) => {
      const input = searchRef.current;
      if (!input) return;
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        input.focus();
        input.select();
        return;
      }
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      e.preventDefault();
      input.focus();
      input.select();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
      return (
        item.name.toLowerCase().includes(needle) ||
        formatDisplayName(item.name).toLowerCase().includes(needle)
      );
    });
  }, [ready, query, filter]);

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of matching) {
      for (const id of getCategories(item.id)) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return counts;
  }, [matching]);

  // Catalog position, used as the tie-breaker for every sort.
  const order = useMemo(() => new Map(items.map((item, i) => [item.id, i])), [items]);

  const visible = useMemo(() => {
    const filtered =
      category === "all"
        ? matching
        : matching.filter((item) => getCategories(item.id).includes(category));
    const pos = (item: WallpaperItem) => order.get(item.id) ?? 0;
    const time = (item: WallpaperItem) => (item.addedAt ? Date.parse(item.addedAt) || 0 : 0);
    const rank = (item: WallpaperItem) => item.featured ?? Number.POSITIVE_INFINITY;
    const compare: Record<SortId, (a: WallpaperItem, b: WallpaperItem) => number> = {
      // No analytics: optional curated `featured` rank first, then catalog order.
      popular: (a, b) => rank(a) - rank(b) || pos(a) - pos(b),
      newest: (a, b) => time(b) - time(a) || pos(a) - pos(b),
      "size-desc": (a, b) => b.bytes - a.bytes || pos(a) - pos(b),
      "size-asc": (a, b) => a.bytes - b.bytes || pos(a) - pos(b),
    };
    return [...filtered].sort((a, b) => {
      const d = compare[sort](a, b);
      return Number.isNaN(d) ? pos(a) - pos(b) : d;
    });
  }, [matching, category, sort, order]);

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

  return (
    <main className="page">
      <Hero totalCount={totalCount} showcase={showcase} />

      {/* Sticky toolbar */}
      <div className="toolbar">
        <div className={shortcut && !query ? "search-wrap has-kbd" : "search-wrap"}>
          <input
            ref={searchRef}
            className="search"
            type="search"
            value={query}
            placeholder="Tìm theo tên…"
            aria-label="Tìm theo tên"
            aria-keyshortcuts="Control+K Meta+K /"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Escape") return;
              e.preventDefault();
              if (query) setQuery("");
              else e.currentTarget.blur();
            }}
          />
          {shortcut && !query && (
            <kbd className="search-kbd" aria-hidden="true">{shortcut}</kbd>
          )}
        </div>
        <label className="sort">
          <span className="sr-only">Sắp xếp</span>
          <select
            className="sort-select"
            value={sort}
            aria-label="Sắp xếp"
            onChange={(e) => isSortId(e.target.value) && setSort(e.target.value)}
          >
            {sorts.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </label>
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
              onOpen={openPreview}
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
          onClose={closePreview}
        />
      )}
    </main>
  );
}
