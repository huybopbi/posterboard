import duplicateOf from "@/content/duplicates.json";

const hiddenIds = duplicateOf as Record<string, string>;

const copies = new Map<string, number>();
for (const keep of Object.values(hiddenIds)) {
  copies.set(keep, (copies.get(keep) ?? 1) + 1);
}

export function isHiddenDuplicate(id: string) {
  return hiddenIds[id] != null;
}

export function copyCount(id: string) {
  return copies.get(id) ?? 1;
}

export const hiddenDuplicateCount = Object.keys(hiddenIds).length;
