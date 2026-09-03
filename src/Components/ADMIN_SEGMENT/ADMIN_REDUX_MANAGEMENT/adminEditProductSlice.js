// ADMIN_REDUX_MANAGEMENT/adminEditProductSlice.js

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
  if (!base) throw new Error(`${label} is required and must be greater than 0`);
  const saleRaw = toNum(price?.sale);
  const sale = price?.sale !== "" && price?.sale != null && saleRaw !== undefined ? saleRaw : null;

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

const cleanAttributesForApi = (attributes) =>
  Array.isArray(attributes)
    ? attributes.filter((a) => a?.key && a?.value).map((a) => ({ key: a.key, value: a.value }))
    : [];

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

export const isVariantWholesaleEligible = (variant) => {
  if (!variant) return false;
  const wholesaleFlag = variant.wholesale === true;
  const wholesaleBase = variant.price?.wholesaleBase ? parseFloat(variant.price.wholesaleBase) : 0;
  return wholesaleFlag && wholesaleBase > 0;
};

export const getWholesaleVisibility = (variant) => {
  return isVariantWholesaleEligible(variant) ? "active" : "draft";
};

export const updateProduct = createAsyncThunk(
  "adminEditProduct/update",
  async ({ slug, formData: pd }, { rejectWithValue }) => {
    try {
      const fd = new FormData();

      if (pd.name) fd.append("name", pd.name);
      if (pd.title) fd.append("title", pd.title);
      if (pd.description) fd.append("description", pd.description);
      if (pd.category) fd.append("category", pd.category);
      if (pd.brand) fd.append("brand", pd.brand);
      if (pd.isFeatured !== undefined) fd.append("isFeatured", String(pd.isFeatured));
      if (pd.hsnCode) fd.append("hsnCode", pd.hsnCode);
      if (pd.taxRate !== undefined && pd.taxRate !== "") fd.append("gstRate", String(pd.taxRate));
      if (pd.isFragile !== undefined) fd.append("isFragile", String(pd.isFragile));

      const shippingData = {
        ...pd.shipping,
        weight: pd.shipping?.weight || 0,
        dimensions: pd.shipping?.dimensions || { length: 0, width: 0, height: 0 },
      };
      fd.append("shipping", JSON.stringify(shippingData));

      if (pd.soldInfo) fd.append("soldInfo", JSON.stringify(buildSoldInfoForApi(pd.soldInfo)));
      if (pd.fomo) fd.append("fomo", JSON.stringify(buildFomoForApi(pd.fomo)));
      // Always send, even empty array — otherwise deleting the last attribute never persists
      fd.append("attributes", JSON.stringify(cleanAttributesForApi(pd.attributes)));

      const res = await wholesaleAxios.put(`/admin/products/${slug}`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      if (res.data.success) return { product: res.data.product };
      return rejectWithValue(res.data.message || "Update failed");
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

export const updateVariantByBarcode = createAsyncThunk(
  "adminVariants/updateByBarcode",
  async (
    {
      slug,
      barcode,
      price,
      inventory,
      attributes,
      isActive,
      images,
      wholesale,
      minimumOrderQuantity,
      channelVisibility,
      variantTitle,
      variantDescription,
      shipping: variantShipping,
    },
    { rejectWithValue }
  ) => {
    try {
      const fd = new FormData();
      fd.append("productCode", String(barcode));

      if (price !== undefined) {
        let pricePayload;
        try {
          pricePayload = buildPriceObj(price, "Variant base price");
        } catch (e) {
          return rejectWithValue(e.message);
        }
        fd.append("price", JSON.stringify(pricePayload));
      }

      if (inventory !== undefined) {
        fd.append("inventory", JSON.stringify(buildInventoryObj(inventory)));
      }

      if (attributes !== undefined) {
        fd.append("attributes", JSON.stringify(cleanAttributesForApi(attributes)));
      }

      if (isActive !== undefined) fd.append("isActive", String(isActive));
      if (wholesale !== undefined) fd.append("wholesale", String(wholesale));
      if (minimumOrderQuantity !== undefined) fd.append("minimumOrderQuantity", String(minimumOrderQuantity));

      if (channelVisibility !== undefined) {
        fd.append("channelVisibility", JSON.stringify(channelVisibility));
      }

      const catalogPayload = buildVariantCatalogApiPayload({
        title: variantTitle,
        description: variantDescription,
        shipping: variantShipping,
      });
      if (catalogPayload.title) fd.append("variantTitle", catalogPayload.title);
      if (catalogPayload.description) fd.append("variantDescription", catalogPayload.description);
      if (catalogPayload.shipping) fd.append("shipping", JSON.stringify(catalogPayload.shipping));

      if (images !== undefined && images !== null) {
        const existingImages = images.filter((img) => img.url && !(img.file instanceof File));
        const newFiles = images.filter((img) => img.file instanceof File);

        if (existingImages.length > 0) {
          const sorted = [...existingImages].sort((a, b) => {
            if (a.isMain && !b.isMain) return -1;
            if (!a.isMain && b.isMain) return 1;
            return 0;
          });
          const existingPayload = sorted.map((img, i) => ({
            url: img.url,
            publicId: img.publicId || img.public_id || "",
            altText: img.altText || "",
            order: i,
          }));
          fd.append("existingImages", JSON.stringify(existingPayload));
        }

        newFiles.forEach((img) => {
          fd.append("variantImages", img.file);
        });
      }

      const res = await wholesaleAxios.put(`/admin/products/${slug}`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 150000,
      });
      if (res.data.success) return { product: res.data.product };
      return rejectWithValue(res.data.message || "Variant update failed");
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

export const addVariantToProduct = createAsyncThunk(
  "adminVariants/add",
  async ({ slug, variantData }, { rejectWithValue }) => {
    try {
      const rawCode = variantData.ProductCode ?? variantData.productCode;
      if (!rawCode && rawCode !== 0) return rejectWithValue("ProductCode is required to add a variant");
      const upper = String(rawCode).trim().toUpperCase();
      const m = upper.match(/^([A-Z0-9]+)-(\d+)$/);
      const seq = m ? Number(m[2]) : NaN;
      if (!m || !Number.isInteger(seq) || seq < 1) {
        return rejectWithValue("ProductCode must be BASE-N (e.g., 3897-1 or 3897-01)");
      }
      const canonicalProductCode = `${m[1]}-${seq}`;

      const fd = new FormData();
      fd.append("productCode", canonicalProductCode);

      let pricePayload;
      try {
        pricePayload = buildPriceObj(variantData.price, "Variant base price");
      } catch (e) {
        return rejectWithValue(e.message);
      }
      fd.append("price", JSON.stringify(pricePayload));

      fd.append("attributes", JSON.stringify(cleanAttributesForApi(variantData.attributes)));
      fd.append("inventory", JSON.stringify(buildInventoryObj(variantData.inventory || {})));
      fd.append("isActive", variantData.isActive !== false ? "true" : "false");
      fd.append("wholesale", variantData.wholesale ? "true" : "false");
      if (variantData.minimumOrderQuantity) fd.append("minimumOrderQuantity", String(variantData.minimumOrderQuantity));

      if (variantData.channelVisibility) {
        fd.append("channelVisibility", JSON.stringify(variantData.channelVisibility));
      }

      const catalogPayload = buildVariantCatalogApiPayload({
        title: variantData.title,
        description: variantData.description,
        shipping: variantData.shipping,
      });
      if (catalogPayload.title) fd.append("title", catalogPayload.title);
      if (catalogPayload.description) fd.append("description", catalogPayload.description);
      if (catalogPayload.shipping) fd.append("shipping", JSON.stringify(catalogPayload.shipping));

      if (variantData.images?.length) {
        variantData.images.forEach((img) => {
          if (img?.file instanceof File) fd.append("variantImages", img.file);
        });
      }

      const res = await wholesaleAxios.post(`/admin/products/${slug}/variants`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      if (res.data.success) return { product: res.data.product };
      return rejectWithValue(res.data.message || "Add variant failed");
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

export const softDeleteProduct = createAsyncThunk(
  "adminEditProduct/softDelete",
  async (slug, { rejectWithValue }) => {
    try {
      const response = await wholesaleAxios.delete(`/admin/products/${slug}`);
      if (response.data.success) return { slug, product: response.data.product };
      return rejectWithValue(response.data.message || "Archive failed");
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || error.message);
    }
  }
);

export const toggleFeaturedProduct = createAsyncThunk(
  "adminEditProduct/toggleFeatured",
  async ({ product }, { rejectWithValue }) => {
    try {
      const res = await wholesaleAxios.put(`/admin/products/${product.slug}`, { isFeatured: !product.isFeatured });
      if (res.data.success) return { product: res.data.product };
      return rejectWithValue(res.data.message || "Toggle featured failed");
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

export const changeProductStatus = createAsyncThunk(
  "adminEditProduct/changeStatus",
  async ({ product, status }, { rejectWithValue }) => {
    try {
      const res = await wholesaleAxios.put(`/admin/products/${product.slug}`, { status });
      if (res.data.success) return { product: res.data.product };
      return rejectWithValue(res.data.message || "Status change failed");
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

export const deleteVariantFromProduct = createAsyncThunk(
  "adminVariants/delete",
  async ({ slug, barcode }, { rejectWithValue }) => {
    try {
      const res = await wholesaleAxios.delete(`/admin/products/${slug}/variants`, { data: { productCode: barcode } });
      if (res.data.success) return { product: res.data.product };
      return rejectWithValue(res.data.message || "Delete variant failed");
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

const adminEditProductSlice = createSlice({
  name: "adminEditProduct",
  initialState: {
    updateLoading: false,
    updateError: null,
    updateSuccess: false,
    actionLoading: false,
    actionError: null,
    variantLoading: false,
    variantError: null,
    deleteLoading: false,
    deleteError: null,
    deleteSuccess: false,
  },
  reducers: {
    resetUpdateSuccess: (s) => { s.updateSuccess = false; },
    resetUpdateError: (s) => { s.updateError = null; },
    resetActionError: (s) => { s.actionError = null; },
    resetVariantError: (s) => { s.variantError = null; },
    resetDeleteSuccess: (s) => { s.deleteSuccess = false; },
    clearErrors: (s) => {
      s.updateError = null;
      s.actionError = null;
      s.variantError = null;
      s.deleteError = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(updateProduct.pending, (s) => { s.updateLoading = true; s.updateError = null; s.updateSuccess = false; })
      .addCase(updateProduct.fulfilled, (s) => { s.updateLoading = false; s.updateSuccess = true; })
      .addCase(updateProduct.rejected, (s, { payload }) => { s.updateLoading = false; s.updateError = payload; })

      .addCase(updateVariantByBarcode.pending, (s) => { s.variantLoading = true; s.variantError = null; })
      .addCase(updateVariantByBarcode.fulfilled, (s) => { s.variantLoading = false; })
      .addCase(updateVariantByBarcode.rejected, (s, { payload }) => { s.variantLoading = false; s.variantError = payload; })

      .addCase(addVariantToProduct.pending, (s) => { s.variantLoading = true; s.variantError = null; })
      .addCase(addVariantToProduct.fulfilled, (s) => { s.variantLoading = false; })
      .addCase(addVariantToProduct.rejected, (s, { payload }) => { s.variantLoading = false; s.variantError = payload; })

      .addCase(softDeleteProduct.pending, (s) => { s.deleteLoading = true; s.deleteError = null; s.deleteSuccess = false; })
      .addCase(softDeleteProduct.fulfilled, (s) => { s.deleteLoading = false; s.deleteSuccess = true; })
      .addCase(softDeleteProduct.rejected, (s, { payload }) => { s.deleteLoading = false; s.deleteError = payload; })

      .addCase(toggleFeaturedProduct.pending, (s) => { s.actionLoading = true; s.actionError = null; })
      .addCase(toggleFeaturedProduct.fulfilled, (s) => { s.actionLoading = false; })
      .addCase(toggleFeaturedProduct.rejected, (s, { payload }) => { s.actionLoading = false; s.actionError = payload; })

      .addCase(changeProductStatus.pending, (s) => { s.actionLoading = true; s.actionError = null; })
      .addCase(changeProductStatus.fulfilled, (s) => { s.actionLoading = false; })
      .addCase(changeProductStatus.rejected, (s, { payload }) => { s.actionLoading = false; s.actionError = payload; })

      .addCase(deleteVariantFromProduct.pending, (s) => { s.variantLoading = true; s.variantError = null; })
      .addCase(deleteVariantFromProduct.fulfilled, (s) => { s.variantLoading = false; })
      .addCase(deleteVariantFromProduct.rejected, (s, { payload }) => { s.variantLoading = false; s.variantError = payload; });
  },
});

export const {
  resetUpdateSuccess,
  resetUpdateError,
  resetActionError,
  resetVariantError,
  resetDeleteSuccess,
  clearErrors,
} = adminEditProductSlice.actions;
export default adminEditProductSlice.reducer;
