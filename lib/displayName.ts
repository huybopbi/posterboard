/**
 * Turns a raw wallpaper file name (e.g. "__Wuthering_Waves_ninnai_moning")
 * into a readable label ("Wuthering Waves Ninnai Moning"). Render-time only:
 * ids, slugs, catalog data and download file names stay untouched.
 */
export function formatDisplayName(raw: string): string {
  let s = raw.normalize("NFC");
  // Underscore-encoded apostrophes: "Rubik_s_Cube" -> "Rubik's_Cube", "don_t" -> "don't".
  s = s.replace(/([A-Za-z])_([st])(?=_|$)/g, "$1'$2");
  s = s.replace(/_/g, " ");
  // A dash joining letters ("Apple-Bird", "tendies-pack2") reads as a space;
  // keep it between digits ("1-0") and when it stands alone (" - ").
  s = s.replace(/(?<=[^\s\d-])-|-(?=[^\s\d-])/g, (m, offset: number, str: string) => {
    const prev = str[offset - 1] ?? "";
    const next = str[offset + 1] ?? "";
    if (!prev.trim() || !next.trim()) return m;
    return " ";
  });
  // Dots used as word separators ("Minecraft.Black.Hole") read as spaces.
  s = s.replace(/(?<=\p{L})\.(?=\p{L})/gu, " ");
  // Strip leading/trailing underscores (now spaces), dashes and dots.
  s = s.replace(/^[\s._-]+|[\s._-]+$/g, "");
  s = s.replace(/\s+/g, " ");
  // Capitalize the first letter of each word without lowercasing the rest,
  // but leave lowercase-prefixed brand words like "iPhone"/"iOS" alone.
  s = s.replace(/(^|\s)(\p{Ll})(\p{Ll}|[^\p{L}]|$)/gu, (_m, sp: string, c: string, n: string) => sp + c.toUpperCase() + n);
  return s || raw;
}
