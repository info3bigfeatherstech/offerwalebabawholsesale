import React from "react";
import { displayNumericInput, normalizeNumericTyping, selectAllOnFocus } from "../../../utils/numericFormInput";

/**
 * Optional per-variant title, description, and shipping (falls back to product-level when empty).
 */
const VariantCatalogFieldsSection = ({
  title = "",
  description = "",
  shipping = { weight: "", dimensions: { length: "", width: "", height: "" } },
  onTitleChange,
  onDescriptionChange,
  onShippingChange,
  compact = false,
}) => {
  const dims = shipping?.dimensions || {};

  const setDim = (key, value) => {
    onShippingChange({
      ...shipping,
      dimensions: { ...dims, [key]: value },
    });
  };

  return (
    <div className={`space-y-4 ${compact ? "" : "pt-4 border-t border-gray-200"}`}>
      <div>
        <p className="text-sm font-semibold text-gray-800">Variant display & shipping</p>
        <p className="text-xs text-gray-500 mt-0.5">
          Optional — leave blank to use product-level title, description, and shipping.
        </p>
      </div>

      <div>
        <label className="text-xs text-gray-500 block mb-1">Variant title</label>
        <input
          type="text"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm"
          placeholder="Customer-facing title for this SKU"
        />
      </div>

      <div>
        <label className="text-xs text-gray-500 block mb-1">Variant description</label>
        <textarea
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          rows={compact ? 2 : 3}
          className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm resize-none"
          placeholder="Specifications / details for this variant"
        />
      </div>

      <div>
        <label className="text-xs text-gray-500 block mb-2">Weight (kg) & dimensions (cm)</label>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <input
            type="number"
            step="0.01"
            min="0"
            value={displayNumericInput(shipping?.weight)}
            onFocus={selectAllOnFocus}
            onChange={(e) => onShippingChange({ ...shipping, weight: normalizeNumericTyping(e.target.value, { allowDecimals: true }) })}
            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm"
            placeholder="Weight (kg)"
          />
        </div>
        <div className="grid grid-cols-3 gap-2">
          {["length", "width", "height"].map((dim) => (
            <input
              key={dim}
              type="number"
              step="0.1"
              min="0"
              value={displayNumericInput(dims[dim])}
              onFocus={selectAllOnFocus}
              onChange={(e) => setDim(dim, normalizeNumericTyping(e.target.value, { allowDecimals: true }))}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm capitalize"
              placeholder={dim}
            />
          ))}
        </div>
        <p className="text-[10px] text-gray-400 mt-1">
          Used for checkout delivery charge and Shiprocket. All four values required to save variant-level shipping.
        </p>
      </div>
    </div>
  );
};

export default VariantCatalogFieldsSection;
