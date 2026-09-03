/**
 * Helpers for controlled number inputs in admin product forms.
 * Store raw string while typing; parse to number only on submit/API build.
 */

/** Safe display value — avoids forcing 0/5 defaults that block natural typing. */
export function displayNumericInput(value) {
  if (value === null || value === undefined) return "";
  return String(value);
}

/** Select all on focus so a new digit replaces prefilled values (e.g. 0). */
export function selectAllOnFocus(event) {
  if (typeof event?.target?.select === "function") {
    event.target.select();
  }
}

/** Pass through raw input; optional allowDecimals for weight/dimensions. */
export function normalizeNumericTyping(raw, { allowDecimals = false } = {}) {
  if (raw === "" || raw === null || raw === undefined) return "";
  const s = String(raw);
  if (allowDecimals) {
    if (/^\d*\.?\d*$/.test(s)) return s;
    return s.replace(/[^\d.]/g, "");
  }
  if (/^\d*$/.test(s)) return s;
  return s.replace(/\D/g, "");
}
