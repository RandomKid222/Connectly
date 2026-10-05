// SQLite CURRENT_TIMESTAMP is UTC even though its text has no timezone suffix.
export function parseTimestamp(value) {
  if (!value) return null;
  const text = String(value).trim().replace(' ', 'T');
  const normalized = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(text) ? text + 'Z' : text;
  const date = new Date(normalized);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function localTimestamp(value, timeOnly = false) {
  const date = parseTimestamp(value);
  if (!date) return '';
  return new Intl.DateTimeFormat(undefined, timeOnly
    ? { hour: 'numeric', minute: '2-digit' }
    : { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}
