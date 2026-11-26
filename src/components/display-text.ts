export function displayLines(value: string): string[] | null {
  const normalized = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toUpperCase().trim().replace(/\s+/g, " ");
  if (!/^[A-Z0-9 .!?:-]{1,30}$/.test(normalized)) return null;
  if (normalized.length <= 15) return [normalized];
  const split = normalized.lastIndexOf(" ", 15);
  if (split > 0 && normalized.length - split - 1 <= 15) {
    return [normalized.slice(0, split), normalized.slice(split + 1)];
  }
  return [normalized.slice(0, 15).trimEnd(), normalized.slice(15).trimStart()];
}
