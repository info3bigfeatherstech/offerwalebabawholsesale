/**
 * Collect non-empty variant product codes in list order (primary first).
 * @param {{ variants?: Array<{ productCode?: string }> } | null | undefined} product
 * @returns {string[]}
 */
export function collectVariantProductCodes(product) {
  const codes = [];
  for (const variant of product?.variants || []) {
    const code = String(variant?.productCode || "").trim();
    if (code) codes.push(code);
  }
  return codes;
}

/**
 * Compact display: first full code, then same-base suffixes only.
 * e.g. ["1221-1","1221-2","1221-3"] → "1221-1, -2, -3"
 * Different bases stay full. Truncates with +N when over maxVisible.
 *
 * @param {string[]} codes
 * @param {{ maxVisible?: number }} [options]
 * @returns {{ display: string, tooltip: string, hiddenCount: number }}
 */
export function formatProductCodesCompact(codes, options = {}) {
  const maxVisible = Math.max(1, Number(options.maxVisible) || 4);
  const list = Array.isArray(codes)
    ? codes.map((c) => String(c || "").trim()).filter(Boolean)
    : [];

  if (!list.length) {
    return { display: "", tooltip: "", hiddenCount: 0 };
  }

  const parts = [];
  let lastBase = null;
  for (const code of list) {
    const match = code.match(/^(.+)-(\d+)$/);
    if (match && match[1] === lastBase) {
      parts.push(`-${match[2]}`);
    } else {
      parts.push(code);
      lastBase = match ? match[1] : null;
    }
  }

  const tooltip = list.join(", ");
  if (parts.length <= maxVisible) {
    return { display: parts.join(", "), tooltip, hiddenCount: 0 };
  }

  const hiddenCount = parts.length - maxVisible;
  return {
    display: `${parts.slice(0, maxVisible).join(", ")} +${hiddenCount}`,
    tooltip,
    hiddenCount,
  };
}
