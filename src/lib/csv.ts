import { locale } from './i18n';

/**
 * Exporting a table to something Excel opens.
 *
 * CSV rather than a real .xlsx: a spreadsheet writer is a large dependency for
 * a file that is read once and thrown away, and Excel opens CSV without being
 * asked twice.
 *
 * Two details make the difference between "opens" and "opens correctly":
 *
 *   - The BOM. Without it Excel reads the file as the local codepage and
 *     "Çocuk kampı" arrives as mojibake.
 *   - The separator hint. Turkish Excel expects `;` because the comma is the
 *     decimal mark; `sep=` on the first line tells it which to use, whatever
 *     the machine is set to.
 */
const SEPARATOR = ';';

function cell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toLocaleDateString(locale());
  const text = String(value);
  // A field containing the separator, a quote or a newline has to be quoted,
  // and quotes inside it doubled. Skipping this is how one comma in a name
  // shifts every column after it.
  return /["\n\r;,]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers, ...rows].map((row) => row.map(cell).join(SEPARATOR));
  return `sep=${SEPARATOR}\n${lines.join('\r\n')}`;
}

export function downloadCsv(filename: string, headers: string[], rows: unknown[][]): void {
  const blob = new Blob(['﻿', toCsv(headers, rows)], {
    type: 'text/csv;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoking immediately can cancel the download in some browsers.
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** A stamp that sorts and does not contain a separator. */
export function fileStamp(): string {
  return new Date().toISOString().slice(0, 10);
}
