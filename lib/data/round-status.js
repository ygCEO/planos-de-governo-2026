export function isOfficialSecondRoundStatus(value) {
  const normalized = String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[º°]/g, "O")
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim()
    .toUpperCase();
  return /(?:^|\s)2O?\s+TURNO(?:\s|$)/.test(normalized);
}
