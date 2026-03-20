/**
 * Lightweight glob matching for local SOE evaluation.
 * Supports: *, **, ?
 * No external dependencies.
 */

export function minimatch(str, pattern) {
  // Exact match
  if (pattern === str) return true;
  // Match-all
  if (pattern === '**' || pattern === '*') return true;

  const regexStr = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')  // escape regex chars (except * and ?)
    .replace(/\*\*/g, '{{GLOBSTAR}}')        // placeholder for **
    .replace(/\*/g, '[^/]*')                 // * matches within segment
    .replace(/\{\{GLOBSTAR\}\}/g, '.*')      // ** matches across segments
    .replace(/\?/g, '[^/]');                 // ? matches single char

  return new RegExp(`^${regexStr}$`).test(str);
}
