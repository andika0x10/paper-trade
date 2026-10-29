export function number(value: string | number | undefined, digits = 2) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n);
}
export function price(value: string | number | undefined) {
  const n = Number(value ?? 0);
  return number(
    n,
    n === 0 || n >= 100
      ? 2
      : n >= 1
        ? 3
        : Math.min(8, Math.max(4, 3 - Math.floor(Math.log10(n)))),
  );
}
export function compact(value: string | number) {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(Number(value));
}
export function signed(value: string | number, digits = 2) {
  const n = Number(value);
  return `${n >= 0 ? "+" : "−"}${number(Math.abs(n), digits)}`;
}
export function timestamp(value: number) {
  return new Date(value).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
