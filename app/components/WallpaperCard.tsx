import type { WallpaperItem } from "@/lib/types";

const typeLabel = {
  collections: "Collections",
  photos: "Photos",
  mercury: "Mercury",
} as const;

type Props = {
  item: WallpaperItem;
  onOpen: (item: WallpaperItem) => void;
};

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function WallpaperCard({ item, onOpen }: Props) {
  return (
    <article className="card">
      <button className="poster-button" type="button" aria-label={item.name} onClick={() => onOpen(item)}>
        <img src={item.poster} alt={item.name} />
      </button>
      <h2>{item.name}</h2>
      <p className="meta">
        <span>{typeLabel[item.type]}</span>
        <span>{formatBytes(item.bytes)}</span>
      </p>
      <div className="card-actions">
        <button className="text-button" type="button" onClick={() => onOpen(item)}>
          Xem
        </button>
        <a className="download" href={item.download} download={item.fileName}>
          Tải về
        </a>
      </div>
    </article>
  );
}
