// Regenerates public/og.png, app/icon.png, app/apple-icon.png and app/favicon.ico.
// Usage: node scripts/make-og.mjs   (needs network for the poster thumbnails and the Inter font installed)
import { mkdir, readFile, writeFile } from "fs/promises";
import sharp from "sharp";

const catalog = JSON.parse(await readFile("content/catalog.json", "utf8"));
const hidden = JSON.parse(await readFile("content/duplicates.json", "utf8"));
const FONT = "Inter, 'Noto Sans', 'DejaVu Sans', sans-serif";
const GOLD = ["#f1d98f", "#c9a24e", "#9a7424"];

// ── Open Graph image ──────────────────────────────────────────
const W = 1200, H = 630;
const phones = catalog.items.filter(
  (i) => !hidden[i.id] && i.kind !== "video" && Math.abs(i.width / i.height - 390 / 844) < 0.02,
);
const COUNT = 5;
const picks = Array.from({ length: COUNT }, (_, i) => phones[Math.floor(((i + 0.5) * phones.length) / COUNT)]);

const TW = 196, TH = Math.round((TW * 844) / 390), GAP = 22, R = 28;
const stripW = COUNT * TW + (COUNT - 1) * GAP;
const x0 = Math.round((W - stripW) / 2), y0 = 352;

const mask = Buffer.from(`<svg width="${TW}" height="${TH}"><rect width="${TW}" height="${TH}" rx="${R}" fill="#fff"/></svg>`);
const border = Buffer.from(
  `<svg width="${TW}" height="${TH}"><rect x="1" y="1" width="${TW - 2}" height="${TH - 2}" rx="${R - 1}" fill="none" stroke="rgba(255,255,255,0.22)" stroke-width="2"/></svg>`,
);
const base = catalog.assetBase.replace(/\/$/, "");
const tiles = [];
for (const [i, item] of picks.entries()) {
  const res = await fetch(`${base}/${item.poster.split("/").map(encodeURIComponent).join("/")}`, {
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  if (!res.ok) throw new Error(`${res.status} ${item.poster}`);
  const img = await sharp(Buffer.from(await res.arrayBuffer()))
    .resize(TW, TH, { fit: "cover" })
    .composite([{ input: mask, blend: "dest-in" }, { input: border }])
    .png()
    .toBuffer();
  tiles.push({ input: img, left: x0 + i * (TW + GAP), top: y0 + (i % 2 ? 18 : 0) });
}

const bg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <radialGradient id="g1" cx="6%" cy="0%" r="70%"><stop offset="0" stop-color="#c9a24e" stop-opacity="0.34"/><stop offset="1" stop-color="#c9a24e" stop-opacity="0"/></radialGradient>
    <radialGradient id="g2" cx="100%" cy="100%" r="65%"><stop offset="0" stop-color="#5e78ff" stop-opacity="0.30"/><stop offset="1" stop-color="#5e78ff" stop-opacity="0"/></radialGradient>
    <radialGradient id="g3" cx="72%" cy="0%" r="50%"><stop offset="0" stop-color="#b060dc" stop-opacity="0.24"/><stop offset="1" stop-color="#b060dc" stop-opacity="0"/></radialGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${GOLD[0]}"/><stop offset="1" stop-color="${GOLD[1]}"/></linearGradient>
    <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0.72" stop-color="#0a0a0a" stop-opacity="0"/><stop offset="1" stop-color="#0a0a0a" stop-opacity="0.85"/></linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="#0a0a0a"/>
  <rect width="${W}" height="${H}" fill="url(#g1)"/><rect width="${W}" height="${H}" fill="url(#g2)"/><rect width="${W}" height="${H}" fill="url(#g3)"/>
</svg>`);
const text = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs><linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${GOLD[0]}"/><stop offset="1" stop-color="${GOLD[1]}"/></linearGradient>
  <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0.7" stop-color="#0a0a0a" stop-opacity="0"/><stop offset="1" stop-color="#0a0a0a" stop-opacity="0.9"/></linearGradient></defs>
  <rect width="${W}" height="${H}" fill="url(#fade)"/>
  <text x="${x0}" y="150" font-family="${FONT}" font-size="92" font-weight="800" fill="url(#gold)" letter-spacing="-2">Posterboards</text>
  <text x="${x0 + 2}" y="214" font-family="${FONT}" font-size="35" font-weight="500" fill="#f2f2f7">Kho wallpaper PosterBoard .tendies miễn phí cho iPhone</text>
  <text x="${x0 + 2}" y="262" font-family="${FONT}" font-size="25" font-weight="400" fill="#aeaeb2">Xem trước mô phỏng trên web • Tải file gốc về dùng</text>
</svg>`);
await mkdir("public", { recursive: true });
await sharp(bg)
  .composite([...tiles, { input: text }])
  .png({ palette: true, quality: 90, effort: 10, colours: 256 })
  .toFile("public/og.png");

// ── Icons: gold "P" on a dark square ──────────────────────────
function mark(size, rounded) {
  const rx = rounded ? Math.round(size * 0.22) : 0;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
  <defs>
    <radialGradient id="a" cx="10%" cy="0%" r="80%"><stop offset="0" stop-color="#c9a24e" stop-opacity="0.35"/><stop offset="1" stop-color="#c9a24e" stop-opacity="0"/></radialGradient>
    <radialGradient id="b" cx="100%" cy="100%" r="70%"><stop offset="0" stop-color="#5e78ff" stop-opacity="0.35"/><stop offset="1" stop-color="#5e78ff" stop-opacity="0"/></radialGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${GOLD[0]}"/><stop offset="1" stop-color="${GOLD[2]}"/></linearGradient>
  </defs>
  <rect width="100" height="100" rx="${(rx * 100) / size}" fill="#0a0a0a"/>
  <rect width="100" height="100" rx="${(rx * 100) / size}" fill="url(#a)"/><rect width="100" height="100" rx="${(rx * 100) / size}" fill="url(#b)"/>
  <text x="50" y="74" text-anchor="middle" font-family="${FONT}" font-size="74" font-weight="800" fill="url(#gold)">P</text>
</svg>`);
}
const png = (size, rounded) => sharp(mark(size * 2, rounded)).resize(size, size).png({ palette: true, effort: 10 }).toBuffer();
await writeFile("app/icon.png", await png(512, true));
await writeFile("app/apple-icon.png", await png(180, false)); // iOS rounds the corners itself
// favicon.ico with 32px and 48px PNG entries
const ico = [await png(32, true), await png(48, true)];
const head = Buffer.alloc(6 + 16 * ico.length);
head.writeUInt16LE(1, 2);
head.writeUInt16LE(ico.length, 4);
let offset = head.length;
ico.forEach((data, i) => {
  const size = i === 0 ? 32 : 48;
  head.writeUInt8(size, 6 + i * 16);
  head.writeUInt8(size, 7 + i * 16);
  head.writeUInt16LE(1, 10 + i * 16);
  head.writeUInt16LE(32, 12 + i * 16);
  head.writeUInt32LE(data.length, 14 + i * 16);
  head.writeUInt32LE(offset, 18 + i * 16);
  offset += data.length;
});
await writeFile("app/favicon.ico", Buffer.concat([head, ...ico]));
console.log("wrote public/og.png, app/icon.png, app/apple-icon.png, app/favicon.ico");
