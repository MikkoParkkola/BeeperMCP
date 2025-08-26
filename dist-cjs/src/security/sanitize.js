'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.sanitizeText = sanitizeText;
function sanitizeText(input) {
  // remove basic HTML tags and trim length
  const cleaned = input
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.slice(0, 4000);
}
