// PRODUCT_MODAL_SEGMENT/EditProductModal.jsx

import React, { useState, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import ProductFormBody from "../Shared_components/ProductFormBody";
import VariantModal, { defaultVariant } from "../Shared_components/VariantModal";
import CategoryModal from "../Shared_components/CategoryModal";
import BrandModal from "../Shared_components/BrandModal";
import AttributeModal from "../Shared_components/AttributeModal";
import CustomMessageModal from "../Shared_components/CustomMessageModal";
import {
  updateProduct,
  addVariantToProduct,
  updateVariantByBarcode,
  deleteVariantFromProduct,
  resetUpdateSuccess,
  resetVariantError,
  isVariantWholesaleEligible,
  getWholesaleVisibility,
} from "../ADMIN_REDUX_MANAGEMENT/adminEditProductSlice";
import { shippingFormFromVariant } from "../../../utils/variantCatalogForm";
import {
  applyVariantMergeToFormData,
  resolvePrimaryAttributes,
} from "../../../utils/editProductVariantMerge";

const formatIndianRupee = (amount) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency", currency: "INR",
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(amount);

const getDiscountPercentage = (base, sale) => {
  if (!base || !sale || Number(sale) >= Number(base)) return 0;
  return Math.round(((Number(base) - Number(sale)) / Number(base)) * 100);
};

const attrId = (a, fallback) => a?.id ?? a?._id ?? fallback;

const normaliseAttributes = (attributes = [], prefix = "attr") =>
  (Array.isArray(attributes) ? attributes : []).map((a, i) => ({
    ...a,
    key: a?.key || "",
    value: a?.value || "",
    id: String(attrId(a, `${prefix}-${i}`)),
  }));

// NORMALIZE: ALWAYS use price.wholesaleBase, NEVER direct wholesaleBase
const normaliseVariants = (variants = []) =>
  variants.map((v, vIdx) => ({
    ...v,
    price: {
      base: v.price?.base ?? "",
      sale: v.price?.sale ?? "",
      wholesaleBase: v.price?.wholesaleBase ?? "",
      wholesaleSale: v.price?.wholesaleSale ?? ""
    },
    attributes: normaliseAttributes(v.attributes || [], `v${vIdx}-attr`),
    images: (v.images || [])
      .slice()
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((img, iIdx) => ({
        ...img,
        id: img._id || img.publicId || img.url || `var-${vIdx}-img-${iIdx}`,
        isMain: iIdx === 0,
      })),
    isActive:
      v.channelVisibility?.ecomm != null
        ? v.channelVisibility.ecomm === "active"
        : v.isActive !== false,
    wholesale: v.wholesale || false,
    minimumOrderQuantity: v.minimumOrderQuantity || 1,
    channelVisibility: v.channelVisibility || { ecomm: "active", wholesale: "draft" },
    title: v.title || "",
    description: v.description || "",
    shipping: v.shipping || undefined,
  }));

const toFormData = (product) => {
  const productAttributes = normaliseAttributes(product.attributes || [], "attr");
  const variants = normaliseVariants(product.variants || []);

  // Edit UI shows variants[0].attributes — seed from product.attributes when primary is empty
  if (variants[0] && !(variants[0].attributes || []).length && productAttributes.length) {
    variants[0] = { ...variants[0], attributes: productAttributes };
  }

  return {
    name: product.name || "",
    title: product.title || "",
    description: product.description || "",
    brand: product.brand || "Generic",
    category: typeof product.category === "object" && product.category !== null ? product.category._id : product.category || "",
    hsnCode: product.hsnCode || "",
    taxRate: product.gstRate ?? "",
    isFragile: product.isFragile || false,
    shipping: { ...(product.shipping || { weight: 0, dimensions: { length: "", width: "", height: "" } }) },
    soldInfo: product.soldInfo || { enabled: false, count: 0 },
    fomo: product.fomo || { enabled: false, type: "viewing_now", viewingNow: 0, productLeft: 0, customMessage: "" },
    images: (product.images || []).map((img, i) => ({ ...img, id: img._id || img.publicId || img.url || `main-img-${i}`, isMain: img.isMain || i === 0 })),
    attributes: productAttributes,
    variants,
    isFeatured: product.isFeatured || false,
    status: product.status || "draft",
  };
};

const EditProductModal = ({ product, onClose, brands, setBrands }) => {
  const dispatch = useDispatch();

  const {
    updateLoading, updateError, updateSuccess,
    actionLoading, actionError,
    variantLoading, variantError,
  } = useSelector((s) => s.adminEditProduct);
  const { categories } = useSelector((s) => s.categories);

  const [formData, setFormData] = useState(() => toFormData(product));
  const [variantForm, setVariantForm] = useState(defaultVariant);
  const [editingVariantIndex, setEditingVariantIndex] = useState(null);
  const [variantSaveError, setVariantSaveError] = useState(null);
  const [submitError, setSubmitError] = useState(null);

  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showBrandModal, setShowBrandModal] = useState(false);
  const [showAttributeModal, setShowAttributeModal] = useState(false);
  const [showCustomMessageModal, setShowCustomMessageModal] = useState(false);
  const [showVariantModal, setShowVariantModal] = useState(false);
  const [editingAttribute, setEditingAttribute] = useState(null); // null = add mode, object = edit mode
  useEffect(() => { setFormData(toFormData(product)); }, [product._id]);
  useEffect(() => { if (updateSuccess) { dispatch(resetUpdateSuccess()); onClose(); } }, [updateSuccess, dispatch, onClose]);
  useEffect(() => { if (!showVariantModal) { setVariantSaveError(null); dispatch(resetVariantError()); } }, [showVariantModal, dispatch]);

  const openAddVariant = () => {
    setVariantForm(defaultVariant);
    setEditingVariantIndex(null);
    setVariantSaveError(null);
    setShowVariantModal(true);
  };

  const openEditVariant = (index) => {
    if (index === 0) return;
    const v = formData.variants[index];
    if (!v) return;
    setVariantForm({
      ProductCode: v.productCode != null ? String(v.productCode) : "",
      attributes: v.attributes?.length > 0 ? v.attributes.map((a) => ({ key: a.key || "", value: a.value || "" })) : [{ key: "", value: "" }],
      price: { 
        base: v.price?.base ?? "", 
        sale: v.price?.sale ?? "", 
        wholesaleBase: v.price?.wholesaleBase ?? "", 
        wholesaleSale: v.price?.wholesaleSale ?? "" 
      },
      inventory: {
        quantity: v.inventory?.quantity ?? 0,
        lowStockThreshold: v.inventory?.lowStockThreshold ?? 5,
        trackInventory: v.inventory?.trackInventory !== false,
      },
      images: v.images || [],
      isActive: v.isActive !== false,
      wholesale: v.wholesale || false,
      minimumOrderQuantity: v.minimumOrderQuantity || 1,
      channelVisibility: v.channelVisibility || { ecomm: "active", wholesale: "draft" },
      title: v.title || "",
      description: v.description || "",
      shipping: shippingFormFromVariant(v, formData.shipping, formData),
    });
    setEditingVariantIndex(index);
    setVariantSaveError(null);
    setShowVariantModal(true);
  };

  const closeVariantModal = () => {
    setShowVariantModal(false);
    setVariantForm(defaultVariant);
    setEditingVariantIndex(null);
  };

  const handleVariantSave = async (variantToSave) => {
    setVariantSaveError(null);

    // CRITICAL: Build price object with wholesaleBase INSIDE price
    const pricePayload = {
      base: parseFloat(variantToSave.price.base) || 0,
      sale: variantToSave.price.sale ? parseFloat(variantToSave.price.sale) : null,
      wholesaleBase: variantToSave.wholesale ? (parseFloat(variantToSave.price.wholesaleBase) || 0) : undefined,
      wholesaleSale: variantToSave.wholesale ? (variantToSave.price.wholesaleSale ? parseFloat(variantToSave.price.wholesaleSale) : null) : undefined,
    };

    // Calculate wholesale visibility automatically
    const wholesaleVisibility = (variantToSave.wholesale && pricePayload.wholesaleBase > 0) ? "active" : "draft";
    const channelVisibilityPayload = {
      ecomm: variantToSave.channelVisibility?.ecomm || "active",
      wholesale: wholesaleVisibility,
    };

    if (editingVariantIndex !== null) {
      const existingProductCode = formData.variants[editingVariantIndex].productCode;
      try {
        const variantUpdatePayload = {
          slug: product.slug,
          barcode: existingProductCode,
          price: pricePayload,
          inventory: variantToSave.inventory,
          attributes: variantToSave.attributes,
          images: variantToSave.images,
          isActive: variantToSave.isActive,
          wholesale: variantToSave.wholesale,
          minimumOrderQuantity: variantToSave.minimumOrderQuantity,
          channelVisibility: channelVisibilityPayload,
        };
        if (editingVariantIndex > 0) {
          variantUpdatePayload.variantTitle = variantToSave.title;
          variantUpdatePayload.variantDescription = variantToSave.description;
          variantUpdatePayload.variantShipping = variantToSave.shipping;
        }
        const result = await dispatch(updateVariantByBarcode(variantUpdatePayload)).unwrap();
        if (result?.product?.variants) {
          const savedIdx = editingVariantIndex;
          setFormData((prev) =>
            applyVariantMergeToFormData(prev, result.product.variants, normaliseVariants, savedIdx)
          );
        }
        closeVariantModal();
      } catch (err) {
        setVariantSaveError(typeof err === "string" ? err : err?.message || "Failed to save variant");
      }
    } else {
      try {
        const result = await dispatch(addVariantToProduct({
          slug: product.slug,
          variantData: {
            ...variantToSave,
            price: pricePayload,
            channelVisibility: channelVisibilityPayload,
          }
        })).unwrap();
        if (result?.product?.variants) {
          setFormData((prev) =>
            applyVariantMergeToFormData(prev, result.product.variants, normaliseVariants, null)
          );
        }
        closeVariantModal();
      } catch (err) {
        setVariantSaveError(typeof err === "string" ? err : err?.message || "Failed to add variant");
      }
    }
  };

  const toggleVariantActive = async (index) => {
    const variant = formData.variants[index];
    if (!variant) return;
    const newActiveState = !variant.isActive;
    const newEcommVisibility = newActiveState ? "active" : "draft";

    const prevVariants = formData.variants;
    setFormData((p) => ({
      ...p,
      variants: p.variants.map((v, i) => i === index
        ? { ...v, isActive: newActiveState, channelVisibility: { ...v.channelVisibility, ecomm: newEcommVisibility } }
        : v)
    }));

    try {
      const result = await dispatch(updateVariantByBarcode({
        slug: product.slug,
        barcode: variant.productCode,
        isActive: newActiveState,
        channelVisibility: { ecomm: newEcommVisibility },
      })).unwrap();
      if (result?.product?.variants) {
        setFormData((p) =>
          applyVariantMergeToFormData(p, result.product.variants, normaliseVariants, index)
        );
      }
    } catch (err) {
      setFormData((p) => ({ ...p, variants: prevVariants }));
      alert(`Toggle failed: ${typeof err === "string" ? err : err?.message || "Unknown error"}`);
    }
  };

  const handleDeleteVariant = (index) => {
    if (index === 0) { alert("Cannot delete the main variant. It is the product itself."); return; }
    const variant = formData.variants[index];
    if (!variant?.productCode && variant?.productCode !== 0) { alert("Cannot delete — variant has no productCode"); return; }
    if (!window.confirm(`Delete variant (productCode: ${variant.productCode})? This cannot be undone.`)) return;
    const prevVariants = formData.variants;
    setFormData((p) => ({ ...p, variants: p.variants.filter((_, i) => i !== index) }));
    dispatch(deleteVariantFromProduct({ slug: product.slug, barcode: variant.productCode }))
      .unwrap()
      .then(({ product: updated }) => {
        if (updated?.variants) {
          setFormData((p) =>
            applyVariantMergeToFormData(p, updated.variants, normaliseVariants, null)
          );
        }
      })
      .catch((err) => {
        setFormData((p) => ({ ...p, variants: prevVariants }));
        alert(`Delete failed: ${typeof err === "string" ? err : err?.message || "Unknown error"}`);
      });
  };

  const openAddAttributeModal = () => { setEditingAttribute(null); setShowAttributeModal(true); };
  const openEditAttributeModal = (attr) => { setEditingAttribute(attr); setShowAttributeModal(true); };
  const closeAttributeModal = () => { setShowAttributeModal(false); setEditingAttribute(null); };

  const handleAttributeSave = (a) =>
    setFormData((p) => {
      const v = [...(p.variants || [])];
      if (!v[0]) return p;
      const current = v[0].attributes || [];
      const editId = a?.id != null ? String(a.id) : editingAttribute ? String(attrId(editingAttribute)) : null;
      const next = editingAttribute
        ? current.map((x) =>
            String(attrId(x)) === editId
              ? { ...x, key: a.key, value: a.value, id: editId }
              : x
          )
        : [...current, { key: a.key, value: a.value, id: String(a.id ?? Date.now()) }];
      v[0] = { ...v[0], attributes: next };
      // Keep product-level attributes in sync with primary variant (edit UI source of truth)
      return { ...p, variants: v, attributes: next };
    });
  const removeAttribute = (id) =>
    setFormData((p) => {
      const v = [...(p.variants || [])];
      if (!v[0]) return p;
      const removeId = id != null ? String(id) : null;
      const next = (v[0].attributes || []).filter((a) => String(attrId(a)) !== removeId);
      v[0] = { ...v[0], attributes: next };
      return { ...p, variants: v, attributes: next };
    });
  const handleCustomMessageSave = (msg) => setFormData((p) => ({ ...p, fomo: { ...p.fomo, customMessage: msg } }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError(null);
    if (!formData.name.trim()) { alert("Product name is required"); return; }
    if (!formData.title.trim()) { alert("Product title is required"); return; }
    if (!formData.category) { alert("Please select a category"); return; }

    const mainVariant = formData.variants?.[0];
    if (mainVariant?.productCode != null) {
      const base = parseFloat(mainVariant.price?.base);
      if (!base || base <= 0) {
        alert("Main variant base price is required and must be greater than 0");
        return;
      }
      const sale = mainVariant.price?.sale !== "" && mainVariant.price?.sale != null ? parseFloat(mainVariant.price.sale) : null;
      if (sale !== null && sale >= base) {
        alert("Main variant sale price must be less than base price");
        return;
      }

      // CRITICAL: Build price with wholesaleBase INSIDE price object
      const pricePayload = {
        base: base,
        sale: sale,
        wholesaleBase: mainVariant.wholesale ? (parseFloat(mainVariant.price?.wholesaleBase) || 0) : undefined,
        wholesaleSale: mainVariant.wholesale ? (mainVariant.price?.wholesaleSale ? parseFloat(mainVariant.price.wholesaleSale) : null) : undefined,
      };

      // Calculate wholesale visibility automatically
      const wholesaleVisibility = (mainVariant.wholesale && pricePayload.wholesaleBase > 0) ? "active" : "draft";
      const channelVisibilityPayload = {
        ecomm: mainVariant.channelVisibility?.ecomm || "active",
        wholesale: wholesaleVisibility,
      };

      const primaryAttributes = resolvePrimaryAttributes(formData);

      try {
        const result = await dispatch(updateVariantByBarcode({
          slug: product.slug,
          barcode: mainVariant.productCode,
          price: pricePayload,
          inventory: mainVariant.inventory,
          isActive: mainVariant.isActive,
          images: mainVariant.images,
          wholesale: mainVariant.wholesale,
          minimumOrderQuantity: mainVariant.minimumOrderQuantity,
          channelVisibility: channelVisibilityPayload,
          attributes: primaryAttributes,
        })).unwrap();

        if (result?.product?.variants) {
          setFormData((prev) =>
            applyVariantMergeToFormData(prev, result.product.variants, normaliseVariants, 0)
          );
        }

        await dispatch(updateProduct({
          slug: product.slug,
          formData: {
            ...formData,
            attributes: primaryAttributes,
            gstRate: formData.taxRate,
          }
        })).unwrap();
        
      } catch (err) {
        setSubmitError(`Save failed: ${typeof err === "string" ? err : err?.message || "Unknown error"}`);
        return;
      }
    } else {
      // No main variant? Just update product fields
      dispatch(updateProduct({
        slug: product.slug,
        formData: { ...formData, gstRate: formData.taxRate }
      }));
    }
  };

  const isAnySaving = updateLoading || variantLoading || actionLoading;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-6xl w-full my-8 shadow-2xl">
        <div className="p-6 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white rounded-t-2xl z-10">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Edit Product</h2>
            <p className="text-sm text-gray-500 mt-1"><span className="font-medium text-gray-700">{product.name}</span><span className="ml-2 text-xs text-indigo-400 font-mono">{product.slug}</span></p>
          </div>
          <button type="button" onClick={onClose} disabled={isAnySaving} className="p-2 hover:bg-gray-100 rounded-xl disabled:opacity-50 transition-colors">
            <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {(updateError || submitError) && (
          <div className="mx-6 mt-4 p-4 bg-red-50 border border-red-200 rounded-xl">
            <p className="text-red-700 text-sm font-medium">❌😢 {submitError || updateError}</p>
          </div>
        )}
        {actionError && (
          <div className="mx-6 mt-2 p-3 bg-red-50 border border-red-200 rounded-xl">
            <p className="text-red-700 text-sm font-medium">❌ 😁{actionError}</p>
          </div>
        )}
        {isAnySaving && (
          <div className="mx-6 mt-2 p-3 bg-indigo-50 border border-indigo-200 rounded-xl flex items-center gap-2">
            <span className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-indigo-700 text-sm font-medium">Saving…</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6">
          <ProductFormBody
            formData={formData}
            setFormData={setFormData}
            categories={categories}
            brands={brands}
            onOpenCategoryModal={() => setShowCategoryModal(true)}
            onOpenBrandModal={() => setShowBrandModal(true)}
            // onOpenAttributeModal={() => setShowAttributeModal(true)}
            onOpenAttributeModal={openAddAttributeModal}
            onEditAttribute={openEditAttributeModal}
            onOpenCustomMessage={() => setShowCustomMessageModal(true)}
            onOpenAddVariant={openAddVariant}
            onOpenEditVariant={openEditVariant}
            onRemoveAttribute={removeAttribute}
            onDeleteVariant={handleDeleteVariant}
            onToggleVariantActive={toggleVariantActive}
            formatIndianRupee={formatIndianRupee}
            getDiscountPercentage={getDiscountPercentage}
            productSlug={product.slug}
            actionLoading={variantLoading || actionLoading}
            actionError={variantError || actionError}
          />
          <div className="flex gap-3 mt-6">
            <button type="button" onClick={onClose} disabled={isAnySaving} className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 disabled:opacity-60 transition-colors">Cancel</button>
            <button type="submit" disabled={isAnySaving} className="flex-1 px-4 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white font-semibold rounded-lg hover:from-green-700 hover:to-emerald-700 disabled:opacity-60 flex items-center justify-center gap-2 transition-all">
              {isAnySaving ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Saving…</> : "💾 Save Changes"}
            </button>
          </div>
        </form>
      </div>

      {showCategoryModal && (<CategoryModal onSelect={(catId) => setFormData((p) => ({ ...p, category: catId }))} onClose={() => setShowCategoryModal(false)} />)}
      {showBrandModal && (<BrandModal brands={brands} setBrands={setBrands} onSelect={(brand) => setFormData((p) => ({ ...p, brand }))} onClose={() => setShowBrandModal(false)} />)}
      {/* {showAttributeModal && (<AttributeModal onAdd={handleAddAttribute} onClose={() => setShowAttributeModal(false)} />)} */}
      {showAttributeModal && (<AttributeModal initialValue={editingAttribute} onAdd={handleAttributeSave} onClose={closeAttributeModal} />)}
      {showCustomMessageModal && (<CustomMessageModal currentMessage={formData.fomo.customMessage} onSave={handleCustomMessageSave} onClose={() => setShowCustomMessageModal(false)} />)}
      {showVariantModal && (
        <VariantModal
          variantForm={variantForm}
          setVariantForm={setVariantForm}
          editingVariantIndex={editingVariantIndex}
          onSave={handleVariantSave}
          onClose={closeVariantModal}
          getDiscountPercentage={getDiscountPercentage}
          isSaving={variantLoading || updateLoading}
          saveError={variantSaveError || variantError}
        />
      )}
    </div>
  );
};

export default EditProductModal;

