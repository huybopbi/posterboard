import categoryFile from "@/content/categories.json";
import type { Category, CategoryFile } from "./types";

const data = categoryFile as CategoryFile;

export const FALLBACK_CATEGORY = "other";

export const categories: Category[] = data.categories;

const known = new Set(categories.map((category) => category.id));

export function isCategoryId(value: string | null | undefined): value is string {
  return value != null && known.has(value);
}

// Items missing from content/categories.json (for example after a new publish)
// default to ["other"], so the catalog never needs to be in sync with this file.
export function getCategories(id: string): string[] {
  const assigned = (data.items[id] ?? []).filter((category) => known.has(category));
  return assigned.length > 0 ? assigned : [FALLBACK_CATEGORY];
}
