import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DeleteObjectsCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import AdmZip from "adm-zip";
import { XMLParser } from "fast-xml-parser";
import sharp from "sharp";
import {
  contentDisposition,
  diskForPreviewKey,
  itemObjectKeys,
  prefixesForKeys,
  relocateItem,
} from "./r2-paths.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = path.join(root, "content", "tendies");
const previewRoot = path.join(root, "public", "previews");
const downloadRoot = path.join(root, "public", "tendies");
const catalogPath = path.join(root, "content", "catalog.json");

const IMAGE_EXT = new Set([".heic", ".heif", ".png", ".jpg", ".jpeg", ".webp"]);
const VIDEO_EXT = new Set([".mov", ".mp4", ".m4v"]);
const RENDER_SCALE = 2;

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  isArray: (tagName) =>
    tagName === "CALayer" || tagName === "LKState" || tagName === "LKStateSetValue",
});

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function attr(node, name) {
  if (!node || typeof node !== "object") return undefined;
  return node[`@_${name}`];
}

function asArray(value) {
  if (value == null || value === "") return [];
  return Array.isArray(value) ? value : [value];
}

function num(value, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function parsePair(value, fallbackA, fallbackB) {
  if (typeof value !== "string") return [fallbackA, fallbackB];
  const parts = value.trim().split(/\s+/).map(Number);
  return [
    Number.isFinite(parts[0]) ? parts[0] : fallbackA,
    Number.isFinite(parts[1]) ? parts[1] : fallbackB,
  ];
}

function parseBounds(value) {
  if (typeof value !== "string") return { x: 0, y: 0, w: 0, h: 0 };
  const parts = value.trim().split(/\s+/).map(Number);
  return {
    x: Number.isFinite(parts[0]) ? parts[0] : 0,
    y: Number.isFinite(parts[1]) ? parts[1] : 0,
    w: Number.isFinite(parts[2]) ? parts[2] : 0,
    h: Number.isFinite(parts[3]) ? parts[3] : 0,
  };
}

function slugFromName(fileName) {
  const stem = fileName.replace(/\.tendies$/i, "");
  const ascii = stem
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (ascii) return ascii;
  return createHash("sha1").update(stem).digest("hex").slice(0, 8);
}

function uniqueId(base, used) {
  let id = base;
  let n = 2;
  while (used.has(id)) id = `${base}-${n++}`;
  used.add(id);
  return id;
}

function takeId(preferredIds, usedIds, fileName) {
  while (preferredIds.length) {
    const id = preferredIds.shift();
    if (!usedIds.has(id)) {
      usedIds.add(id);
      return id;
    }
  }
  return uniqueId(slugFromName(fileName), usedIds);
}

function posterType(entryNames) {
  const blob = entryNames
    .map((name) => name.split("/").find((part) => part && part !== "__MACOSX") ?? "")
    .join(" ")
    .toLowerCase();
  if (blob.includes("mercury")) return "mercury";
  if (blob.includes("video") || blob.includes("photos")) return "photos";
  return "collections";
}

function roleFromCaPath(caPath) {
  const base = path.posix.basename(caPath).toLowerCase();
  if (base.includes("floating")) return "floating";
  if (base.includes("foreground")) return "foreground";
  if (base.includes("background")) return "background";
  return null;
}

function screenSize(wallpaperKey) {
  const match = wallpaperKey.match(/(\d+)w-(\d+)h/i);
  if (!match) return { width: 390, height: 844 };
  return { width: Number(match[1]), height: Number(match[2]) };
}

function hasFfmpeg() {
  return spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0;
}

function stateNumber(setValue) {
  const valueNode = setValue?.value;
  if (valueNode && typeof valueNode === "object") return num(attr(valueNode, "value"), NaN);
  return NaN;
}

function collectStateOverrides(layer, stateName, into) {
  for (const state of asArray(layer.states?.LKState)) {
    if (attr(state, "name") !== stateName) continue;
    for (const setValue of asArray(state.elements?.LKStateSetValue)) {
      const targetId = attr(setValue, "targetId");
      const keyPath = attr(setValue, "keyPath");
      const value = stateNumber(setValue);
      if (!targetId || !keyPath || !Number.isFinite(value)) continue;
      const current = into.get(targetId) ?? {};
      current[keyPath] = value;
      into.set(targetId, current);
    }
  }
  for (const child of childLayers(layer)) collectStateOverrides(child, stateName, into);
}

function decodeSrc(src) {
  if (typeof src !== "string" || src === "") return null;
  try {
    return decodeURIComponent(src);
  } catch {
    return src;
  }
}

function imageFromContents(contents) {
  if (!contents || typeof contents !== "object") return null;
  const image = contents.CGImage ?? contents.image ?? contents;
  return decodeSrc(attr(image, "src"));
}

function imageSrc(layer) {
  const own = imageFromContents(layer?.contents);
  if (own) return own;
  for (const cell of asArray(layer?.emitterCells?.CAEmitterCell)) {
    const src = imageFromContents(cell?.contents);
    if (src) return src;
  }
  return null;
}

function childLayers(layer) {
  const sublayers = layer?.sublayers;
  if (!sublayers || typeof sublayers !== "object") return [];
  const children = [];
  for (const [key, value] of Object.entries(sublayers)) {
    if (key.startsWith("@_")) continue;
    for (const child of asArray(value)) {
      if (child && typeof child === "object") children.push(child);
    }
  }
  children.sort((a, b) => num(attr(a, "zPosition")) - num(attr(b, "zPosition")));
  return children;
}

function placedBox(layer, parentOrigin, overrides, canvasHeight, transition) {
  const over = overrides.get(attr(layer, "id")) ?? {};
  const from = transition?.from.get(attr(layer, "id")) ?? {};
  const to = transition?.to.get(attr(layer, "id")) ?? {};
  const bounds = parseBounds(attr(layer, "bounds"));
  const [px0, py0] = parsePair(attr(layer, "position"), 0, 0);
  const [ax, ay] = parsePair(attr(layer, "anchorPoint"), 0.5, 0.5);
  const value = (key, fallback) => {
    if (!transition) return over[key] ?? fallback;
    const start = from[key] ?? fallback;
    const end = to[key] ?? fallback;
    return start + (end - start) * transition.progress;
  };
  const w = value("bounds.size.width", bounds.w);
  const h = value("bounds.size.height", bounds.h);
  const ox = value("bounds.origin.x", bounds.x);
  const oy = value("bounds.origin.y", bounds.y);
  const px = value("position.x", px0);
  const py = value("position.y", py0);
  const parentW = parentOrigin.w ?? 0;
  const parentH = parentOrigin.h ?? 0;
  const parentOx = parentOrigin.ox ?? 0;
  const parentOy = parentOrigin.oy ?? 0;
  const hasParent = parentW > 1 && parentH > 1;
  const inside =
    !hasParent ||
    (px >= parentOx - parentW * 0.25 &&
      px <= parentOx + parentW * 1.25 &&
      py >= parentOy - parentH * 0.25 &&
      py <= parentOy + parentH * 1.25);
  const localX = inside ? px - parentOx : px;
  const localY = inside ? py - parentOy : py;
  const anchorX = (inside ? parentOrigin.x : 0) + localX;
  const anchorY =
    inside && parentOrigin.flipped ? parentOrigin.y + parentOrigin.h - localY : (inside ? parentOrigin.y : 0) + localY;
  return {
    w,
    h,
    ax,
    ay,
    cssX: anchorX,
    cssY: canvasHeight - anchorY,
    rot: value("transform.rotation.z", num(attr(layer, "transform.rotation.z"), 0)),
    opacity: value("opacity", num(attr(layer, "opacity"), 1)),
    hidden: value("hidden", num(attr(layer, "hidden"), 0)),
    childOrigin: {
      x: anchorX - ax * w,
      y: anchorY - ay * h,
      w,
      h,
      ox,
      oy,
      flipped: String(attr(layer, "geometryFlipped")) === "1",
    },
  };
}

function colorFrom(value) {
  if (typeof value !== "string") return null;
  const parts = value.trim().split(/\s+/).map(Number);
  if (parts.length < 3 || parts.some((part) => !Number.isFinite(part))) return null;
  const channel = (n) => Math.max(0, Math.min(255, Math.round(n <= 1 ? n * 255 : n)));
  return {
    r: channel(parts[0]),
    g: channel(parts[1]),
    b: channel(parts[2]),
    alpha: parts[3] == null ? 1 : Math.max(0, Math.min(1, parts[3])),
  };
}

function intersects(box, canvasW, canvasH, scale) {
  const radius = Math.hypot(box.w, box.h) * scale;
  const cx = box.cssX * scale;
  const cy = box.cssY * scale;
  return cx + radius > 0 && cy + radius > 0 && cx - radius < canvasW && cy - radius < canvasH;
}

async function applyOpacity(image, opacity) {
  if (opacity >= 0.999) return image.png().toBuffer();
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  for (let i = 3; i < data.length; i += 4) data[i] = Math.round(data[i] * opacity);
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
}

async function rasterLayer(buf, box, scale) {
  const width = Math.max(1, Math.round(box.w * scale));
  const height = Math.max(1, Math.round(box.h * scale));
  const resized = sharp(buf, { failOn: "none", limitInputPixels: false })
    .rotate()
    .resize(width, height, { fit: "fill" })
    .ensureAlpha();
  let png = await applyOpacity(resized, box.opacity);
  const anchorX = box.ax * width;
  const anchorY = (1 - box.ay) * height;
  const degrees = (-box.rot * 180) / Math.PI;

  if (Math.abs(degrees) < 0.05) {
    return {
      png,
      left: Math.round(box.cssX * scale - anchorX),
      top: Math.round(box.cssY * scale - anchorY),
    };
  }

  const side = Math.ceil(Math.hypot(width, height) * 2) + 4;
  const padded = await sharp({
    create: {
      width: side,
      height: side,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: png, left: Math.round(side / 2 - anchorX), top: Math.round(side / 2 - anchorY) }])
    .png()
    .toBuffer();
  png = await sharp(padded).rotate(degrees, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  const meta = await sharp(png).metadata();
  return {
    png,
    left: Math.round(box.cssX * scale - (meta.width ?? 0) / 2),
    top: Math.round(box.cssY * scale - (meta.height ?? 0) / 2),
  };
}

async function clipToCanvas(png, left, top, canvasW, canvasH) {
  const meta = await sharp(png).metadata();
  const srcW = meta.width ?? 0;
  const srcH = meta.height ?? 0;
  let srcLeft = 0;
  let srcTop = 0;
  let width = srcW;
  let height = srcH;
  let outLeft = left;
  let outTop = top;
  if (outLeft < 0) {
    srcLeft = -outLeft;
    width -= srcLeft;
    outLeft = 0;
  }
  if (outTop < 0) {
    srcTop = -outTop;
    height -= srcTop;
    outTop = 0;
  }
  if (outLeft + width > canvasW) width = canvasW - outLeft;
  if (outTop + height > canvasH) height = canvasH - outTop;
  width = Math.floor(width);
  height = Math.floor(height);
  if (width < 1 || height < 1) return null;
  const input =
    srcLeft === 0 && srcTop === 0 && width === srcW && height === srcH
      ? png
      : await sharp(png)
          .extract({ left: Math.floor(srcLeft), top: Math.floor(srcTop), width, height })
          .png()
          .toBuffer();
  return { input, left: outLeft, top: outTop };
}

function lookupEntry(entries, caPrefix, src) {
  const wanted = `${caPrefix}/${src}`.replace(/\/+/g, "/");
  const exact =
    entries.find((entry) => entry.name === wanted) ??
    entries.find((entry) => entry.name.toLowerCase() === wanted.toLowerCase());
  if (exact) return exact;
  const base = path.posix.basename(wanted);
  return (
    entries.find((entry) => entry.name.startsWith(`${caPrefix}/`) && path.posix.basename(entry.name) === base) ??
    null
  );
}

function bundleRoot(entries, caPrefix) {
  const caml = entries.find((entry) => entry.name === `${caPrefix}/main.caml`);
  if (!caml) return null;
  try {
    const parsed = xmlParser.parse(caml.getData().toString("utf8"));
    return asArray(parsed?.caml?.CALayer)[0] ?? null;
  } catch {
    return null;
  }
}

function canvasFor(root, keySize) {
  const bounds = root ? parseBounds(attr(root, "bounds")) : { w: 0, h: 0 };
  const similar =
    bounds.w > 1 &&
    bounds.h > 1 &&
    Math.abs(bounds.w - keySize.width) / keySize.width < 0.2 &&
    Math.abs(bounds.h - keySize.height) / keySize.height < 0.2;
  if (!root || bounds.w < 2 || bounds.h < 2 || similar) {
    return { width: keySize.width, height: keySize.height, scale: RENDER_SCALE };
  }
  const scale = Math.min(RENDER_SCALE, 1600 / Math.max(bounds.w, bounds.h));
  return { width: bounds.w, height: bounds.h, scale: Math.max(0.2, scale) };
}

function assignRoles(caPrefixes) {
  const byRole = { background: null, floating: null, foreground: null };
  const leftover = [];
  for (const prefix of caPrefixes) {
    const role = roleFromCaPath(prefix);
    if (role && !byRole[role]) byRole[role] = prefix;
    else leftover.push(prefix);
  }
  for (const prefix of leftover) {
    if (!byRole.background) byRole.background = prefix;
    else if (!byRole.floating) byRole.floating = prefix;
    else if (!byRole.foreground) byRole.foreground = prefix;
  }
  return byRole;
}

function layerColor(layer) {
  const direct = colorFrom(attr(layer, "backgroundColor"));
  if (direct) return direct;
  const node = layer?.backgroundColor;
  if (!node || typeof node !== "object") return null;
  const color = colorFrom(attr(node, "value"));
  if (!color) return null;
  return { ...color, alpha: color.alpha * num(attr(node, "opacity"), 1) };
}

async function drawLayers(layer, parentOrigin, overrides, transition, canvas, entries, caPrefix, overlays, stats) {
  if (!layer || typeof layer !== "object") return 0;
  if (String(attr(layer, "hidden")) === "1") return 0;
  const canvasW = Math.round(canvas.width * canvas.scale);
  const canvasH = Math.round(canvas.height * canvas.scale);
  const box = placedBox(layer, parentOrigin, overrides, canvas.height, transition);
  const visible = box.hidden < 0.5 && box.w >= 1 && box.h >= 1 && box.opacity > 0 && intersects(box, canvasW, canvasH, canvas.scale);
  const fill = layerColor(layer);
  if (visible && fill && fill.alpha > 0.01) {
    const pw = Math.max(1, Math.round(box.w * canvas.scale));
    const ph = Math.max(1, Math.round(box.h * canvas.scale));
    const radius = Math.max(0, num(attr(layer, "cornerRadius"), 0) * canvas.scale);
    const svg = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${pw}" height="${ph}"><rect width="${pw}" height="${ph}" rx="${radius}" ry="${radius}" fill="rgb(${fill.r},${fill.g},${fill.b})" fill-opacity="${Math.max(0, Math.min(1, fill.alpha * box.opacity))}"/></svg>`,
    );
    const png = await sharp(svg).png().toBuffer();
    const left = Math.round(box.cssX * canvas.scale - box.ax * pw);
    const top = Math.round(box.cssY * canvas.scale - (1 - box.ay) * ph);
    const clipped = await clipToCanvas(png, left, top, canvasW, canvasH);
    if (clipped) {
      overlays.push(clipped);
      stats.shapes += 1;
    }
  }
  const src = imageSrc(layer);
  if (src && visible) {
    const asset = lookupEntry(entries, caPrefix, src);
    if (!asset) console.warn(`  missing asset ${src}`);
    else {
      try {
        const placed = await rasterLayer(asset.getData(), box, canvas.scale);
        const clipped = await clipToCanvas(placed.png, placed.left, placed.top, canvasW, canvasH);
        if (clipped) {
          overlays.push(clipped);
          stats.images += 1;
        }
      } catch (error) {
        console.warn(`  skip ${src}: ${error instanceof Error ? error.message : error}`);
      }
    }
  }
  for (const child of childLayers(layer)) {
    await drawLayers(child, box.childOrigin, overrides, transition, canvas, entries, caPrefix, overlays, stats);
  }
}

async function renderBundle(entries, caPrefix, keySize, transparent, state) {
  const caml = entries.find((entry) => entry.name === `${caPrefix}/main.caml`);
  const root = caml ? asArray(xmlParser.parse(caml.getData().toString("utf8"))?.caml?.CALayer)[0] : null;
  const canvas = canvasFor(root, keySize);
  const canvasW = Math.max(1, Math.round(canvas.width * canvas.scale));
  const canvasH = Math.max(1, Math.round(canvas.height * canvas.scale));
  let background = { r: 0, g: 0, b: 0, alpha: transparent ? 0 : 1 };
  const overlays = [];
  const stats = { images: 0, shapes: 0 };

  if (root) {
    if (!transparent) background = layerColor(root) ?? background;
    const overrides = new Map();
    let transition = null;
    if (typeof state === "string") {
      collectStateOverrides(root, state, overrides);
    } else {
      const from = new Map();
      const to = new Map();
      collectStateOverrides(root, state.from, from);
      collectStateOverrides(root, state.to, to);
      transition = { from, to, progress: state.progress };
    }
    await drawLayers(
      root,
      { x: 0, y: 0, h: canvas.height, flipped: false },
      overrides,
      transition,
      canvas,
      entries,
      caPrefix,
      overlays,
      stats,
    );
  }

  let drawn = stats.images + stats.shapes;

  if (!caml && drawn === 0) {
    const images = entries
      .filter((entry) => entry.name.startsWith(`${caPrefix}/`) && IMAGE_EXT.has(path.posix.extname(entry.name).toLowerCase()))
      .sort((a, b) => b.header.size - a.header.size);
    if (images[0]) {
      const png = await sharp(images[0].getData(), { failOn: "none", limitInputPixels: false })
        .rotate()
        .resize(canvasW, canvasH, { fit: "cover" })
        .ensureAlpha()
        .png()
        .toBuffer();
      overlays.push({ input: png, left: 0, top: 0 });
      stats.images += 1;
      drawn += 1;
    }
  }

  if (transparent && drawn === 0) return null;

  let pipeline = sharp({
    create: { width: canvasW, height: canvasH, channels: 4, background },
  });
  if (overlays.length) pipeline = pipeline.composite(overlays);
  return {
    webp: await pipeline.webp({ quality: 82, alphaQuality: 90 }).toBuffer(),
    drawn,
    images: stats.images,
    width: canvasW,
    height: canvasH,
    points: canvas,
  };
}

async function fitLayer(layer, width, height) {
  if (!layer?.webp) return null;
  if (layer.width === width && layer.height === height) return layer.webp;
  return sharp(layer.webp).resize(width, height, { fit: "fill" }).webp({ quality: 82, alphaQuality: 90 }).toBuffer();
}

async function writeVideo(videoEntry, destDir, ffmpeg) {
  const ext = path.posix.extname(videoEntry.name).toLowerCase();
  const rawPath = path.join(destDir, `source${ext}`);
  fs.writeFileSync(rawPath, videoEntry.getData());
  if (!ffmpeg) return { videoPublic: false, posterPath: null };
  const mp4Path = path.join(destDir, "video.mp4");
  const posterPath = path.join(destDir, "video-poster.jpg");
  const transcode = spawnSync(
    "ffmpeg",
    ["-y", "-i", rawPath, "-t", "8", "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", mp4Path],
    { stdio: "ignore" },
  );
  spawnSync("ffmpeg", ["-y", "-i", rawPath, "-frames:v", "1", posterPath], { stdio: "ignore" });
  return {
    videoPublic: transcode.status === 0 && fs.existsSync(mp4Path),
    posterPath: fs.existsSync(posterPath) ? posterPath : null,
  };
}

async function renderStack(entries, byRole, keySize, state) {
  let background = byRole.background ? await renderBundle(entries, byRole.background, keySize, false, state) : null;
  const floating = byRole.floating ? await renderBundle(entries, byRole.floating, keySize, true, state) : null;
  const foreground = byRole.foreground ? await renderBundle(entries, byRole.foreground, keySize, true, state) : null;
  const imageLayer = [background, floating, foreground].find((layer) => layer?.images > 0);
  if (background && !background.images && imageLayer) background = null;
  const base = imageLayer ?? background ?? floating ?? foreground;
  const width = base?.width ?? Math.round(keySize.width * RENDER_SCALE);
  const height = base?.height ?? Math.round(keySize.height * RENDER_SCALE);
  const floatingWebp = await fitLayer(floating, width, height);
  const foregroundWebp = await fitLayer(foreground, width, height);
  let fgBuffer = null;
  if (floatingWebp && foregroundWebp) {
    fgBuffer = await sharp(floatingWebp)
      .composite([{ input: foregroundWebp, left: 0, top: 0 }])
      .webp({ quality: 82, alphaQuality: 90 })
      .toBuffer();
  } else {
    fgBuffer = floatingWebp ?? foregroundWebp ?? null;
  }
  const bgWebp = background ? await fitLayer(background, width, height) : null;
  return {
    background: bgWebp ? { ...background, webp: bgWebp, width, height } : null,
    floating,
    foreground,
    fgBuffer,
    points: base?.points ?? { width: keySize.width, height: keySize.height, scale: RENDER_SCALE },
  };
}

async function buildOne(filePath, usedIds, ffmpeg, outputRoot, preferredIds) {
  const fileName = path.basename(filePath);
  const zip = new AdmZip(filePath);
  const entries = zip
    .getEntries()
    .filter((entry) => !entry.isDirectory)
    .map((entry) => ({
      name: entry.entryName.replace(/\\/g, "/"),
      header: entry.header,
      getData: () => entry.getData(),
    }))
    .filter((entry) => !entry.name.startsWith("__MACOSX/") && !path.posix.basename(entry.name).startsWith("."));

  const wallpaperKeys = [
    ...new Set(
      entries
        .map((entry) => {
          const index = entry.name.toLowerCase().indexOf(".wallpaper/");
          return index === -1 ? null : entry.name.slice(0, index + ".wallpaper".length);
        })
        .filter(Boolean),
    ),
  ];
  const iphoneKeys = wallpaperKeys.filter((key) => key.toLowerCase().includes("iphone"));
  const keys = iphoneKeys.length ? iphoneKeys : wallpaperKeys;
  if (!keys.length) {
    console.warn(`no wallpaper bundle in ${fileName}`);
    return [];
  }

  const type = posterType(entries.map((entry) => entry.name));
  const bytes = fs.statSync(filePath).size;
  const items = [];

  for (const key of keys) {
    const id = takeId(preferredIds, usedIds, fileName);
    const { width, height } = screenSize(key);
    const destDir = path.join(outputRoot, id);
    ensureDir(destDir);
    const caPrefixes = [
      ...new Set(
        entries
          .filter((entry) => entry.name.startsWith(`${key}/`))
          .map((entry) => entry.name.match(/^(.*\.ca)\//i)?.[1] ?? null)
          .filter(Boolean),
      ),
    ];
    const byRole = assignRoles(caPrefixes);
    const keySize = { width, height };

    const locked = await renderStack(entries, byRole, keySize, "Locked");
    const unlocked = await renderStack(entries, byRole, keySize, "Unlock");
    const { background, fgBuffer, points } = locked;

    const videos = entries
      .filter((entry) => entry.name.startsWith(`${key}/`) && VIDEO_EXT.has(path.posix.extname(entry.name).toLowerCase()))
      .sort((a, b) => b.header.size - a.header.size);
    let videoName = null;
    let videoPoster = null;
    if (videos[0]) {
      const video = await writeVideo(videos[0], destDir, ffmpeg);
      if (video.videoPublic) videoName = "video.mp4";
      videoPoster = video.posterPath;
    }

    const bgPath = path.join(destDir, "bg.webp");
    const fgPath = path.join(destDir, "fg.webp");
    const unlockBgPath = path.join(destDir, "bg-unlock.webp");
    const unlockFgPath = path.join(destDir, "fg-unlock.webp");
    const posterPath = path.join(destDir, "poster.jpg");
    if (background?.webp) fs.writeFileSync(bgPath, background.webp);
    else if (!fgBuffer && !videoPoster) {
      fs.writeFileSync(
        bgPath,
        await sharp({
          create: {
            width: Math.max(1, Math.round(points.width * points.scale)),
            height: Math.max(1, Math.round(points.height * points.scale)),
            channels: 3,
            background: { r: 28, g: 28, b: 30 },
          },
        })
          .webp()
          .toBuffer(),
      );
    }
    if (fgBuffer) fs.writeFileSync(fgPath, fgBuffer);
    if (unlocked.background?.webp) fs.writeFileSync(unlockBgPath, unlocked.background.webp);
    if (unlocked.fgBuffer) fs.writeFileSync(unlockFgPath, unlocked.fgBuffer);

    const transitionFrames = [];
    for (let frame = 1; frame <= 10; frame += 1) {
      const rendered = await renderStack(
        entries,
        byRole,
        { width, height },
        { from: "Locked", to: "Unlock", progress: frame / 11 },
      );
      const suffix = String(frame).padStart(2, "0");
      const frameBgPath = path.join(destDir, `transition-bg-${suffix}.webp`);
      const frameFgPath = path.join(destDir, `transition-fg-${suffix}.webp`);
      if (rendered.background?.webp) fs.writeFileSync(frameBgPath, rendered.background.webp);
      if (rendered.fgBuffer) fs.writeFileSync(frameFgPath, rendered.fgBuffer);
      transitionFrames.push({
        ...(fs.existsSync(frameBgPath) ? { bg: `/previews/${id}/transition-bg-${suffix}.webp` } : {}),
        ...(fs.existsSync(frameFgPath) ? { fg: `/previews/${id}/transition-fg-${suffix}.webp` } : {}),
      });
    }

    if (fs.existsSync(bgPath)) {
      let poster = sharp(bgPath);
      if (fs.existsSync(fgPath)) poster = poster.composite([{ input: fgPath, left: 0, top: 0 }]);
      await poster.jpeg({ quality: 82 }).toFile(posterPath);
    } else if (fs.existsSync(fgPath)) {
      await sharp(fgPath).flatten({ background: "#000" }).jpeg({ quality: 82 }).toFile(posterPath);
    } else if (videoPoster) {
      fs.copyFileSync(videoPoster, posterPath);
    }

    const stem = path.basename(fileName, path.extname(fileName));
    items.push({
      id,
      name: stem,
      type,
      kind: videoName ? "video" : fgBuffer ? "layered" : "image",
      width: Math.round(points.width),
      height: Math.round(points.height),
      poster: `/previews/${id}/poster.jpg`,
      ...(fs.existsSync(bgPath) ? { bg: `/previews/${id}/bg.webp` } : {}),
      ...(fs.existsSync(fgPath) ? { fg: `/previews/${id}/fg.webp` } : {}),
      ...(fs.existsSync(unlockBgPath) ? { unlockBg: `/previews/${id}/bg-unlock.webp` } : {}),
      ...(fs.existsSync(unlockFgPath) ? { unlockFg: `/previews/${id}/fg-unlock.webp` } : {}),
      transitionFrames,
      ...(videoName ? { video: `/previews/${id}/${videoName}` } : {}),
      download: `/tendies/${encodeURIComponent(fileName)}`,
      fileName,
      bytes,
    });
    console.log(
      `${fileName} -> ${id} (lock bg ${locked.background?.drawn ?? 0}/fg ${locked.floating?.drawn ?? 0}+${locked.foreground?.drawn ?? 0}, unlock bg ${unlocked.background?.drawn ?? 0}/fg ${unlocked.floating?.drawn ?? 0}+${unlocked.foreground?.drawn ?? 0})`,
    );
  }
  return items;
}

const CONTENT_TYPES = {
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".mp4": "video/mp4",
};

function parseEnv(text) {
  const values = {};
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const raw = trimmed.startsWith("export ") ? trimmed.slice(7) : trimmed;
    const eq = raw.indexOf("=");
    if (eq <= 0) continue;
    const key = raw.slice(0, eq).trim();
    let value = raw.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function loadEnv() {
  const prior = new Set(Object.keys(process.env));
  const merged = {};
  for (const name of [".env", ".env.local"]) {
    const file = path.join(root, name);
    if (!fs.existsSync(file)) continue;
    Object.assign(merged, parseEnv(fs.readFileSync(file, "utf8")));
  }
  for (const [key, value] of Object.entries(merged)) {
    if (!prior.has(key)) process.env[key] = value;
  }
}

function requireConfig() {
  const names = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET", "R2_PUBLIC_BASE"];
  const missing = names.filter((name) => !process.env[name]);
  if (missing.length) {
    console.error(`Missing ${missing.join(", ")}. Copy .env.example to .env.local and fill in the R2 values.`);
    process.exit(1);
  }
  let publicBase;
  try {
    const url = new URL(process.env.R2_PUBLIC_BASE);
    const pathOnly = url.pathname === "/" || url.pathname === "";
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || !pathOnly) throw new Error("bad origin");
    publicBase = url.origin;
  } catch {
    console.error("R2_PUBLIC_BASE must be an https origin, for example https://files.example.com");
    process.exit(1);
  }
  return {
    accountId: process.env.R2_ACCOUNT_ID,
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    bucket: process.env.R2_BUCKET,
    publicBase,
  };
}

function readCatalog() {
  if (!fs.existsSync(catalogPath)) return { assetBase: "", items: [] };
  const parsed = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
  return {
    assetBase: typeof parsed.assetBase === "string" ? parsed.assetBase : "",
    items: Array.isArray(parsed.items) ? parsed.items : [],
  };
}

function sha256File(filePath) {
  const hash = createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

async function uploadFile(client, bucket, key, filePath, disposition) {
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: fs.readFileSync(filePath),
      ContentType: CONTENT_TYPES[path.posix.extname(key).toLowerCase()] ?? "application/octet-stream",
      CacheControl: "public, max-age=31536000, immutable",
      ...(disposition ? { ContentDisposition: disposition } : {}),
    }),
  );
  console.log(`  put ${key}`);
}

async function deletePrefix(client, bucket, prefix) {
  let token;
  do {
    const listed = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }),
    );
    const objects = (listed.Contents ?? []).flatMap((entry) => (entry.Key ? [{ Key: entry.Key }] : []));
    for (let index = 0; index < objects.length; index += 1000) {
      const chunk = objects.slice(index, index + 1000);
      if (!chunk.length) continue;
      const result = await client.send(
        new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: chunk, Quiet: true } }),
      );
      for (const error of result.Errors ?? []) console.error(`  delete ${error.Key}: ${error.Message}`);
    }
    token = listed.IsTruncated ? listed.NextContinuationToken : undefined;
  } while (token);
  console.log(`  deleted ${prefix}`);
}

