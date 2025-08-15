export function sanitizeText(input: string): string {
  // remove basic HTML tags and trim length
  const cleaned = input
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.slice(0, 4000);
}
