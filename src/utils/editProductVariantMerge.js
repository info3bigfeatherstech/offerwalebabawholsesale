/**
 * Merge server variant arrays into edit-form state without wiping unsaved primary variant (index 0).
 * Used after extra-variant save/toggle/delete — main form Save Changes still owns variants[0].
 */

export function resolvePrimaryAttributes(formData) {
  const fromVariant = formData?.variants?.[0]?.attributes;
  const fromProduct = formData?.attributes;
  if (Array.isArray(fromVariant) && fromVariant.length > 0) return fromVariant;
  if (Array.isArray(fromProduct) && fromProduct.length > 0) return fromProduct;
  return Array.isArray(fromVariant) ? fromVariant : [];
}

/**
 * @param {object} prevFormData - current formData
 * @param {Array} serverVariantsRaw - variants from API
 * @param {function} normaliseVariants - normalizer from EditProductModal
 * @param {number|null} savedIndex - variant index just persisted (null = e.g. add/delete full sync)
 */
export function mergeServerVariantsIntoForm(
  prevFormData,
  serverVariantsRaw,
  normaliseVariants,
  savedIndex = null
) {
  const serverVariants = normaliseVariants(serverVariantsRaw || []);
  if (!serverVariants.length) return prevFormData?.variants || [];

  const prevVariants = prevFormData?.variants || [];
  if (!prevVariants.length) return serverVariants;

  const len = Math.max(prevVariants.length, serverVariants.length);
  const merged = [];

  for (let i = 0; i < len; i++) {
    const local = prevVariants[i];
    const server = serverVariants[i];

    // Primary variant: keep local edits until parent Save Changes (unless we just saved index 0)
    if (i === 0 && savedIndex !== 0 && local) {
      merged.push(local);
      continue;
    }

    if (server) {
      merged.push(server);
      continue;
    }
    if (local) {
      merged.push(local);
    }
  }

  return merged;
}

export function applyVariantMergeToFormData(prev, serverVariantsRaw, normaliseVariants, savedIndex = null) {
  const variants = mergeServerVariantsIntoForm(prev, serverVariantsRaw, normaliseVariants, savedIndex);
  return {
    ...prev,
    variants,
    attributes: variants[0]?.attributes ?? prev.attributes,
  };
}
