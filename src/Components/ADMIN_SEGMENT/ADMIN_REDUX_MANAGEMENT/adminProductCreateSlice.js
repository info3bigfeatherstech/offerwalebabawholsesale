// ADMIN_SEGMENT/ADMIN_REDUX_MANAGEMENT/adminProductCreateSlice.js

import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import wholesaleAxios from "../../../SERVICES/Wholesaleaxios";
import { buildVariantCatalogApiPayload } from "../../../utils/variantCatalogForm";

const toNum = (raw) => {
  if (raw === "" || raw === null || raw === undefined) return undefined;
  const n = parseFloat(raw);
  return isNaN(n) ? undefined : n;
};

const buildPriceObj = (price, label = "Base price") => {
  const base = toNum(price?.base);
  if (!base && base !== 0) throw new Error(`${label} is required`);
  if (base <= 0) throw new Error(`${label} must be greater than 0`);
  const saleRaw = toNum(price?.sale);
  const sale = (price?.sale !== "" && price?.sale != null && saleRaw !== undefined) ? saleRaw : null;

  const priceObj = { base, sale };

  if (price?.wholesaleBase !== undefined && price?.wholesaleBase !== "") {
    priceObj.wholesaleBase = toNum(price.wholesaleBase) || 0;
  }
  if (price?.wholesaleSale !== undefined && price?.wholesaleSale !== "") {
    priceObj.wholesaleSale = toNum(price.wholesaleSale) || null;
  }

  return priceObj;
};

const buildInventoryObj = (inv) => ({
  quantity: parseInt(inv?.quantity) || 0,
  lowStockThreshold: parseInt(inv?.lowStockThreshold) || 5,
  trackInventory: inv?.trackInventory !== false,
});

const buildSoldInfoForApi = (soldInfo) => ({
  enabled: soldInfo?.enabled === true,
  count: parseInt(soldInfo?.count, 10) || 0,
});

const buildFomoForApi = (fomo) => ({
  enabled: fomo?.enabled === true,
  type: ["viewing_now", "product_left", "custom"].includes(fomo?.type) ? fomo.type : "viewing_now",
  viewingNow: parseInt(fomo?.viewingNow, 10) || 0,
  productLeft: parseInt(fomo?.productLeft, 10) || 0,
  customMessage: fomo?.customMessage || "",
});

/** BASE = left of hyphen, unchanged except trim+uppercase. Suffix only is normalized (01→1). */
const SUFFIXED_PRODUCT_CODE_REGEX = /^([A-Z0-9]+)-(\d+)$/;

const normalizeProductCode = (rawCode, label = "ProductCode") => {
  const code = String(rawCode ?? "").trim().toUpperCase();
  if (!code) throw new Error(`${label} is required`);
  const m = code.match(SUFFIXED_PRODUCT_CODE_REGEX);
  if (!m) {
    throw new Error(`${label} must be in BASE-N format (e.g., 3897-1 or 3897-01)`);
  }
  const seq = Number(m[2]);
  if (!Number.isInteger(seq) || seq < 1) {
    throw new Error(`${label} suffix must be a whole number ≥ 1`);
  }
  return `${m[1]}-${seq}`;
};

