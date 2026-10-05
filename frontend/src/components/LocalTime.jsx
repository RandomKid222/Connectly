import React from 'react';
import { localTimestamp, parseTimestamp } from '../utils/time.js';

export default function LocalTime({ value, timeOnly = false, className }) {
  const date = parseTimestamp(value);
  if (!date) return null;
  const title = date.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short'
  });
  return <time dateTime={date.toISOString()} title={title + ' · Your local time'} className={className}>
    {localTimestamp(value, timeOnly)}
  </time>;
}
