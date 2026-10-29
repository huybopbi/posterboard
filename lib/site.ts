// Single source of truth for SEO. To move to a custom domain, set
// NEXT_PUBLIC_SITE_URL at build time (Vercel project env) or change DEFAULT_SITE_URL.
const DEFAULT_SITE_URL = "https://posterboards.vercel.app";

function resolveSiteUrl() {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim() || DEFAULT_SITE_URL;
  try {
    return new URL(raw).origin;
  } catch {
    return DEFAULT_SITE_URL;
  }
}

export const SITE_URL = resolveSiteUrl();
export const SITE_NAME = "Posterboards";
export const SITE_TAGLINE = "Kho wallpaper PosterBoard .tendies miễn phí cho iPhone";
export const SITE_TITLE = `${SITE_NAME} – ${SITE_TAGLINE}`;
export const SITE_DESCRIPTION =
  "Kho wallpaper PosterBoard (.tendies) miễn phí cho iOS. Xem trước mô phỏng ngay trên web, hiệu ứng thực tế trên iPhone có thể khác. Tải file gốc về dùng.";
export const SITE_LOCALE = "vi_VN";
export const SITE_LANG = "vi";
export const THEME_COLOR = "#0a0a0a";
export const OG_IMAGE = { url: "/og.png", width: 1200, height: 630, alt: `${SITE_NAME} – ${SITE_TAGLINE}` } as const;

// Safe to embed inside <script type="application/ld+json">.
export function jsonLd(data: unknown) {
  return JSON.stringify(data).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}