const validateProductCodeSeries = (codes, contextLabel = "variants") => {
  const normalized = (codes || []).map((c) => String(c || "").trim().toUpperCase()).filter(Boolean);
  if (!normalized.length) {
    throw new Error(`At least one ProductCode is required for ${contextLabel}`);
  }

  const parsed = normalized.map((code, idx) => {
    const match = code.match(SUFFIXED_PRODUCT_CODE_REGEX);
    if (!match) {
      throw new Error(`${contextLabel}[${idx + 1}] ProductCode must be BASE-N (e.g., 3897-1 or 3897-01)`);
    }
    const seq = Number(match[2]);
    if (!Number.isInteger(seq) || seq < 1) {
      throw new Error(`${contextLabel}[${idx + 1}] ProductCode suffix must be a whole number ≥ 1`);
    }
    return { code: `${match[1]}-${seq}`, base: match[1], sequence: seq };
  });

  const base = parsed[0].base;
  const seenCodes = new Set();
  const seenSequences = new Set();

  for (const item of parsed) {
    if (item.base !== base) {
      throw new Error(`All ProductCodes must share same base. Expected ${base}-N, got ${item.code}`);
    }
    if (seenCodes.has(item.code)) {
      throw new Error(`Duplicate ProductCode found: ${item.code}`);
    }
    seenCodes.add(item.code);
    seenSequences.add(item.sequence);
  }

  for (let expected = 1; expected <= parsed.length; expected++) {
    if (!seenSequences.has(expected)) {
      throw new Error(`ProductCode sequence must be continuous: missing ${base}-${expected}`);
    }
  }
};

