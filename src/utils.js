function pad(value) {
  return String(value).padStart(2, "0");
}

export function toLocalDateValue(date = new Date()) {
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  return `${year}-${month}-${day}`;
}

export function formatDate(value) {
  if (!value) return "--";
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatTime(value) {
  if (!value) return "--";
  const date = typeof value === "string" && value.includes("T") ? new Date(value) : new Date(`1970-01-01T${value}`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function formatDateTime(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatLongDate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export function formatLiveDateTime(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  const datePart = date.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const timePart = date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  return `${datePart}  |  ${timePart}`;
}

export function getToday() {
  return toLocalDateValue(new Date());
}

export function getDateOffset(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return toLocalDateValue(date);
}

export function getDatesBetween(startOffset, endOffset) {
  const dates = [];
  for (let offset = startOffset; offset <= endOffset; offset += 1) {
    dates.push(getDateOffset(offset));
  }
  return dates;
}

export function differenceInDays(fromDate, toDate) {
  const start = new Date(fromDate);
  const end = new Date(toDate);
  const diff = end.getTime() - start.getTime();
  return Math.max(1, Math.round(diff / 86400000) + 1);
}

export function calculateDistanceMeters(lat1, lng1, lat2, lng2) {
  const toRadians = (deg) => (deg * Math.PI) / 180;
  const earthRadius = 6371000;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadius * c;
}

export function createCsv(rows) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const escapeValue = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const lines = [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => escapeValue(row[header])).join(",")),
  ];
  return lines.join("\n");
}

export function downloadTextFile(content, filename, type = "text/csv;charset=utf-8;") {
  const blob = new Blob([content], { type });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

export function getWeekdayBuckets() {
  const today = new Date();
  const dates = [];
  for (let i = 6; i >= 0; i -= 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    dates.push({
      key: toLocalDateValue(date),
      label: date.toLocaleDateString(undefined, { weekday: "short" }),
    });
  }
  return dates;
}

export function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function hoursBetween(checkIn, checkOut) {
  if (!checkIn || !checkOut) return 0;
  const start = new Date(`1970-01-01T${checkIn}`);
  const end = new Date(`1970-01-01T${checkOut}`);
  return Math.max(0, (end.getTime() - start.getTime()) / 3600000);
}

export function getFirstDayOfCurrentMonth() {
  const date = new Date();
  return toLocalDateValue(new Date(date.getFullYear(), date.getMonth(), 1));
}

export function countWorkingDaysBetween(startValue, endValue) {
  const start = new Date(startValue);
  const end = new Date(endValue);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return 0;

  let count = 0;
  const cursor = new Date(start);
  while (cursor <= end) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) count += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}
