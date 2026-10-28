export type PosterType = "collections" | "photos" | "mercury";

export type PosterKind = "image" | "video" | "layered";

export type WallpaperItem = {
  id: string;
  name: string;
  type: PosterType;
  kind: PosterKind;
  width: number;
  height: number;
  poster: string;
  bg?: string;
  fg?: string;
  unlockBg?: string;
  unlockFg?: string;
  transitionFrames?: Array<{ bg?: string; fg?: string }>;
  video?: string;
  download: string;
  fileName: string;
  bytes: number;
  sourceSha256?: string;
};

export type Catalog = {
  assetBase?: string;
  items: WallpaperItem[];
};

export type Category = {
  id: string;
  label: string;
};

export type CategoryFile = {
  categories: Category[];
  items: Record<string, string[]>;
};