export const createProduct = createAsyncThunk(
  "adminProductCreate/createProduct",
  async (productData, { rejectWithValue }) => {
    try {
      const fd = new FormData();

      if (productData.name) fd.append("name", productData.name);
      if (productData.title) fd.append("title", productData.title);
      if (productData.description) fd.append("description", productData.description);
      if (productData.category) fd.append("category", productData.category);
      if (productData.brand) fd.append("brand", productData.brand);
      if (productData.status) fd.append("status", productData.status);
      if (productData.isFeatured !== undefined) fd.append("isFeatured", String(productData.isFeatured));
      if (productData.hsnCode) fd.append("hsnCode", productData.hsnCode);
      if (productData.taxRate !== undefined && productData.taxRate !== "") fd.append("gstRate", String(productData.taxRate));
      if (productData.isFragile !== undefined) fd.append("isFragile", String(productData.isFragile));

      const shippingData = {
        ...productData.shipping,
        weight: toNum(productData.shipping?.weight) ?? 0,
        dimensions: {
          length: toNum(productData.shipping?.dimensions?.length) ?? 0,
          width: toNum(productData.shipping?.dimensions?.width) ?? 0,
          height: toNum(productData.shipping?.dimensions?.height) ?? 0,
        },
      };
      fd.append("shipping", JSON.stringify(shippingData));

      fd.append("soldInfo", JSON.stringify(buildSoldInfoForApi(productData.soldInfo)));
      fd.append("fomo", JSON.stringify(buildFomoForApi(productData.fomo)));
      if (productData.attributes?.length) fd.append("attributes", JSON.stringify(productData.attributes));

      const productImageFiles = (productData.images || []).filter((img) => img.file instanceof File);
      productImageFiles.forEach((img) => fd.append("images", img.file));

      let primaryPrice;
      try {
        const priceData = {
          base: productData.price?.base,
          sale: productData.price?.sale,
        };
        if (productData.wholesale) {
          priceData.wholesaleBase = productData.wholesaleBase;
          priceData.wholesaleSale = productData.wholesaleSale;
        }
        primaryPrice = buildPriceObj(priceData, "Main variant base price");
      } catch (priceErr) {
        return rejectWithValue(priceErr.message);
      }

      const extraVariants = [];
      const normalizedVariantCodes = [];
      for (let i = 0; i < (productData.variants || []).length; i++) {
        const v = productData.variants[i];
        let vPrice;
        try {
          const variantPriceData = {
            base: v.price?.base,
            sale: v.price?.sale,
          };
          if (v.wholesale) {
            variantPriceData.wholesaleBase = v.price?.wholesaleBase ?? v.wholesaleBase;
            variantPriceData.wholesaleSale = v.price?.wholesaleSale ?? v.wholesaleSale;
          }
          vPrice = buildPriceObj(variantPriceData, `Variant ${i + 1} base price`);
        } catch (priceErr) {
          return rejectWithValue(priceErr.message);
        }

        const wholesaleEligible = v.wholesale && (v.wholesaleBase > 0 || v.price?.wholesaleBase > 0);
        const wholesaleVisibility = wholesaleEligible ? "active" : "draft";

        let normalizedVariantProductCode;
        try {
          normalizedVariantProductCode = normalizeProductCode(v.ProductCode, `Variant ${i + 1} ProductCode`);
        } catch (codeErr) {
          return rejectWithValue(codeErr.message);
        }
        normalizedVariantCodes.push(normalizedVariantProductCode);

        extraVariants.push({
          productCode: normalizedVariantProductCode,
          attributes: (v.attributes || []).filter((a) => a.key && a.value),
          price: vPrice,
          inventory: buildInventoryObj(v.inventory),
          isActive: v.isActive !== false,
          wholesale: v.wholesale || false,
          minimumOrderQuantity: v.wholesale ? (parseInt(v.minimumOrderQuantity) || 1) : 1,
          channelVisibility: {
            ecomm: v.channelVisibility?.ecomm || "active",
            wholesale: wholesaleVisibility,
          },
          ...buildVariantCatalogApiPayload({
            title: v.title,
            description: v.description,
            shipping: v.shipping,
          }),
        });
      }

      const primaryWholesaleEligible = productData.wholesale && (productData.wholesaleBase > 0);
      const primaryWholesaleVisibility = primaryWholesaleEligible ? "active" : "draft";

      let normalizedMainProductCode;
      try {
        normalizedMainProductCode = normalizeProductCode(productData.ProductCode, "Main ProductCode");
      } catch (codeErr) {
        return rejectWithValue(codeErr.message);
      }

      try {
        validateProductCodeSeries(
          [normalizedMainProductCode, ...normalizedVariantCodes],
          "create product variants"
        );
      } catch (seriesErr) {
        return rejectWithValue(seriesErr.message);
      }

      const primaryVariant = {
        productCode: normalizedMainProductCode,
        attributes: [],
        price: primaryPrice,
        inventory: buildInventoryObj(productData.inventory),
        isActive: true,
        wholesale: productData.wholesale || false,
        minimumOrderQuantity: productData.wholesale ? (parseInt(productData.minimumOrderQuantity) || 1) : 1,
        channelVisibility: {
          ecomm: "active",
          wholesale: primaryWholesaleVisibility,
        },
      };

      fd.append("variants", JSON.stringify([primaryVariant, ...extraVariants]));

      productImageFiles.forEach((img) => fd.append("variantImages_0", img.file));
      (productData.variants || []).forEach((variant, vIdx) => {
        const realIndex = vIdx + 1;
        (variant.images || []).forEach((img) => {
          if (img?.file instanceof File) fd.append(`variantImages_${realIndex}`, img.file);
        });
      });

      const response = await wholesaleAxios.post("/admin/products", fd, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 300000,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      });

      if (response.data.success) return response.data.product;
      return rejectWithValue(response.data.message || "Failed to create product");
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || error.message || "Failed to create product");
    }
  }
);

const adminProductCreateSlice = createSlice({
  name: "adminProductCreate",
  initialState: { loading: false, error: null, success: false, createdProduct: null },
  reducers: {
    resetCreateSuccess: (state) => { state.success = false; state.createdProduct = null; },
    resetCreateError: (state) => { state.error = null; },
    resetCreateState: () => ({ loading: false, error: null, success: false, createdProduct: null }),
  },
  extraReducers: (builder) => {
    builder
      .addCase(createProduct.pending, (state) => { state.loading = true; state.error = null; state.success = false; state.createdProduct = null; })
      .addCase(createProduct.fulfilled, (state, { payload }) => { state.loading = false; state.success = true; state.createdProduct = payload; })
      .addCase(createProduct.rejected, (state, { payload }) => { state.loading = false; state.error = payload || "Failed to create product"; });
  },
});

export const { resetCreateSuccess, resetCreateError, resetCreateState } = adminProductCreateSlice.actions;
export default adminProductCreateSlice.reducer;
