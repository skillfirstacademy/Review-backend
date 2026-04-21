// utils/slugify.js
export function slugify(name) {
  if (!name || typeof name !== "string") return "-";

  return name
    .normalize("NFD")                 // Split accented letters (e.g., é → e + ́)
    .replace(/[\u0300-\u036f]/g, "")  // Remove accent marks
    .replace(/’|‘|'/g, "")            // Remove single quotes/apostrophes
    .replace(/&/g, "and")             // Replace '&' with 'and'
    .replace(/[^a-zA-Z0-9]+/g, "-")   // Replace all non-alphanumerics with hyphen
    .replace(/^-+|-+$/g, "")          // Trim leading/trailing hyphens
    .replace(/-+/g, "-")              // Collapse multiple hyphens
    .toLowerCase()                    // Convert to lowercase
    .trim() || "-";
}
