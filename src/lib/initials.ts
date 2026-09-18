/**
 * The one or two letters that stand for a name in a small circle.
 *
 * Turkish casing on purpose: "ilke" upper-cases to "İLKE", not "ILKE", and an
 * avatar is the one place a wrong letter is impossible to miss.
 */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const letters = words.length === 1 ? [words[0][0]] : [words[0][0], words[words.length - 1][0]];
  return letters.join('').toLocaleUpperCase('tr');
}
