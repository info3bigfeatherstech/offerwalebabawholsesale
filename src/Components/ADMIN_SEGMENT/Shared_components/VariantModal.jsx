// Shared_components/VariantModal.jsx

import React, { useState } from 'react';
import VariantCatalogFieldsSection from './VariantCatalogFieldsSection';
import { emptyVariantShippingForm } from '../../../utils/variantCatalogForm';
import { displayNumericInput, normalizeNumericTyping, selectAllOnFocus } from '../../../utils/numericFormInput';

export const defaultVariant = {
  attributes: [{ key: '', value: '' }],
  price: { base: '', sale: '', wholesaleBase: '', wholesaleSale: '' },
  inventory: { quantity: '', lowStockThreshold: '', trackInventory: true },
  images: [],
  isActive: true,
  ProductCode: '',
  wholesale: false,
  minimumOrderQuantity: '',
  channelVisibility: { ecomm: 'active', wholesale: 'draft' },
  title: '',
  description: '',
  shipping: emptyVariantShippingForm(),
};

const VariantModal = ({
  variantForm,
  setVariantForm,
  editingVariantIndex,
  onSave,
  onClose,
  getDiscountPercentage,
  isSaving = false,
  saveError = null,
}) => {
  const [variantImageDragging, setVariantImageDragging] = useState(false);
  const isEditing = editingVariantIndex !== null;

  const addVariantAttribute = () =>
    setVariantForm(prev => ({ ...prev, attributes: [...prev.attributes, { key: '', value: '' }] }));

  const removeVariantAttribute = (index) =>
    setVariantForm(prev => ({ ...prev, attributes: prev.attributes.filter((_, i) => i !== index) }));

  const updateVariantAttribute = (index, field, value) =>
    setVariantForm(prev => ({
      ...prev,
      attributes: prev.attributes.map((attr, i) => i === index ? { ...attr, [field]: value } : attr)
    }));

  const handleVariantImageUpload = (e) => {
    const files = Array.from(e.target.files);
    const newImages = [...variantForm.images];
    files.forEach((file, index) => {
      if (newImages.length < 4) {
        const reader = new FileReader();
        const imageId = `vimg-${Date.now()}-${index}`;
        reader.onloadend = () => {
          newImages.push({ id: imageId, url: reader.result, file, name: file.name, isMain: newImages.length === 0 });
          setVariantForm(prev => ({ ...prev, images: [...newImages] }));
        };
        reader.readAsDataURL(file);
      }
    });
  };

  const removeVariantImage = (imageId) => {
    const newImages = variantForm.images.filter(img => (img.id || img.url) !== imageId);
    if (variantForm.images.find(img => (img.id || img.url) === imageId)?.isMain && newImages.length > 0) {
      newImages[0] = { ...newImages[0], isMain: true };
    }
    setVariantForm(prev => ({ ...prev, images: newImages }));
  };

  const setVariantMainImage = (imageId) =>
    setVariantForm(prev => ({
      ...prev,
      images: prev.images.map(img => ({ ...img, isMain: (img.id || img.url) === imageId }))
    }));

  // SINGLE SOURCE OF TRUTH: check wholesale eligibility from price.wholesaleBase
  const isWholesaleEligible = () => {
    return variantForm.wholesale && variantForm.price?.wholesaleBase && parseFloat(variantForm.price.wholesaleBase) > 0;
  };

  const isWholesaleMoqUnmet = () => {
    if (!variantForm.wholesale) return false;
    if (variantForm.inventory?.trackInventory === false) return false;

    const quantity = Number(variantForm.inventory?.quantity ?? 0);
    const moq = Number(variantForm.minimumOrderQuantity ?? 1);

    return Number.isFinite(quantity) && Number.isFinite(moq) && moq > quantity;
  };

  const handleSave = () => {
    const ProductCode = (variantForm.ProductCode ?? '').toString().trim();

    if (!ProductCode) {
      alert('ProductCode is required');
      return;
    }
    {
      const m = ProductCode.toUpperCase().match(/^([A-Z0-9]+)-(\d+)$/);
      const seq = m ? Number(m[2]) : NaN;
      if (!m || !Number.isInteger(seq) || seq < 1) {
        alert("ProductCode must be BASE-N (e.g., 3897-1 or 3897-01)");
        return;
      }
    }
    if (!variantForm.price.base) {
      alert('Please enter base price for this variant');
      return;
    }

    const base = parseFloat(variantForm.price.base) || 0;
    const sale = (variantForm.price.sale !== '' && variantForm.price.sale != null && variantForm.price.sale !== 'null')
      ? parseFloat(variantForm.price.sale)
      : null;

    if (base <= 0) {
      alert('Base price must be greater than 0');
      return;
    }
    if (sale !== null && sale >= base) {
      alert('Sale price must be less than base price');
      return;
    }

    if (variantForm.wholesale) {
      const wholesaleBase = parseFloat(variantForm.price.wholesaleBase) || 0;
      if (wholesaleBase <= 0) {
        alert('Wholesale base price is required and must be greater than 0');
        return;
      }
      if (!variantForm.minimumOrderQuantity || parseInt(variantForm.minimumOrderQuantity) < 1) {
        alert('Minimum Order Quantity (MOQ) must be at least 1');
        return;
      }
      const wholesaleSale = (variantForm.price.wholesaleSale !== '' && variantForm.price.wholesaleSale != null)
        ? parseFloat(variantForm.price.wholesaleSale)
        : null;
      if (wholesaleSale !== null && wholesaleSale >= wholesaleBase) {
        alert('Wholesale sale price must be less than wholesale base price');
        return;
      }
    }

    const validAttributes = variantForm.attributes.filter(a => a.key.trim() && a.value.trim());

    // CRITICAL: Pass price object with wholesaleBase INSIDE, NOT at root level
    onSave({
      ...variantForm,
      ProductCode: ProductCode,
      attributes: validAttributes,
      price: {
        base: base,
        sale: sale,
        wholesaleBase: variantForm.wholesale ? (parseFloat(variantForm.price.wholesaleBase) || 0) : undefined,
        wholesaleSale: variantForm.wholesale ? (variantForm.price.wholesaleSale ? parseFloat(variantForm.price.wholesaleSale) : null) : undefined,
      },
      minimumOrderQuantity: variantForm.wholesale ? (parseInt(variantForm.minimumOrderQuantity) || 1) : 1,
      channelVisibility: {
        ecomm: variantForm.channelVisibility?.ecomm || 'active',
        wholesale: isWholesaleEligible() ? 'active' : 'draft',
      },
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-start justify-center p-4 z-[60] overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-2xl w-full my-8 shadow-2xl">
        <div className="p-5 border-b border-gray-200 flex items-center justify-between bg-indigo-50 rounded-t-2xl">
          <div>
            <h3 className="text-lg font-bold text-gray-900">{isEditing ? 'Edit Variant' : 'Add New Variant'}</h3>
            <p className="text-xs text-gray-500 mt-0.5">{isEditing ? 'Update price, inventory & attributes' : 'Set ProductCode, attributes, price & stock'}</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 hover:bg-white rounded-xl transition-colors">
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Product Code */}
          <div>
            <label className="text-sm font-semibold text-gray-800 mb-2 block">
              Variant Product Code <span className="text-red-400">*</span>
              {isEditing && <span className="ml-2 text-xs font-normal text-amber-600">🔒 Locked</span>}
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={variantForm.ProductCode ?? ''}
              onChange={(e) => setVariantForm(prev => ({ ...prev, ProductCode: e.target.value }))}
              disabled={isEditing}
              className={`w-full px-4 py-2.5 border rounded-lg text-sm font-mono ${isEditing ? 'bg-gray-100 border-gray-300 text-gray-500 cursor-not-allowed' : 'bg-gray-50 border-gray-200 focus:ring-2 focus:ring-indigo-400'}`}
              placeholder="e.g., 1234567890128"
            />
          </div>

          {/* Attributes */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-semibold text-gray-800">Attributes <span className="text-gray-400 text-xs">(optional)</span></label>
              <button type="button" onClick={addVariantAttribute} className="text-xs px-3 py-1 bg-indigo-100 text-indigo-700 rounded-lg">+ Add</button>
            </div>
            <div className="space-y-2">
              {variantForm.attributes.map((attr, index) => (
                <div key={index} className="flex gap-2">
                  <input type="text" value={attr.key} onChange={(e) => updateVariantAttribute(index, 'key', e.target.value)} className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm" placeholder="Key (e.g., Color)" />
                  <input type="text" value={attr.value} onChange={(e) => updateVariantAttribute(index, 'value', e.target.value)} className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm" placeholder="Value (e.g., Blue)" />
                  {variantForm.attributes.length > 1 && (
                    <button type="button" onClick={() => removeVariantAttribute(index)} className="p-2 text-gray-400 hover:text-red-500">✕</button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Ecom Visibility Toggle */}
          <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-200">
            <div>
              <label className="text-sm font-semibold text-gray-800">Ecom Visibility</label>
              <p className="text-xs text-gray-500">Show on ecommerce storefront</p>
            </div>
            <button
              type="button"
              onClick={() => setVariantForm(prev => ({
                ...prev,
                channelVisibility: { ...prev.channelVisibility, ecomm: prev.channelVisibility?.ecomm === "active" ? "draft" : "active" }
              }))}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${variantForm.channelVisibility?.ecomm === "active" ? "bg-green-500" : "bg-gray-300"}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${variantForm.channelVisibility?.ecomm === "active" ? "translate-x-6" : "translate-x-1"}`} />
            </button>
          </div>

          {/* Pricing */}
          <div>
            <label className="text-sm font-semibold text-gray-800 mb-3 block">Pricing (₹)</label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Base Price <span className="text-red-400">*</span></label>
                <input type="number" value={displayNumericInput(variantForm.price.base)} onFocus={selectAllOnFocus} onChange={(e) => setVariantForm(prev => ({ ...prev, price: { ...prev.price, base: e.target.value } }))} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg" placeholder="89000" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Sale Price</label>
                <input type="number" value={variantForm.price.sale ?? ''} onChange={(e) => setVariantForm(prev => ({ ...prev, price: { ...prev.price, sale: e.target.value } }))} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg" placeholder="79000" />
              </div>
            </div>
          </div>

          {/* Wholesale Pricing Toggle */}
          <div className="border-t border-gray-200 pt-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <label className="text-sm font-semibold text-gray-800">Wholesale Pricing</label>
                <p className="text-xs text-gray-500">Enable bulk pricing for wholesalers</p>
              </div>
              <button type="button" onClick={() => setVariantForm(prev => ({ ...prev, wholesale: !prev.wholesale }))} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${variantForm.wholesale ? "bg-purple-500" : "bg-gray-300"}`}>
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${variantForm.wholesale ? "translate-x-6" : "translate-x-1"}`} />
              </button>
            </div>

            {/* Wholesale Visibility Badge (read-only) */}
            <div className={`flex items-center justify-between p-3 rounded-lg mb-3 ${isWholesaleEligible() ? "bg-purple-50 border border-purple-200" : "bg-gray-50 border border-gray-200"}`}>
              <span className="text-sm font-medium text-gray-700">Wholesale Visibility</span>
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${isWholesaleEligible() ? "bg-purple-100 text-purple-700" : "bg-gray-100 text-gray-500"}`}>
                {isWholesaleEligible() ? "Active" : "Ineligible"}
              </span>
            </div>

            {variantForm.wholesale && (
              <div className="space-y-3 p-3 bg-purple-50 rounded-lg border border-purple-200">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Wholesale Base Price (₹) <span className="text-red-400">*</span></label>
                    <input type="number" value={variantForm.price.wholesaleBase || ''} onChange={(e) => setVariantForm(prev => ({ ...prev, price: { ...prev.price, wholesaleBase: e.target.value } }))} className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg" placeholder="75000" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Wholesale Sale Price (₹)</label>
                    <input type="number" value={variantForm.price.wholesaleSale || ''} onChange={(e) => setVariantForm(prev => ({ ...prev, price: { ...prev.price, wholesaleSale: e.target.value } }))} className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg" placeholder="72000" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Minimum Order Quantity (MOQ)</label>
                  <input type="number" min="1" value={displayNumericInput(variantForm.minimumOrderQuantity)} onFocus={selectAllOnFocus} onChange={(e) => setVariantForm(prev => ({ ...prev, minimumOrderQuantity: normalizeNumericTyping(e.target.value) }))} className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg" placeholder="1" />
                </div>
                {isWholesaleMoqUnmet() && (
                  <p className="text-xs font-semibold text-red-600 bg-red-50 border border-red-200 rounded-lg px-2 py-1">
                    Wholesale warning: MOQ ({variantForm.minimumOrderQuantity ?? 1}) is greater than stock ({variantForm.inventory?.quantity ?? 0})
                  </p>
                )}
              </div>
            )}
          </div>

          <VariantCatalogFieldsSection
            title={variantForm.title ?? ''}
            description={variantForm.description ?? ''}
            shipping={variantForm.shipping ?? emptyVariantShippingForm()}
            onTitleChange={(value) => setVariantForm((prev) => ({ ...prev, title: value }))}
            onDescriptionChange={(value) => setVariantForm((prev) => ({ ...prev, description: value }))}
            onShippingChange={(shipping) => setVariantForm((prev) => ({ ...prev, shipping }))}
          />

          {/* Inventory */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-semibold text-gray-800">Inventory</label>
              <button type="button" onClick={() => setVariantForm(prev => ({ ...prev, inventory: { ...prev.inventory, trackInventory: !prev.inventory.trackInventory } }))} className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${variantForm.inventory.trackInventory ? 'bg-indigo-500' : 'bg-gray-300'}`}>
                <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${variantForm.inventory.trackInventory ? 'translate-x-5' : 'translate-x-1'}`} />
              </button>
            </div>
            {variantForm.inventory.trackInventory && (
              <div className="grid grid-cols-2 gap-3">
                <input type="number" value={displayNumericInput(variantForm.inventory.quantity)} onFocus={selectAllOnFocus} onChange={(e) => setVariantForm(prev => ({ ...prev, inventory: { ...prev.inventory, quantity: normalizeNumericTyping(e.target.value) } }))} className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg" placeholder="Quantity" />
                <input type="number" value={displayNumericInput(variantForm.inventory.lowStockThreshold)} onFocus={selectAllOnFocus} onChange={(e) => setVariantForm(prev => ({ ...prev, inventory: { ...prev.inventory, lowStockThreshold: normalizeNumericTyping(e.target.value) } }))} className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg" placeholder="Low stock alert (e.g. 5)" />
              </div>
            )}
          </div>

          {/* Images */}
          <div>
            <label className="text-sm font-semibold text-gray-800 mb-3 block">Images (up to 4)</label>
            <label className={`block w-full border-2 border-dashed rounded-lg p-4 text-center cursor-pointer ${variantImageDragging ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300'}`}
              onDragOver={(e) => { e.preventDefault(); setVariantImageDragging(true); }}
              onDragLeave={() => setVariantImageDragging(false)}
              onDrop={(e) => { e.preventDefault(); setVariantImageDragging(false); handleVariantImageUpload({ target: { files: e.dataTransfer.files } }); }}>
              <input type="file" multiple accept="image/*" onChange={handleVariantImageUpload} className="hidden" disabled={variantForm.images.length >= 4} />
              <p className="text-sm text-gray-500">Click or drop images ({variantForm.images.length}/4)</p>
            </label>
            {variantForm.images.length > 0 && (
              <div className="grid grid-cols-4 gap-2 mt-3">
                {variantForm.images.map((image) => (
                  <div key={image.id || image.url} className={`relative rounded-lg overflow-hidden border-2 ${image.isMain ? 'border-indigo-500' : 'border-gray-200'}`}>
                    <img src={image.url} alt="" className="w-full h-16 object-cover" />
                    <button type="button" onClick={() => setVariantMainImage(image.id || image.url)} className="absolute top-1 left-1 p-1 bg-white rounded-full text-indigo-600 text-xs">★</button>
                    <button type="button" onClick={() => removeVariantImage(image.id || image.url)} className="absolute top-1 right-1 p-1 bg-white rounded-full text-red-500 text-xs">✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="p-5 border-t border-gray-100">
          {saveError && <div className="p-3 bg-red-50 border border-red-200 rounded-lg mb-3"><p className="text-red-700 text-sm">❌ {saveError}</p></div>}
          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} disabled={isSaving} className="px-5 py-2.5 border border-gray-300 rounded-lg">Cancel</button>
            <button type="button" onClick={handleSave} disabled={isSaving} className="px-5 py-2.5 bg-indigo-600 text-white rounded-lg disabled:opacity-50">
              {isSaving ? "Saving..." : (isEditing ? "Update" : "Save")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VariantModal;

