import catalog from "@/content/catalog.json";
import { isHiddenDuplicate } from "@/lib/duplicates";
import { SITE_DESCRIPTION, SITE_LANG, SITE_NAME, SITE_TAGLINE, SITE_URL, jsonLd } from "@/lib/site";
import { Gallery } from "./components/Gallery";
import type { WallpaperItem } from "@/lib/types";

export default function HomePage() {
  const items = catalog.items as WallpaperItem[];
  // Same rule as the Gallery's totalCount: every item except hidden duplicates.
  const numberOfItems = items.filter((item) => !isHiddenDuplicate(item.id)).length;

  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        name: SITE_NAME,
        url: `${SITE_URL}/`,
        inLanguage: SITE_LANG,
      },
      {
        "@type": "CollectionPage",
        "@id": `${SITE_URL}/#collection`,
        url: `${SITE_URL}/`,
        name: `${SITE_NAME} – ${SITE_TAGLINE}`,
        description: SITE_DESCRIPTION,
        inLanguage: SITE_LANG,
        isPartOf: { "@id": `${SITE_URL}/#website` },
        mainEntity: {
          "@type": "ItemList",
          name: "Wallpaper PosterBoard (.tendies)",
          numberOfItems,
        },
      },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(structuredData) }} />
      <Gallery assetBase={catalog.assetBase} items={items} />
    </>
  );
}
