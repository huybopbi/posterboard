import catalog from "@/content/catalog.json";
import { Gallery } from "./components/Gallery";
import type { WallpaperItem } from "@/lib/types";

export default function HomePage() {
  return <Gallery items={catalog.items as WallpaperItem[]} />;
}
