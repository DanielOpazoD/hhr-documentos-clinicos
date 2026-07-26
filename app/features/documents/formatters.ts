export function todayInRapaNui(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Easter" });
}

export function formatStoredDate(value: string): string {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}-${month}-${year}` : value;
}

export function formatUpdated(value: string): string {
  return new Date(value).toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Pacific/Easter",
  });
}

export function formatSavedTime(value = new Date()): string {
  return value.toLocaleTimeString("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
  });
}
