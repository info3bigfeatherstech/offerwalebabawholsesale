/** Thumbnail + labels for inventory stock modal (admin). */

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

export function buildVariantStockRows(product) {
  const variants = Array.isArray(product?.variants) ? product.variants : [];
  return variants.map((v, idx) => ({
    productCode: v.productCode,
    sku: v.sku || "",
    label: getVariantDisplayLabel(v, idx),
    thumbUrl: getVariantThumbUrl(v, product),
    quantity: v.inventory?.quantity,
    lowStockThreshold: v.inventory?.lowStockThreshold,
  }));
}