async function uploadRendered(client, bucket, item, tendiesPath, outputRoot) {
  for (const key of itemObjectKeys(item)) {
    if (key.startsWith("originals/")) {
      await uploadFile(client, bucket, key, tendiesPath, contentDisposition(item.fileName));
      continue;
    }
    const disk = diskForPreviewKey(outputRoot, key);
    if (!fs.existsSync(disk)) throw new Error(`missing rendered file ${disk}`);
    await uploadFile(client, bucket, key, disk);
  }
}

function workerCount() {
  const fromEnv = Number(process.env.PUBLISH_CONCURRENCY);
  if (Number.isInteger(fromEnv) && fromEnv > 0) return fromEnv;
  const cpus = os.availableParallelism?.() ?? os.cpus().length;
  const byCpu = Math.max(1, Math.floor(cpus / 2));
  const byMem = Math.max(1, Math.floor(os.totalmem() / (2.5 * 1024 ** 3)));
  return Math.min(4, byCpu, byMem);
}

async function mapPool(items, limit, fn) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await fn(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

async function main() {
  loadEnv();
  const dry = process.env.PUBLISH_DRY === "1";
  const only = new Set(
    (process.env.PUBLISH_ONLY ?? "")
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean),
  );
  const config = dry ? null : requireConfig();
  ensureDir(srcDir);
  const files = fs
    .readdirSync(srcDir)
    .filter((name) => name.toLowerCase().endsWith(".tendies"))
    .sort((a, b) => a.localeCompare(b, "en"));
  if (!files.length) {
    console.error("content/tendies has no .tendies files. Catalog was left unchanged.");
    process.exit(1);
  }

  const previous = readCatalog();
  const client = config
    ? new S3Client({
        region: "auto",
        endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
      })
    : null;
  const ffmpeg = hasFfmpeg();
  const workers = workerCount();
  const cpus = os.availableParallelism?.() ?? os.cpus().length;
  sharp.concurrency(Math.max(1, Math.floor(cpus / workers)));
  console.log(`rendering ${workers} wallpaper(s) at a time`);
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tendies-"));
  const usedIds = new Set();
  const jobs = [];

  for (const name of files) {
    const filePath = path.join(srcDir, name);
    const sha256 = sha256File(filePath);
    const same = previous.items.filter((item) => item.fileName === name && item.sourceSha256 === sha256);
    const selected = only.size === 0 || only.has(name);
    if (!selected || (same.length && !only.has(name))) {
      const keep = selected ? same : previous.items.filter((item) => item.fileName === name);
      for (const item of keep) usedIds.add(item.id);
      jobs.push({ name, unchanged: keep });
      console.log(`${name} unchanged`);
      continue;
    }
    jobs.push({
      name,
      filePath,
      sha256,
      preferredIds: previous.items.filter((item) => item.fileName === name).map((item) => item.id),
    });
  }

  let uploaded = 0;
  let failed = 0;
  let settled = [];
  try {
    settled = await mapPool(jobs, workers, async (job) => {
      if (job.unchanged) return { items: job.unchanged, uploaded: false, failed: false, stale: [] };
      try {
        const built = await buildOne(job.filePath, usedIds, ffmpeg, outputRoot, job.preferredIds.slice());
        const relocated = built.map((item) => relocateItem(item, job.sha256));
        if (dry) {
          const checkDir = path.join(os.tmpdir(), "preview-check");
          ensureDir(checkDir);
          for (const item of relocated) {
            const poster = path.join(outputRoot, item.id, "poster.jpg");
            if (fs.existsSync(poster)) fs.copyFileSync(poster, path.join(checkDir, `${item.id}.jpg`));
          }
        } else {
          for (const item of relocated) await uploadRendered(client, config.bucket, item, job.filePath, outputRoot);
        }
        return {
          items: relocated,
          uploaded: true,
          failed: false,
          stale: previous.items.filter((item) => item.fileName === job.name),
        };
      } catch (error) {
        console.error(`failed ${job.name}: ${error instanceof Error ? error.stack : error}`);
        const keep = previous.items.filter((item) => item.fileName === job.name);
        for (const item of keep) usedIds.add(item.id);
        return { items: keep, uploaded: false, failed: true, stale: [] };
      }
    });
  } finally {
    fs.rmSync(outputRoot, { recursive: true, force: true });
  }

  const nextItems = [];
  const staleItems = [];
  for (const result of settled) {
    nextItems.push(...result.items);
    staleItems.push(...result.stale);
    if (result.uploaded) uploaded += 1;
    if (result.failed) failed += 1;
  }

  if (dry) {
    console.log(`dry run: rendered ${uploaded}, failed ${failed}, posters in ${path.join(os.tmpdir(), "preview-check")}`);
    return;
  }

  if (uploaded === 0 && failed > 0) {
    console.error("No file uploaded. Catalog was left unchanged.");
    process.exit(1);
  }

  for (const item of previous.items) {
    if (!files.includes(item.fileName)) staleItems.push(item);
  }

  fs.writeFileSync(catalogPath, `${JSON.stringify({ assetBase: config.publicBase, items: nextItems }, null, 2)}\n`);
  console.log(`catalog: ${nextItems.length} wallpaper(s), uploaded ${uploaded}, ffmpeg ${ffmpeg ? "yes" : "no"}`);

  if (failed > 0) return;

  const keep = new Set(nextItems.flatMap((item) => prefixesForKeys(itemObjectKeys(item))));
  for (const prefix of new Set(staleItems.flatMap((item) => prefixesForKeys(itemObjectKeys(item))))) {
    if (keep.has(prefix)) continue;
    try {
      await deletePrefix(client, config.bucket, prefix);
    } catch (error) {
      console.error(`failed to delete ${prefix}: ${error instanceof Error ? error.message : error}`);
    }
  }

  const stillLocal = nextItems.some((item) => itemObjectKeys(item).some((key) => key.startsWith("/")));
  if (!stillLocal) {
    fs.rmSync(previewRoot, { recursive: true, force: true });
    fs.rmSync(downloadRoot, { recursive: true, force: true });
    console.log("removed local public/previews and public/tendies");
  }
}

main();
