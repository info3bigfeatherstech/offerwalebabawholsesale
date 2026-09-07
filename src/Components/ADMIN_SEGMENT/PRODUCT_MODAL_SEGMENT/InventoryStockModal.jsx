import React, { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { toast } from "react-toastify";
import wholesaleAxios from "../../../SERVICES/Wholesaleaxios";
import {
  displayNumericInput,
  normalizeNumericTyping,
  selectAllOnFocus,
} from "../../../utils/numericFormInput";
import {
  buildProductSummary,
  buildVariantStockRows,
} from "../../../utils/inventoryStockDisplay";
import {
  patchProductInventory,
  clearInventoryStockMessages,
} from "../ADMIN_REDUX_MANAGEMENT/inventoryStockSlice";

const STOREFRONT = "wholesale";

const EMPTY_SUMMARY = {
  name: "",
  title: "",
  slug: "",
  thumbUrl: null,
  primaryProductCode: "—",
};

const ProductThumb = ({ url, alt, size = "lg" }) => {
  const sizeClass =
    size === "sm" ? "h-12 w-12 rounded-lg" : "h-20 w-20 rounded-xl";
  if (url) {
    return (
      <img
        src={url}
        alt={alt}
        className={`${sizeClass} flex-shrink-0 border border-gray-200 object-cover shadow-sm`}
      />
    );
  }
  return (
    <div
      className={`${sizeClass} flex flex-shrink-0 items-center justify-center border border-gray-200 bg-gray-100`}
    >
      <svg className="h-6 w-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
        />
      </svg>
    </div>
  );
};

function mapRowsFromProduct(p) {
  return buildVariantStockRows(p, { storefront: STOREFRONT }).map((row) => ({
    ...row,
    quantity: displayNumericInput(row.quantity),
    lowStockThreshold: displayNumericInput(row.lowStockThreshold ?? ""),
    basePrice: displayNumericInput(row.basePrice ?? ""),
    salePrice: displayNumericInput(row.salePrice ?? ""),
  }));
}

/** Maps UI Base/Sale → wholesaleBase / wholesaleSale for this storefront. */
function buildPayloadVariants(rows) {
  const variants = [];
  for (const row of rows) {
    const entry = { productCode: row.productCode };
    let hasField = false;

    if (row.quantity !== "" && row.quantity != null) {
      const qty = parseInt(String(row.quantity), 10);
      if (Number.isNaN(qty) || qty < 0) {
        return { error: `Invalid quantity for ${row.label}` };
      }
      entry.quantity = qty;
      hasField = true;
    }

    if (row.lowStockThreshold !== "" && row.lowStockThreshold != null) {
      const lst = parseInt(String(row.lowStockThreshold), 10);
      if (Number.isNaN(lst) || lst < 0) {
        return { error: `Invalid low stock threshold for ${row.label}` };
      }
      entry.lowStockThreshold = lst;
      hasField = true;
    }

    if (row.basePrice === "" || row.basePrice == null) {
      return { error: `Base price is required for ${row.label}` };
    }
    const base = Number(row.basePrice);
    if (!Number.isFinite(base) || base < 0) {
      return { error: `Invalid base price for ${row.label}` };
    }

    const price = { wholesaleBase: base };
    if (row.salePrice === "" || row.salePrice == null) {
      price.wholesaleSale = null;
    } else {
      const sale = Number(row.salePrice);
      if (!Number.isFinite(sale) || sale < 0) {
        return { error: `Invalid sale price for ${row.label}` };
      }
      if (sale >= base) {
        return { error: `Sale price must be less than base price for ${row.label}` };
      }
      price.wholesaleSale = sale;
    }

    entry.price = price;
    hasField = true;

    if (hasField) variants.push(entry);
  }

  if (!variants.length) {
    return { error: "Update at least one stock or price field" };
  }
  return { variants };
}

const InventoryStockModal = ({ product, onClose, onSaved }) => {
  const dispatch = useDispatch();
  const { loading, error, successMessage } = useSelector((s) => s.inventoryStock);

  const [fetching, setFetching] = useState(true);
  const [fetchError, setFetchError] = useState(null);
  const [summary, setSummary] = useState(() => buildProductSummary(product || {}));
  const [rows, setRows] = useState([]);

  useEffect(() => {
    dispatch(clearInventoryStockMessages());
    let cancelled = false;

    const applyProduct = (p) => {
      const variantRows = mapRowsFromProduct(p);
      if (!variantRows.length) return false;
      setSummary(buildProductSummary(p));
      setRows(variantRows);
      return true;
    };

    const load = async () => {
      if (!product?.slug) {
        setFetchError("Product slug is missing");
        setFetching(false);
        return;
      }

      if (applyProduct(product)) {
        setFetching(false);
        setFetchError(null);
        return;
      }

      setFetching(true);
      setFetchError(null);
      try {
        const res = await wholesaleAxios.get(`/admin/products/${product.slug}`);
        if (cancelled) return;
        const p = res.data?.product || res.data?.data?.product || res.data;
        if (!applyProduct(p)) {
          setFetchError("No variants found for this product");
          setRows([]);
          setSummary(EMPTY_SUMMARY);
        }
      } catch (err) {
        if (!cancelled) {
          setFetchError(
            err.response?.data?.message || err.message || "Failed to load product"
          );
        }
      } finally {
        if (!cancelled) setFetching(false);
      }
    };

    load();
    return () => {
      cancelled = true;
      dispatch(clearInventoryStockMessages());
    };
  }, [product, dispatch]);

  useEffect(() => {
    if (successMessage) {
      toast.success(successMessage);
      onSaved?.();
      onClose();
    }
  }, [successMessage, onClose, onSaved]);

  const hasChanges = useMemo(() => rows.length > 0, [rows]);

  const setRowField = (index, field, raw, { allowDecimals = false } = {}) => {
    setRows((prev) =>
      prev.map((row, i) =>
        i === index
          ? {
              ...row,
              [field]: normalizeNumericTyping(raw, { allowDecimals }),
            }
          : row
      )
    );
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!product?.slug || !rows.length) return;

    try {
      const result = buildPayloadVariants(rows);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      dispatch(patchProductInventory({ slug: product.slug, variants: result.variants }));
    } catch (err) {
      toast.error(err?.message || "Could not prepare update");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Update Stock & Prices</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            aria-label="Close"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {fetching && (
              <div className="flex items-center justify-center py-12 text-sm text-gray-500">
                Loading product details…
              </div>
            )}
            {!fetching && fetchError && (
              <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                {fetchError}
              </div>
            )}
            {!fetching && !fetchError && (
              <>
                <div className="mb-5 flex gap-4 rounded-xl border border-gray-200 bg-gradient-to-r from-slate-50 to-white p-4">
                  <ProductThumb url={summary.thumbUrl} alt={summary.name} />
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-base font-bold text-gray-900">{summary.name}</h3>
                    {summary.title ? (
                      <p className="mt-0.5 truncate text-sm text-gray-500">{summary.title}</p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 ring-1 ring-blue-100">
                        Product Code: {summary.primaryProductCode}
                      </span>
                      {summary.slug ? (
                        <span className="inline-flex items-center rounded-lg bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
                          {summary.slug}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>

                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Variant stock & prices ({rows.length})
                </p>

                <div className="space-y-4">
                  {rows.map((row, index) => (
                    <div
                      key={row.productCode}
                      className="rounded-xl border border-gray-200 bg-gray-50 p-4"
                    >
                      <div className="mb-4 flex items-start gap-3">
                        <ProductThumb url={row.thumbUrl} alt={row.label} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-gray-900">{row.label}</p>
                          <div className="mt-1 flex flex-wrap gap-2">
                            <span className="font-mono text-xs text-gray-600">
                              Code: {row.productCode}
                            </span>
                            {row.sku && row.sku !== row.productCode ? (
                              <span className="font-mono text-xs text-gray-400">
                                SKU: {row.sku}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div>
                          <label className="mb-1 block text-xs font-medium text-gray-600">
                            Quantity
                          </label>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={row.quantity}
                            onChange={(e) => setRowField(index, "quantity", e.target.value)}
                            onFocus={selectAllOnFocus}
                            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                            placeholder="0"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-gray-600">
                            Low stock threshold
                          </label>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={row.lowStockThreshold}
                            onChange={(e) =>
                              setRowField(index, "lowStockThreshold", e.target.value)
                            }
                            onFocus={selectAllOnFocus}
                            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                            placeholder="5"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-gray-600">
                            Base price
                          </label>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={row.basePrice}
                            onChange={(e) =>
                              setRowField(index, "basePrice", e.target.value, {
                                allowDecimals: true,
                              })
                            }
                            onFocus={selectAllOnFocus}
                            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                            placeholder="0"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-gray-600">
                            Sale price
                          </label>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={row.salePrice}
                            onChange={(e) =>
                              setRowField(index, "salePrice", e.target.value, {
                                allowDecimals: true,
                              })
                            }
                            onFocus={selectAllOnFocus}
                            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                            placeholder="Optional"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
            {error && (
              <div className="mt-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-gray-100 px-6 py-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || fetching || !!fetchError || !hasChanges}
              className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default InventoryStockModal;
