/**
 * Client-side create-product validation — mirrors backend rules/messages where possible.
 * Returns { valid, message, focusSection } — focusSection used to scroll to shipping.
 */

const SUFFIXED_PRODUCT_CODE_REGEX = /^([A-Z0-9]+)-(\d+)$/;

export const parsePositiveNumber = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return null;
  return num;
};

export const validateRequiredShipping = (shipping) => {
  const dims = shipping?.dimensions || {};
  const weight = parsePositiveNumber(shipping?.weight);
  const length = parsePositiveNumber(dims.length);
  const width = parsePositiveNumber(dims.width);
  const height = parsePositiveNumber(dims.height);

  if (weight == null) {
    return {
      valid: false,
      message: "Shipping weight is required and must be greater than 0",
      focusSection: "shipping",
    };
  }
  if (length == null || width == null || height == null) {
    return {
      valid: false,
      message: "Shipping dimensions (length, width, height) are required and must be greater than 0",
      focusSection: "shipping",
    };
  }
  return { valid: true };
};

const validateProductCodeSeries = (rawCodes, contextLabel = "variants") => {
  const normalized = (rawCodes || []).map((c) => String(c || "").trim().toUpperCase()).filter(Boolean);
  if (!normalized.length) {
    return `At least one ProductCode is required for ${contextLabel}`;
  }

  const parsed = normalized.map((code, idx) => {
    const match = code.match(SUFFIXED_PRODUCT_CODE_REGEX);
    if (!match) {
      return `${contextLabel}[${idx + 1}] ProductCode must be BASE-N (e.g., 3897-1 or 3897-01)`;
    }
    const seq = Number(match[2]);
    if (!Number.isInteger(seq) || seq < 1) {
      return `${contextLabel}[${idx + 1}] ProductCode suffix must be a whole number ≥ 1`;
    }
    return null;
  });
  const firstParseError = parsed.find((x) => typeof x === "string");
  if (firstParseError) return firstParseError;

  const canonical = normalized.map((code) => {
    const m = code.match(SUFFIXED_PRODUCT_CODE_REGEX);
    return `${m[1]}-${Number(m[2])}`;
  });

  const bases = canonical.map((code) => code.split("-")[0]);
  const base = bases[0];
  if (bases.some((b) => b !== base)) {
    return `All ProductCodes must share same base. Expected ${base}-N`;
  }

  const seenCodes = new Set();
  const seenSeq = new Set();
  for (const code of canonical) {
    if (seenCodes.has(code)) return `Duplicate ProductCode found: ${code}`;
    seenCodes.add(code);
    seenSeq.add(Number(code.split("-")[1]));
  }

  for (let expected = 1; expected <= canonical.length; expected++) {
    if (!seenSeq.has(expected)) {
      return `ProductCode sequence must be continuous: missing ${base}-${expected}`;
    }
  }
  return null;
};

const fail = (message, focusSection = null) => ({ valid: false, message, focusSection });

/**
 * @param {object} formData
 * @returns {{ valid: boolean, message?: string, focusSection?: string|null }}
 */
export const validateCreateProductForm = (formData) => {
  try {
    if (!formData?.name?.trim()) return fail("Product name is required");
    if (!formData?.title?.trim()) return fail("Product title is required");
    if (!formData?.category) return fail("Please select a category");

    const bc0 = String(formData.ProductCode ?? "").trim();
    if (!bc0) return fail("Main ProductCode is required");

    const m0 = bc0.toUpperCase().match(SUFFIXED_PRODUCT_CODE_REGEX);
    const s0 = m0 ? Number(m0[2]) : NaN;
    if (!m0 || !Number.isInteger(s0) || s0 < 1) {
      return fail("Main ProductCode must be BASE-N (e.g., 3897-1 or 3897-01)");
    }

    const basePrice = parsePositiveNumber(formData.price?.base);
    if (basePrice == null) return fail("Main variant base price is required and must be greater than 0");

    const saleRaw = formData.price?.sale;
    if (saleRaw !== "" && saleRaw != null && saleRaw !== undefined) {
      const sale = parsePositiveNumber(saleRaw);
      if (sale != null && sale >= basePrice) {
        return fail("Main variant sale price must be less than base price");
      }
    }

    if (formData.wholesale) {
      const wholesaleBase = parsePositiveNumber(formData.wholesaleBase);
      if (wholesaleBase == null) {
        return fail("Wholesale base price is required and must be greater than 0 when wholesale is enabled");
      }
      const moq = parseInt(formData.minimumOrderQuantity, 10);
      if (!Number.isFinite(moq) || moq < 1) {
        return fail("Minimum Order Quantity (MOQ) must be at least 1 when wholesale is enabled");
      }
      const wsRaw = formData.wholesaleSale;
      if (wsRaw !== "" && wsRaw != null && wsRaw !== undefined) {
        const wholesaleSale = parsePositiveNumber(wsRaw);
        if (wholesaleSale != null && wholesaleSale >= wholesaleBase) {
          return fail("Wholesale sale price must be less than wholesale base price");
        }
      }
    }

    const variants = formData.variants || [];
    for (let i = 0; i < variants.length; i++) {
      const v = variants[i];
      const bc = String(v.ProductCode ?? "").trim();
      if (!bc) return fail(`Variant ${i + 1}: ProductCode is required`);

      const mv = bc.toUpperCase().match(SUFFIXED_PRODUCT_CODE_REGEX);
      const sv = mv ? Number(mv[2]) : NaN;
      if (!mv || !Number.isInteger(sv) || sv < 1) {
        return fail(`Variant ${i + 1}: ProductCode must be BASE-N (e.g., 3897-1 or 3897-01)`);
      }

      const vBase = parsePositiveNumber(v.price?.base);
      if (vBase == null) {
        return fail(`Variant ${i + 1}: base price is required and must be greater than 0`);
      }
    }

    const allBarcodes = [bc0, ...variants.map((v) => String(v.ProductCode).trim())];
    if (new Set(allBarcodes).size !== allBarcodes.length) {
      return fail("Duplicate barcodes found — each variant must have a unique ProductCode");
    }

    const seriesError = validateProductCodeSeries(allBarcodes, "create product variants");
    if (seriesError) return fail(seriesError);

    const shippingCheck = validateRequiredShipping(formData.shipping);
    if (!shippingCheck.valid) return shippingCheck;

    return { valid: true };
  } catch (err) {
    return fail(err?.message || "Validation failed. Please check your inputs.");
  }
};

export const scrollToProductShippingSection = () => {
  try {
    const el = document.getElementById("product-shipping-section");
    if (el?.scrollIntoView) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  } catch {
    /* ignore scroll failures */
  }
};
