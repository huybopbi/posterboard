import type { WallpaperItem } from "./types";

export function resolveAsset(assetBase: string | undefined, value: string | undefined) {
  if (!value) return value;
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(value) || value.startsWith("/")) return value;
  const base = (assetBase ?? "").replace(/\/$/, "");
  return base ? `${base}/${value}` : `/${value}`;
}

export function resolveWallpaper(assetBase: string | undefined, item: WallpaperItem): WallpaperItem {
  const url = (value?: string) => resolveAsset(assetBase, value);
  return {
    ...item,
    poster: url(item.poster) ?? item.poster,
    bg: url(item.bg),
    fg: url(item.fg),
    unlockBg: url(item.unlockBg),
    unlockFg: url(item.unlockFg),
    video: url(item.video),
    download: url(item.download) ?? item.download,
    transitionFrames: item.transitionFrames?.map((frame) => ({
      bg: url(frame.bg),
      fg: url(frame.fg),
    })),
  };
}
