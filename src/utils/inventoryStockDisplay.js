/** Thumbnail + labels for inventory stock / price modal (admin). */

export function getVariantThumbUrl(variant, product) {
  const vImages = Array.isArray(variant?.images) ? variant.images : [];
  const fromVariant = (vImages.find((img) => img.isMain) || vImages[0])?.url;
  if (fromVariant) return fromVariant;

  const mainVariant = product?.variants?.[0];
  const mImages = Array.isArray(mainVariant?.images) ? mainVariant.images : [];
  return (
    (mImages.find((img) => img.isMain) || mImages[0])?.url ||
    product?.images?.[0]?.url ||
    null
  );
}

export function getProductThumbUrl(product) {
  const variants = Array.isArray(product?.variants) ? product.variants : [];
  if (variants.length) return getVariantThumbUrl(variants[0], product);
  return product?.images?.[0]?.url || null;
}

export function getPrimaryProductCode(product) {
  const code = product?.variants?.[0]?.productCode;
  if (code) return String(code);
  const sku = product?.variants?.[0]?.sku;
  return sku ? String(sku) : "—";
}

export function getVariantDisplayLabel(variant, index) {
  const title = variant?.title || variant?.variantTitle;
  if (title) return title;
  if (variant?.sku) return variant.sku;
  if (variant?.productCode) return variant.productCode;
  return `Variant ${index + 1}`;
}

export function buildProductSummary(product) {
  return {
    name: product?.name || "Unnamed product",
    title: product?.title || "",
    slug: product?.slug || "",
    thumbUrl: getProductThumbUrl(product),
    primaryProductCode: getPrimaryProductCode(product),
  };
}

/**
 * @param {object} product
 * @param {{ storefront?: 'ecomm'|'wholesale' }} [opts]
 * Ecomm rows edit price.base/sale; wholesale rows edit wholesaleBase/wholesaleSale.
 */
export function buildVariantStockRows(product, opts = {}) {
  const storefront =
    String(opts.storefront || "wholesale").toLowerCase() === "ecomm"
      ? "ecomm"
      : "wholesale";
  const variants = Array.isArray(product?.variants) ? product.variants : [];
  return variants.map((v, idx) => {
    const price = v?.price || {};
    const basePrice =
      storefront === "wholesale" ? price.wholesaleBase : price.base;
    const salePrice =
      storefront === "wholesale" ? price.wholesaleSale : price.sale;
    return {
      productCode: v.productCode,
      sku: v.sku || "",
      label: getVariantDisplayLabel(v, idx),
      thumbUrl: getVariantThumbUrl(v, product),
      quantity: v.inventory?.quantity,
      lowStockThreshold: v.inventory?.lowStockThreshold,
      basePrice,
      salePrice,
      priceMode: storefront,
    };
  });
}
