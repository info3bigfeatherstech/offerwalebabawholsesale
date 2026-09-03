// Shared_components/ProductFormBody.jsx

import React, { useState } from "react";
import { displayNumericInput, normalizeNumericTyping, selectAllOnFocus } from "../../../utils/numericFormInput";
const TAX_RATE_OPTIONS = [
  { value: 0, label: "0% (Nil Rated)" },
  { value: 5, label: "5% (GST)" },
  { value: 12, label: "12% (GST)" },
  { value: 18, label: "18% (GST)" },
  { value: 28, label: "28% (GST)" },
];

const ProductFormBody = ({
  formData,
  setFormData,
  categories,
  brands,
  onOpenCategoryModal,
  onOpenBrandModal,
  onOpenAttributeModal,
  onEditAttribute,
  onOpenCustomMessage,
  onOpenAddVariant,
  onOpenEditVariant,
  onDeleteVariant,
  onToggleVariantActive,
  onRemoveAttribute,
  formatIndianRupee,
  getDiscountPercentage,
  productSlug,
  actionLoading = false,
  actionError = null,
}) => {
  const isEditMode = !!productSlug;
  const [draggedIdx, setDraggedIdx] = useState(null);
  const [isDraggingZone, setIsDraggingZone] = useState(false);

  const galleryImages = isEditMode ? (formData.variants?.[0]?.images || []) : (formData.images || []);

  const setGalleryImages = (updater) => {
    if (isEditMode) {
      setFormData((p) => {
        const v = [...(p.variants || [])];
        if (!v[0]) return p;
        const next = typeof updater === "function" ? updater(v[0].images || []) : updater;
        v[0] = { ...v[0], images: next };
        return { ...p, variants: v };
      });
    } else {
      setFormData((p) => {
        const next = typeof updater === "function" ? updater(p.images || []) : updater;
        return { ...p, images: next };
      });
    }
  };

  const handleGalleryUpload = (e) => {
    const files = Array.from(e.target.files);
    const current = [...galleryImages];
    files.forEach((file, i) => {
      if (current.length >= 5) return;
      const id = `gimg-${Date.now()}-${i}`;
      const reader = new FileReader();
      reader.onloadend = () => {
        current.push({ id, url: reader.result, file, name: file.name, isMain: current.length === 0 });
        setGalleryImages([...current]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removeGalleryImage = (id) =>
    setGalleryImages((imgs) => {
      const wasMain = imgs.find((img) => img.id === id || img.url === id)?.isMain;
      const next = imgs.filter((img) => img.id !== id && img.url !== id);
      if (wasMain && next.length > 0) next[0] = { ...next[0], isMain: true };
      return next;
    });

  const setMainGalleryImage = (id) =>
    setGalleryImages((imgs) => imgs.map((img) => ({ ...img, isMain: img.id === id || img.url === id })));

  const handleGalleryDragStart = (e, index) => setDraggedIdx(index);
  const handleGalleryDragOver = (e, index) => {
    e.preventDefault();
    if (draggedIdx === null || draggedIdx === index) return;
    const imgs = [...galleryImages];
    const [moved] = imgs.splice(draggedIdx, 1);
    imgs.splice(index, 0, moved);
    imgs.forEach((img, i) => { img.isMain = i === 0; });
    setGalleryImages(imgs);
    setDraggedIdx(index);
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    if (name.startsWith("shipping.dimensions.")) {
      const dim = name.split(".")[2];
      setFormData((p) => ({ ...p, shipping: { ...p.shipping, dimensions: { ...p.shipping.dimensions, [dim]: value } } }));
    } else if (name.includes(".")) {
      const [parent, child] = name.split(".");
      setFormData((p) => ({ ...p, [parent]: { ...p[parent], [child]: type === "checkbox" ? checked : value } }));
    } else {
      setFormData((p) => ({ ...p, [name]: type === "checkbox" ? checked : value }));
    }
  };

  const updateMainVariantField = (field, value) => {
    setFormData((p) => {
      const v = [...(p.variants || [])];
      if (!v[0]) return p;
      v[0] = { ...v[0], [field]: value };
      return { ...p, variants: v };
    });
  };

  const updateMainVariantPrice = (field, value) => {
    setFormData((p) => {
      const v = [...(p.variants || [])];
      if (!v[0]) return p;
      v[0] = { ...v[0], price: { ...v[0].price, [field]: value } };
      return { ...p, variants: v };
    });
  };

  const updateMainVariantInventory = (field, value) => {
    setFormData((p) => {
      const v = [...(p.variants || [])];
      if (!v[0]) return p;
      v[0] = { ...v[0], inventory: { ...v[0].inventory, [field]: value } };
      return { ...p, variants: v };
    });
  };

  const updateMainVariantChannelVisibility = (field, value) => {
    setFormData((p) => {
      const v = [...(p.variants || [])];
      if (!v[0]) return p;
      const currentVisibility = v[0].channelVisibility || { ecomm: "active", wholesale: "draft" };
      const nextVariant = {
        ...v[0],
        channelVisibility: { ...currentVisibility, [field]: value },
      };
      if (field === "ecomm") {
        nextVariant.isActive = value === "active";
      }
      v[0] = nextVariant;
      return { ...p, variants: v };
    });
  };

  const primaryVariant = isEditMode ? (formData.variants?.[0] ?? null) : null;
  const extraVariants = isEditMode ? (formData.variants?.slice(1) ?? []) : (formData.variants ?? []);
  const extraOffset = isEditMode ? 1 : 0;
  const displayedAttributes = isEditMode ? (primaryVariant?.attributes || []) : (formData.attributes || []);

  const primaryBase = formData.price?.base ?? "";
  const primarySale = formData.price?.sale ?? "";
  const primaryTrack = formData.inventory?.trackInventory ?? true;
  const primaryQty = formData.inventory?.quantity ?? "";
  const primaryLow = formData.inventory?.lowStockThreshold ?? "";

  const mainGalleryImage = galleryImages.find((img) => img.isMain) || galleryImages[0] || null;

  // Helper to determine if variant is wholesale eligible (for read-only badge)
  const isWholesaleEligible = (variant) => {
    return variant?.wholesale === true && (variant?.price?.wholesaleBase > 0);
  };

  const isWholesaleMoqUnmet = (variant) => {
    if (!variant?.wholesale) return false;
    const quantity = Number(variant?.inventory?.quantity ?? 0);
    const moq = Number(variant?.minimumOrderQuantity ?? 1);
    return moq > quantity;
  };

  // Get wholesale visibility badge text
  const getWholesaleVisibilityBadge = (variant) => {
    const isEligible = isWholesaleEligible(variant);
    if (!isEligible) return { text: "Ineligible", color: "bg-gray-100 text-gray-500" };
    const isActive = variant?.channelVisibility?.wholesale === "active";
    return isActive
      ? { text: "Active", color: "bg-purple-100 text-purple-700" }
      : { text: "Draft", color: "bg-gray-100 text-gray-500" };
  };

  // Get ecomm visibility badge text (for read-only display)
  const getEcommVisibilityBadge = (variant) => {
    const isActive = variant?.channelVisibility?.ecomm === "active";
    return isActive
      ? { text: "Active", color: "bg-green-100 text-green-700" }
      : { text: "Draft", color: "bg-gray-100 text-gray-500" };
  };


  return (
    <div className="grid grid-cols-3 gap-6">
      <div className="col-span-2 space-y-6">
        {/* Essential Details - unchanged */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="p-4 border-b border-gray-100 bg-gray-50">
            <h3 className="font-semibold text-gray-900">Essential Details</h3>
          </div>
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Product Name <span className="text-red-400">*</span></label>
                <input type="text" name="name" value={formData.name} onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))} className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-blue-500" placeholder="e.g., Premium Wireless Headphones" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Title <span className="text-red-400">*</span></label>
                <input type="text" name="title" value={formData.title} onChange={handleInputChange} className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-blue-500" placeholder="e.g., Noise Cancelling Headphones" required />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Description <span className="text-red-400">*</span></label>
              <textarea name="description" value={formData.description} onChange={handleInputChange} rows="3" className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-blue-500 resize-none" placeholder="Describe your product..." />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
                <div className="flex gap-2">
                  <select name="category" value={formData.category} onChange={handleInputChange} className="flex-1 px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500">
                    <option value="">Select category</option>
                    {categories.map((cat) => <option key={cat._id} value={cat._id}>{cat.name}</option>)}
                  </select>
                  <button type="button" onClick={onOpenCategoryModal} className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Brand</label>
                <div className="flex gap-2">
                  <select name="brand" value={formData.brand} onChange={handleInputChange} className="flex-1 px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500">
                    {brands.map((b) => <option key={b} value={b}>{b}</option>)}
                  </select>
                  <button type="button" onClick={onOpenBrandModal} className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Marketing & Visibility Panel - UPDATED with read-only channel status badges */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="p-4 border-b border-gray-100 bg-gray-50">
            <h3 className="font-semibold text-gray-900">Marketing & Visibility</h3>
          </div>
          <div className="p-4 space-y-4">
            {/* Read-only Ecom Status Badge */}

            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">Featured Product</span>
              <button type="button" onClick={() => setFormData((p) => ({ ...p, isFeatured: !p.isFeatured }))} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${formData.isFeatured ? "bg-yellow-500" : "bg-gray-300"}`}>
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${formData.isFeatured ? "translate-x-6" : "translate-x-1"}`} />
              </button>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">Sold Info</span>
                <button type="button" onClick={() => setFormData((p) => ({ ...p, soldInfo: { ...p.soldInfo, enabled: !p.soldInfo.enabled } }))} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${formData.soldInfo?.enabled ? "bg-blue-500" : "bg-gray-300"}`}>
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${formData.soldInfo?.enabled ? "translate-x-6" : "translate-x-1"}`} />
                </button>
              </div>
              {formData.soldInfo?.enabled && (
                <input type="number" value={displayNumericInput(formData.soldInfo?.count)} onFocus={selectAllOnFocus} onChange={(e) => setFormData((p) => ({ ...p, soldInfo: { ...p.soldInfo, count: normalizeNumericTyping(e.target.value) } }))} className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg" placeholder="Number sold" />
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">FOMO</span>
                <button type="button" onClick={() => setFormData((p) => ({ ...p, fomo: { ...p.fomo, enabled: !p.fomo.enabled } }))} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${formData.fomo?.enabled ? "bg-purple-500" : "bg-gray-300"}`}>
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${formData.fomo?.enabled ? "translate-x-6" : "translate-x-1"}`} />
                </button>
              </div>
              {formData.fomo?.enabled && (
                <div className="space-y-2">
                  <select value={formData.fomo.type} onChange={(e) => setFormData((p) => ({ ...p, fomo: { ...p.fomo, type: e.target.value } }))} className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg">
                    <option value="viewing_now">Viewing Now</option>
                    <option value="product_left">Product Left</option>
                    <option value="custom">Custom</option>
                  </select>
                  {formData.fomo.type === "viewing_now" && (
                    <input type="number" value={displayNumericInput(formData.fomo.viewingNow)} onFocus={selectAllOnFocus} onChange={(e) => setFormData((p) => ({ ...p, fomo: { ...p.fomo, viewingNow: normalizeNumericTyping(e.target.value) } }))} className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg" placeholder="Viewing now count" />
                  )}
                  {formData.fomo.type === "product_left" && (
                    <input type="number" value={displayNumericInput(formData.fomo.productLeft)} onFocus={selectAllOnFocus} onChange={(e) => setFormData((p) => ({ ...p, fomo: { ...p.fomo, productLeft: normalizeNumericTyping(e.target.value) } }))} className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg" placeholder="Items left" />
                  )}
                  {formData.fomo.type === "custom" && (
                    <div className="flex gap-2">
                      <input type="text" value={formData.fomo.customMessage ?? ""} readOnly className="flex-1 px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg" placeholder="Custom message" />
                      <button type="button" onClick={() => onOpenCustomMessage(formData.fomo.customMessage || "")} className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Main Variant Card - UPDATED with channel visibility toggles */}

        {isEditMode && primaryVariant && (
          <div className="bg-white rounded-xl border-2 border-indigo-300 overflow-hidden">
            <div className="p-4 border-b border-indigo-200 bg-indigo-50">
              <h3 className="font-semibold text-gray-900">Main Variant</h3>
              <p className="text-xs text-indigo-500 mt-0.5 font-mono">📦 ProductCode: {primaryVariant.productCode}</p>
            </div>

            <div className="p-4 space-y-4">
              {/* Ecom Visibility Toggle */}
              <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-200">
                <div>
                  <label className="text-sm font-semibold text-gray-700">Ecom Visibility</label>
                  <p className="text-xs text-gray-500">Show on ecommerce storefront</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const newValue = primaryVariant.channelVisibility?.ecomm === "active" ? "draft" : "active";
                    updateMainVariantChannelVisibility("ecomm", newValue);
                  }}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${primaryVariant.channelVisibility?.ecomm === "active" ? "bg-green-500" : "bg-gray-300"}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${primaryVariant.channelVisibility?.ecomm === "active" ? "translate-x-6" : "translate-x-1"}`} />
                </button>
              </div>

              {/* Wholesale Visibility Badge (read-only, calculated from price.wholesaleBase) */}
              <div className={`flex items-center justify-between p-3 rounded-lg border ${(primaryVariant.wholesale && primaryVariant.price?.wholesaleBase > 0) ? "bg-purple-50 border-purple-200" : "bg-gray-50 border-gray-200"}`}>
                <div>
                  <label className="text-sm font-semibold text-gray-700">Wholesale Visibility</label>
                  <p className="text-xs text-gray-500">Auto-calculated from wholesale price</p>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${(primaryVariant.wholesale && primaryVariant.price?.wholesaleBase > 0) ? "bg-purple-100 text-purple-700" : "bg-gray-100 text-gray-500"}`}>
                  {(primaryVariant.wholesale && primaryVariant.price?.wholesaleBase > 0) ? "Active" : "Ineligible"}
                </span>
              </div>

              {/* Price inputs */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Price (₹)</label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Base Price</label>
                    <input type="number" value={primaryVariant.price?.base ?? ""} onChange={(e) => updateMainVariantPrice("base", e.target.value)} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Sale Price</label>
                    <input type="number" value={primaryVariant.price?.sale ?? ""} onChange={(e) => updateMainVariantPrice("sale", e.target.value)} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg" />
                  </div>
                </div>
              </div>

              {/* Wholesale Toggle */}
              <div className="border-t border-gray-200 pt-4">
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-semibold text-gray-700">Wholesale Pricing</label>
                  <button type="button" onClick={() => updateMainVariantField("wholesale", !primaryVariant.wholesale)} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${primaryVariant.wholesale ? "bg-purple-500" : "bg-gray-300"}`}>
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${primaryVariant.wholesale ? "translate-x-6" : "translate-x-1"}`} />
                  </button>
                </div>
                {primaryVariant.wholesale && (
                  <div className="space-y-3 p-3 bg-purple-50 rounded-lg border border-purple-200">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Wholesale Base Price (₹)</label>
                        <input type="number" value={primaryVariant.price?.wholesaleBase ?? ""} onChange={(e) => updateMainVariantPrice("wholesaleBase", e.target.value)} className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Wholesale Sale Price (₹)</label>
                        <input type="number" value={primaryVariant.price?.wholesaleSale ?? ""} onChange={(e) => updateMainVariantPrice("wholesaleSale", e.target.value)} className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Minimum Order Quantity (MOQ)</label>
                      <input type="number" min="1" value={displayNumericInput(primaryVariant.minimumOrderQuantity)} onFocus={selectAllOnFocus} onChange={(e) => updateMainVariantField("minimumOrderQuantity", normalizeNumericTyping(e.target.value))} className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg" placeholder="1" />
                    </div>
                    {isWholesaleMoqUnmet(primaryVariant) && (
                      <p className="text-xs font-semibold text-red-600 bg-red-50 border border-red-200 rounded-lg px-2 py-1">
                        Wholesale warning: MOQ ({primaryVariant.minimumOrderQuantity ?? 1}) is greater than stock ({primaryVariant.inventory?.quantity ?? 0})
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Inventory */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-semibold text-gray-700">Inventory</label>
                  <button type="button" onClick={() => updateMainVariantInventory("trackInventory", !primaryVariant.inventory?.trackInventory)} className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors ${primaryVariant.inventory?.trackInventory !== false ? "bg-indigo-500" : "bg-gray-300"}`}>
                    <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${primaryVariant.inventory?.trackInventory !== false ? "translate-x-5" : "translate-x-0.5"}`} />
                  </button>
                </div>
                {primaryVariant.inventory?.trackInventory !== false && (
                  <div className="grid grid-cols-2 gap-3">
                    <input type="number" value={displayNumericInput(primaryVariant.inventory?.quantity)} onFocus={selectAllOnFocus} onChange={(e) => updateMainVariantInventory("quantity", normalizeNumericTyping(e.target.value))} className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg" placeholder="Quantity" />
                    <input type="number" value={displayNumericInput(primaryVariant.inventory?.lowStockThreshold)} onFocus={selectAllOnFocus} onChange={(e) => updateMainVariantInventory("lowStockThreshold", normalizeNumericTyping(e.target.value))} className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg" placeholder="Low stock alert (e.g. 5)" />
                  </div>
                )}
              </div>

            </div>
            <p className="text-xs text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-lg p-2">
              💡 Images for main variant are managed in the <strong>Product Gallery</strong> panel →. All changes here are saved when you click <strong>Save Changes</strong>.
            </p>
          </div>
        )}

        {/* CREATE MODE: ProductCode + price + inventory */}
        {!isEditMode && (
          <div className="bg-white rounded-xl border-2 border-gray-200 overflow-hidden">
            <div className="p-4 border-b border-gray-100 bg-gray-50">
              <h3 className="font-semibold text-gray-900">Product Details</h3>
              <p className="text-xs text-gray-500 mt-0.5">These become variants[0] on submit</p>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Product Code <span className="text-red-400">*</span></label>
                <input type="text" value={formData.ProductCode || ""} onChange={(e) => setFormData((p) => ({ ...p, ProductCode: e.target.value }))} className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-blue-500 font-mono" placeholder="e.g., 1234567890128" maxLength={20} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Base Price (₹) <span className="text-red-400">*</span></label>
                  <input type="number" value={primaryBase} onFocus={selectAllOnFocus} onChange={(e) => setFormData((p) => ({ ...p, price: { ...p.price, base: e.target.value } }))} className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-blue-500" placeholder="29999" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Sale Price (₹)</label>
                  <input type="number" value={primarySale} onFocus={selectAllOnFocus} onChange={(e) => setFormData((p) => ({ ...p, price: { ...p.price, sale: e.target.value } }))} className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-blue-500" placeholder="19999" />
                </div>
              </div>
              {primaryBase && primarySale && (
                <div className="p-3 bg-blue-50 rounded-lg flex items-center gap-3">
                  <span className="text-gray-400 line-through text-sm">{formatIndianRupee(primaryBase)}</span>
                  <span className="text-lg font-bold text-gray-900">{formatIndianRupee(primarySale)}</span>
                  {Number(primarySale) < Number(primaryBase) && (
                    <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded-full">{getDiscountPercentage(primaryBase, primarySale)}% OFF</span>
                  )}
                </div>
              )}

              {/* Wholesale Toggle for CREATE mode */}
              <div className="border-t border-gray-200 pt-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <label className="text-sm font-semibold text-gray-700">Wholesale Pricing</label>
                    <p className="text-xs text-gray-500 mt-0.5">Enable bulk pricing for wholesalers</p>
                  </div>
                  <button type="button" onClick={() => setFormData((p) => ({ ...p, wholesale: !p.wholesale }))} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${formData.wholesale ? "bg-purple-500" : "bg-gray-300"}`}>
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${formData.wholesale ? "translate-x-6" : "translate-x-1"}`} />
                  </button>
                </div>
                {formData.wholesale && (
                  <div className="space-y-3 p-3 bg-purple-50 rounded-lg border border-purple-200">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Wholesale Base Price (₹) <span className="text-red-400">*</span></label>
                        <input type="number" value={formData.wholesaleBase || ""} onChange={(e) => setFormData((p) => ({ ...p, wholesaleBase: e.target.value }))} className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-400" placeholder="e.g., 25000" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Wholesale Sale Price (₹)</label>
                        <input type="number" value={formData.wholesaleSale || ""} onChange={(e) => setFormData((p) => ({ ...p, wholesaleSale: e.target.value }))} className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-400" placeholder="e.g., 23000" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Minimum Order Quantity (MOQ) <span className="text-red-400">*</span></label>
                      <input type="number" min="1" value={displayNumericInput(formData.minimumOrderQuantity)} onFocus={selectAllOnFocus} onChange={(e) => setFormData((p) => ({ ...p, minimumOrderQuantity: normalizeNumericTyping(e.target.value) }))} className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-400" placeholder="Minimum quantity for wholesale price" />
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-2 border-t border-gray-100">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-gray-700">Track Inventory</span>
                  <button type="button" onClick={() => setFormData((p) => ({ ...p, inventory: { ...p.inventory, trackInventory: !p.inventory.trackInventory } }))} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${primaryTrack ? "bg-blue-500" : "bg-gray-300"}`}>
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${primaryTrack ? "translate-x-6" : "translate-x-1"}`} />
                  </button>
                </div>
                {primaryTrack && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Quantity</label>
                      <input type="number" value={displayNumericInput(primaryQty)} onFocus={selectAllOnFocus} onChange={(e) => setFormData((p) => ({ ...p, inventory: { ...p.inventory, quantity: normalizeNumericTyping(e.target.value) } }))} className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500" placeholder="Stock quantity" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Low Stock Alert</label>
                      <input type="number" value={displayNumericInput(primaryLow)} onFocus={selectAllOnFocus} onChange={(e) => setFormData((p) => ({ ...p, inventory: { ...p.inventory, lowStockThreshold: normalizeNumericTyping(e.target.value) } }))} className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500" placeholder="5" />
                    </div>
                  </div>
                )}
              </div>

            </div>
          </div>
        )}

        {/* Shipping — primary variant (variants[0]) uses product-level fields only */}
        <div id="product-shipping-section" className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="p-4 border-b border-gray-100 bg-gray-50">
            <h3 className="font-semibold text-gray-900">Shipping Details</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Main variant shipping — also the fallback for extra variants without their own weight/dimensions
            </p>
          </div>
          <div className="p-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">HSN Code </label>
              <input type="text" value={formData.hsnCode || ""} onChange={(e) => setFormData((p) => ({ ...p, hsnCode: e.target.value }))} className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-blue-500" placeholder="e.g., 180987" maxLength={10} />
              <p className="text-xs text-gray-500 mt-1">Harmonized System Nomenclature code for tax purposes</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">GST Rate </label>
              <select value={formData.taxRate ?? ""} onChange={(e) => setFormData((p) => ({ ...p, taxRate: e.target.value === "" ? "" : parseFloat(e.target.value) }))} className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-blue-500">
                <option value="">Select GST Rate</option>
                {TAX_RATE_OPTIONS.map((option) => (<option key={option.value} value={option.value}>{option.label}</option>))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">Is Fragile? </label>
              <div className="flex gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="isFragile" value="true" checked={formData.isFragile === true} onChange={() => setFormData((p) => ({ ...p, isFragile: true }))} className="w-4 h-4 text-blue-600 focus:ring-blue-500" />
                  <span className="text-sm text-gray-700">Yes (Fragile)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="isFragile" value="false" checked={formData.isFragile === false} onChange={() => setFormData((p) => ({ ...p, isFragile: false }))} className="w-4 h-4 text-blue-600 focus:ring-blue-500" />
                  <span className="text-sm text-gray-700">No</span>
                </label>
              </div>
              <p className="text-xs text-gray-500 mt-1">Indicates if special handling is required during shipping</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Weight (kg)</label>
              <input type="number" step="0.1" value={displayNumericInput(formData.shipping?.weight)} onFocus={selectAllOnFocus} onChange={(e) => setFormData((p) => ({ ...p, shipping: { ...p.shipping, weight: normalizeNumericTyping(e.target.value, { allowDecimals: true }) } }))} className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-blue-500" placeholder="0.5" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Dimensions (cm)</label>
              <div className="grid grid-cols-3 gap-2">
                {["length", "width", "height"].map((dim) => (
                  <input key={dim} type="number" step="0.1" value={displayNumericInput(formData.shipping?.dimensions?.[dim])} onFocus={selectAllOnFocus} onChange={(e) => setFormData((p) => ({ ...p, shipping: { ...p.shipping, dimensions: { ...p.shipping.dimensions, [dim]: normalizeNumericTyping(e.target.value, { allowDecimals: true }) } } }))} className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500" placeholder={dim[0].toUpperCase() + dim.slice(1)} />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Product Attributes - unchanged */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="p-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
            <h3 className="font-semibold text-gray-900">Product Attributes</h3>
            <button type="button" onClick={onOpenAttributeModal} className="px-3 py-1.5 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 whitespace-nowrap">+ Add</button>
          </div>
          <div className="p-4">
          {!displayedAttributes.length ? (
              <p className="text-center text-gray-400 py-4 text-sm">No attributes added yet</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {displayedAttributes.map((attr) => (
                  <div key={attr.id ?? attr._id ?? `${attr.key}:${attr.value}`} className="inline-flex items-center gap-2 bg-gray-50 px-3 py-1.5 rounded-lg group hover:bg-gray-100 transition-colors">
                    <span className="text-sm whitespace-nowrap"><span className="font-medium text-gray-700">{attr.key}:</span> <span className="text-gray-600">{attr.value}</span></span>
                    <button type="button" onClick={() => onEditAttribute(attr)} className="text-gray-400 hover:text-blue-500 transition-colors">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                    </button>
                    <button type="button" onClick={() => onRemoveAttribute(attr.id ?? attr._id)} className="text-gray-400 hover:text-red-500 transition-colors">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Additional Variants - UPDATED with channel visibility badges */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="p-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
            <div>
              <h3 className="font-semibold text-gray-900">{isEditMode ? "Additional Variants" : "Product Variants"}</h3>
              <p className="text-xs text-gray-500 mt-0.5">{isEditMode ? "variants[1+] · each has its own ProductCode, price, images" : "e.g., different colors or sizes — each needs a unique ProductCode"}</p>
            </div>
            <button type="button" onClick={onOpenAddVariant} disabled={actionLoading && isEditMode} className="px-3 py-1.5 bg-indigo-500 text-white text-sm rounded-lg hover:bg-indigo-600 flex items-center gap-1.5 disabled:opacity-60">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              Add Variant
            </button>
          </div>
          <div className="p-4">
            {actionError && isEditMode && (
              <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg"><p className="text-red-700 text-sm">❌😢 {actionError}</p></div>
            )}
            {extraVariants.length === 0 ? (
              <div className="text-center py-8 border-2 border-dashed border-gray-200 rounded-lg">
                <svg className="w-8 h-8 mx-auto text-gray-300 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                <p className="text-gray-400 text-sm">{isEditMode ? "No additional variants — main variant is the card above" : "No variants yet"}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {extraVariants.map((variant, idx) => {
                  const realIndex = extraOffset + idx;
                  const variantThumb = variant.images?.find((img) => img.isMain)?.url || variant.images?.[0]?.url || null;
                  const ecommBadge = getEcommVisibilityBadge(variant);
                  const wholesaleBadge = getWholesaleVisibilityBadge(variant);
                  const isEligibleForWholesale = isWholesaleEligible(variant);

                  return (
                    <div key={variant._id || variant.productCode || `v-${realIndex}`} className={`rounded-lg border-2 p-3 transition-all ${ecommBadge.text === "Active" ? "border-indigo-200 bg-indigo-50" : "border-gray-200 bg-gray-50 opacity-60"}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          {variantThumb ? (
                            <img src={variantThumb} alt="" className="w-10 h-10 rounded-lg object-cover border border-indigo-200 flex-shrink-0" />
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center flex-shrink-0">
                              <svg className="w-5 h-5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            {variant.attributes?.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 mb-1.5">
                                {variant.attributes.map((attr, aIdx) => (
                                  <span key={aIdx} className="px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700">{attr.key}: {attr.value}</span>
                                ))}
                              </div>
                            )}
                            <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-sm">
                              <span className="font-semibold text-gray-900">{formatIndianRupee(variant.price?.sale || variant.price?.base)}</span>
                              {variant.price?.sale != null && Number(variant.price.sale) > 0 && Number(variant.price.sale) < Number(variant.price.base) && (
                                <>
                                  <span className="text-gray-400 line-through text-xs">{formatIndianRupee(variant.price.base)}</span>
                                  <span className="px-1.5 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">{getDiscountPercentage(variant.price.base, variant.price.sale)}% OFF</span>
                                </>
                              )}
                              <span className="text-gray-400 text-xs">·</span>
                              <span className="text-gray-600 text-xs">Qty: {variant.inventory?.quantity ?? 0}</span>
                              {variant.productCode != null && (
                                <>
                                  <span className="text-gray-400 text-xs">·</span>
                                  <span className="text-xs font-mono text-gray-700 bg-white border border-gray-300 px-1.5 py-0.5 rounded">📦 {variant.productCode}</span>
                                </>
                              )}
                              {/* Ecom visibility badge */}
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ecommBadge.color}`}>Ecom: {ecommBadge.text}</span>
                              {/* Wholesale visibility badge - conditional on eligibility */}
                              {isEligibleForWholesale && (
                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${wholesaleBadge.color}`}>Wholesale: {wholesaleBadge.text}</span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button type="button" onClick={() => onToggleVariantActive(realIndex)} disabled={actionLoading && isEditMode} title={ecommBadge.text === "Active" ? "Click to deactivate (ecom)" : "Click to activate (ecom)"} className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-50 ${ecommBadge.text === "Active" ? "bg-indigo-500" : "bg-gray-300"}`}>
                            <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${ecommBadge.text === "Active" ? "translate-x-5" : "translate-x-1"}`} />
                          </button>
                          <button type="button" onClick={() => onOpenEditVariant(realIndex)} disabled={actionLoading && isEditMode} className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-100 rounded-lg disabled:opacity-50">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                          </button>
                          <button type="button" onClick={() => onDeleteVariant(realIndex)} disabled={actionLoading && isEditMode} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-50">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* RIGHT COLUMN - Product Gallery unchanged */}
      <div className="space-y-6">
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="p-4 border-b border-gray-100 bg-gray-50">
            <h3 className="font-semibold text-gray-900">Product Gallery</h3>
            <p className="text-xs text-gray-500 mt-1">{isEditMode ? "Main variant images · ★ = thumbnail · saved with Save Changes" : "Up to 5 · drag to reorder · ★ = thumbnail"}</p>
          </div>
          {mainGalleryImage && (
            <div className="px-4 pt-4">
              <div className="relative rounded-lg overflow-hidden border-2 border-blue-400">
                <img src={mainGalleryImage.url} alt="Main" className="w-full h-40 object-contain bg-gray-50" />
                <div className="absolute top-2 left-2"><span className="bg-blue-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">★ MAIN</span></div>
              </div>
            </div>
          )}
          <div className="p-4">
            <label className={`block w-full border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-all ${isDraggingZone ? "border-blue-500 bg-blue-50" : "border-gray-300 hover:border-blue-400"} ${galleryImages.length >= 5 ? "opacity-50 cursor-not-allowed" : ""}`} onDragOver={(e) => { e.preventDefault(); setIsDraggingZone(true); }} onDragLeave={() => setIsDraggingZone(false)} onDrop={(e) => { e.preventDefault(); setIsDraggingZone(false); handleGalleryUpload({ target: { files: e.dataTransfer.files } }); }}>
              <input type="file" multiple accept="image/*" className="hidden" disabled={galleryImages.length >= 5} onChange={handleGalleryUpload} />
              <svg className="w-8 h-8 mx-auto mb-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
              <p className="text-sm text-gray-600">{galleryImages.length}/5 · click or drop</p>
            </label>
            {galleryImages.length > 0 && (
              <div className="mt-3 space-y-2">
                {galleryImages.map((image, index) => (
                  <div key={image.id || image.url} draggable onDragStart={(e) => handleGalleryDragStart(e, index)} onDragOver={(e) => handleGalleryDragOver(e, index)} onDragEnd={() => setDraggedIdx(null)} className={`flex items-center gap-2 p-2 rounded-lg border-2 cursor-grab active:cursor-grabbing transition-all ${image.isMain ? "border-blue-500 bg-blue-50" : "border-transparent bg-gray-50 hover:border-gray-200"}`}>
                    <div className="w-10 h-10 rounded overflow-hidden bg-white flex-shrink-0 border border-gray-100"><img src={image.url} alt="" className="w-full h-full object-cover" /></div>
                    <div className="flex-1 text-xs truncate text-gray-600">{image.isMain && <span className="text-blue-600 font-bold mr-1">★</span>}{image.name || "Uploaded image"}</div>
                    <div className="flex items-center gap-1">
                      {!image.isMain && (<button type="button" onClick={() => setMainGalleryImage(image.id || image.url)} title="Set as main thumbnail" className="p-1 text-gray-400 hover:text-blue-600">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>
                      </button>)}
                      <button type="button" onClick={() => removeGalleryImage(image.id || image.url)} className="p-1 text-gray-400 hover:text-red-600">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                  </div>
                ))}
                <p className="text-xs text-gray-400 text-center">Drag to reorder · ★ = thumbnail</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductFormBody;

