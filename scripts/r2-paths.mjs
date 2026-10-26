export function contentDisposition(fileName) {
  const fallback =
    fileName
      .normalize("NFKD")
      .replace(/[^\x20-\x7E]/g, "")
      .replace(/["\\]/g, "")
      .trim() || "wallpaper.tendies";
  const encoded = encodeURIComponent(fileName).replace(/[!'()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

export function sha12(sha256) {
  return sha256.slice(0, 12);
}

export function previewObjectKey(publicPath, sha256) {
  const parts = publicPath.split("/").filter(Boolean);
  if (parts.length < 3 || parts[0] !== "previews") {
    throw new Error(`unexpected preview path ${publicPath}`);
  }
  const id = parts[1];
  const file = parts.slice(2).join("/");
  return { id, file, key: `previews/${id}/${sha12(sha256)}/${file}` };
}

export function originalObjectKey(id, sha256, fileName) {
  return `originals/${id}/${sha12(sha256)}/${fileName}`;
}

export function diskForPreviewKey(outputRoot, key) {
  const parts = key.split("/");
  if (parts.length < 4 || parts[0] !== "previews") {
    throw new Error(`unexpected preview key ${key}`);
  }
  return `${outputRoot}/${parts[1]}/${parts.slice(3).join("/")}`;
}

export function itemObjectKeys(item) {
  const keys = [item.download, item.poster, item.bg, item.fg, item.unlockBg, item.unlockFg, item.video];
  for (const frame of item.transitionFrames ?? []) keys.push(frame.bg, frame.fg);
  return keys.filter(Boolean);
}

export function prefixesForKeys(keys) {
  const prefixes = new Set();
  for (const key of keys) {
    if (!key || key.startsWith("/") || /^https?:\/\//.test(key)) continue;
    const parts = key.split("/");
    if (parts.length < 4) continue;
    prefixes.add(`${parts[0]}/${parts[1]}/${parts[2]}/`);
  }
  return [...prefixes];
}

export function relocateItem(item, sha256) {
  const map = (value) => (value ? previewObjectKey(value, sha256).key : value);
  return {
    ...item,
    sourceSha256: sha256,
    poster: map(item.poster),
    bg: map(item.bg),
    fg: map(item.fg),
    unlockBg: map(item.unlockBg),
    unlockFg: map(item.unlockFg),
    video: map(item.video),
    download: originalObjectKey(item.id, sha256, item.fileName),
    transitionFrames: item.transitionFrames?.map((frame) => ({
      ...(frame.bg ? { bg: map(frame.bg) } : {}),
      ...(frame.fg ? { fg: map(frame.fg) } : {}),
    })),
  };
}
