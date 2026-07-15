export function isoNow() {
  return new Date().toISOString();
}

export function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function startOfLocalDay(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function daysBetweenLocalDates(from: Date, to: Date) {
  const fromStart = startOfLocalDay(from).getTime();
  const toStart = startOfLocalDay(to).getTime();

  return Math.floor((toStart - fromStart) / 86_400_000);
}
