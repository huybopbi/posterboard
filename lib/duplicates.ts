import duplicateOf from "@/content/duplicates.json";

const hiddenIds = duplicateOf as Record<string, string>;

export function isHiddenDuplicate(id: string) {
  return hiddenIds[id] != null;
}
