import React from "react";
import { useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { Eye, Star, ShoppingBag, Package, Heart, Loader2, Minus, Plus } from "lucide-react";
import LazyImage from "./LazyImage/LazyImage";

import { useGetAllCategoriesQuery } from "../REDUX_FEATURES/REDUX_SLICES/SHOP_BY_CATEGORY/categoriesApi";
import {
  addToCart,
  updateCartItem,
  removeCartItem,
  addGuestCartItem,
  updateGuestCartItem,
  removeGuestCartItem,
  selectCartItemBySlug,
} from "../REDUX_FEATURES/REDUX_SLICES/UserCart/userCartSlice";
import {
  addToWishlist,
  removeFromWishlist,
  addGuestItem,
  removeGuestItem,
  selectIsWishlisted,
} from "../REDUX_FEATURES/REDUX_SLICES/UserWIshlist/userWishlistSLice";
import { toast } from "react-toastify";
import { selectIsAuthenticated } from "../REDUX_FEATURES/REDUX_SLICES/authApi/authSlice";
import { getProductRatingDisplay } from "../../utils/productRatingDisplay";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const formatPrice = (n) => {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n);
};

const formatCount = (count) => {
  if (!count) return "0";
  if (count < 100) return count.toString();
  return Math.floor(count / 100) * 100 + "+";
};

// ── From Version 2 (old) — full availability meta with MOQ/NOT_LISTED support ─
const getAvailabilityMeta = (availability) => {
  const status = availability?.status || "IN_STOCK";
  if (status === "OUT_OF_STOCK") return { label: "Out of stock", chipClass: "bg-red-100 text-red-700" };
  if (status === "MOQ_UNMET")    return { label: "MOQ not met",  chipClass: "bg-yellow-100 text-amber-800" };
  if (status === "NOT_LISTED")   return { label: "Not available", chipClass: "bg-gray-100 text-gray-600" };
  return { label: "In stock", chipClass: "bg-green-100 text-green-700" };
};

// ─── Component ────────────────────────────────────────────────────────────────
const WholesaleProductCard = ({ product, index = 0 }) => {
  const navigate        = useNavigate();
  const dispatch        = useDispatch();
  const wishlisted      = useSelector(selectIsWishlisted(product?.slug));
  const cartItem        = useSelector(selectCartItemBySlug(product?.slug));
  const isAuthenticated = useSelector(selectIsAuthenticated);

  const { data: categories = [] } = useGetAllCategoriesQuery();

  const [localLoading, setLocalLoading] = React.useState({
    add: false, update: false, remove: false, wishlist: false,
  });
  const setL        = (k, v) => setLocalLoading((p) => ({ ...p, [k]: v }));
  const isProcessing = localLoading.add || localLoading.update || localLoading.remove;

  const getCategoryName = (productCategory) => {
    if (!productCategory) return "";
    const found = categories.find(
      (cat) => cat._id === productCategory || cat.name === productCategory
    );
    return found ? found.name : productCategory;
  };

  // ── Derived product values ────────────────────────────────────────────────
  const variant      = product?.variants?.[0] ?? {};
  const title        = product?.title || product?.name || "Product";
  const basePrice    = variant.price?.base ?? null;
  const salePrice    = variant.price?.sale ?? null;
  const hasDiscount  = basePrice != null && salePrice != null && salePrice < basePrice;
  const discountPct  = hasDiscount
    ? Math.round(((basePrice - salePrice) / basePrice) * 100)
    : null;

  const ratingUi = getProductRatingDisplay(product, null);
  const moq          = variant.minimumOrderQuantity ?? variant.price?.minimumOrderQuantity ?? null;

  // ── From Version 2: full availability logic ───────────────────────────────
  const availability     = variant?.availability || null;
  const availabilityMeta = getAvailabilityMeta(availability);
  const imgUrl           = variant.images?.[0]?.url || null;
  const maxStock         = variant.inventory?.trackInventory
    ? (variant.inventory?.quantity ?? 0)
    : Infinity;
  const fallbackInStock  = maxStock > 0;
  const canPurchase      = availability?.purchasable ?? fallbackInStock; // v2 uses canPurchase
  const inStock          = canPurchase;
  const isInCart         = !!cartItem;
  const currentQty       = cartItem?.quantity ?? 0;
  const isAtMax          = currentQty >= maxStock && maxStock !== Infinity;
  const category         = typeof product?.category === "object"
    ? product.category?.name
    : product?.category || "";

  const handleCardClick = () => {
    if (product?.slug) navigate(`/product/${product.slug}`);
  };

  // ── Wishlist handler (both versions identical) ────────────────────────────
  const handleWishlist = async (e) => {
    e.stopPropagation();
    if (!product?.slug || localLoading.wishlist) return;
    setL("wishlist", true);
    try {
      if (isAuthenticated) {
        if (wishlisted) {
          await dispatch(removeFromWishlist({ productSlug: product.slug })).unwrap();
          toast.success("Removed from wishlist", { icon: "💔" });
        } else {
          await dispatch(addToWishlist({
            productSlug: product.slug,
            variantId:   variant?._id?.toString() || "",
          })).unwrap();
          toast.success("Saved to wishlist", { icon: "❤️" });
        }
      } else {
        if (wishlisted) {
          dispatch(removeGuestItem(product.slug));
          toast.success("Removed", { icon: "💔" });
        } else {
          dispatch(addGuestItem({
            productSlug:        product.slug,
            productId:          product._id,
            variantId:          variant?._id?.toString() || "",
            productName:        title,
            image:              variant.images?.[0]?.url ?? null,
            brand:              product?.brand ?? null,
            wholesalePrice:     variant.price?.wholesaleSale ?? variant.price?.wholesaleBase ?? variant.price?.sale ?? null,
            wholesaleBasePrice: variant.price?.wholesaleBase ?? variant.price?.base ?? null,
            variantLabel:       variant.attributes?.map((a) => `${a.key}: ${a.value}`).join(", ") || null,
            moq:                moq || 1,
            discountPercentage: discountPct ?? 0,
          }));
          toast.success("Saved to wishlist", { icon: "❤️" });
        }
      }
    } catch (err) {
      toast.error(err?.message || "Wishlist action failed");
    } finally {
      setL("wishlist", false);
    }
  };

  // ── Add to cart — Version 1 (isAuthenticated branch) ─────────────────────
  const handleAddToCart = async (e) => {
    e.stopPropagation();
    if (isInCart || isProcessing || !canPurchase || !product?.slug) return;
    setL("add", true);
    try {
      if (isAuthenticated) {
        await dispatch(addToCart({
          productSlug: product.slug,
          productId:   product._id,
          variantId:   variant?._id?.toString() || "",
          quantity:    moq || 1,
        })).unwrap();
      } else {
        dispatch(addGuestCartItem({
          productId:   product._id,
          productSlug: product.slug,
          variantId:   variant?._id?.toString() || "",
          quantity:    moq || 1,
           moq:                moq || 1,                                    // ✅ MOQ store karo
  wholesalePrice:     variant.price?.wholesaleSale ?? variant.price?.wholesaleBase ?? variant.price?.sale ?? null,
  wholesaleBasePrice: variant.price?.wholesaleBase ?? variant.price?.base ?? null,
  productName:        product.title || product.name,               // ✅ naam store karo
  image:              variant.images?.[0]?.url ?? null,            // ✅ image store karo
  variantLabel:       variant.attributes?.map(a => `${a.key}: ${a.value}`).join(', ') ?? null,
  discountPercentage: discountPct ?? 0,
        }));
      }
      toast.success("Added to cart");
    } catch (err) {
      toast.error(err?.message || "Failed to add to cart");
    } finally {
      setL("add", false);
    }
  };

  // ── Increment — Version 1 (isAuthenticated branch) ───────────────────────
  const handleIncrement = async (e) => {
    e.stopPropagation();
    if (isAtMax) { toast.warning(`Max stock: ${maxStock}`); return; }
    if (isProcessing) return;
    setL("update", true);
    try {
      if (isAuthenticated) {
        await dispatch(updateCartItem({
          productId:   product._id,
          variantId:   variant?._id?.toString() || "",
          quantity:    currentQty + 1,
          productSlug: product.slug,
        })).unwrap();
      } else {
        dispatch(updateGuestCartItem({
          productSlug: product.slug,
          variantId:   variant?._id?.toString() || "",
          quantity:    currentQty + 1,
        }));
      }
    } catch (err) {
      toast.error(err?.message || "Failed to update");
    } finally {
      setL("update", false);
    }
  };

  // ── Decrement — Version 1 auth branches + Version 2 MOQ-aware threshold ──
  const handleDecrement = async (e) => {
    e.stopPropagation();
    if (isProcessing) return;
    const newQty = currentQty - 1;
    try {
      // Version 2: remove when below MOQ, not just <= 0
      if (newQty < (moq || 1)) {
        setL("remove", true);
        if (isAuthenticated) {
          await dispatch(removeCartItem({
            productId:   product._id,
            variantId:   variant?._id?.toString() || "",
            productSlug: product.slug,
          })).unwrap();
        } else {
          dispatch(removeGuestCartItem({
            productSlug: product.slug,
            variantId:   variant?._id?.toString() || "",
          }));
        }
        toast.info("Removed from cart");
      } else {
        setL("update", true);
        if (isAuthenticated) {
          await dispatch(updateCartItem({
            productId:   product._id,
            variantId:   variant?._id?.toString() || "",
            quantity:    newQty,
            productSlug: product.slug,
          })).unwrap();
        } else {
          dispatch(updateGuestCartItem({
            productSlug: product.slug,
            variantId:   variant?._id?.toString() || "",
            quantity:    newQty,
          }));
        }
      }
    } catch (err) {
      toast.error(err?.message || "Failed to update");
    } finally {
      setL("update", false);
      setL("remove", false);
    }
  };

  if (!product) return null;

  return (
    <div
      className="group relative flex flex-col cursor-pointer rounded-2xl bg-white border border-zinc-100 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 overflow-hidden"
      style={{ animationDelay: `${index * 50}ms` }}
      onClick={handleCardClick}
    >
      {/* IMAGE */}
      <div className="relative w-full aspect-square bg-zinc-50 overflow-hidden">
        <LazyImage
          src={imgUrl}
          alt={title}
          aspectRatio="1/1"
          objectFit="cover"
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        />

        {/* Version 2: uses canPurchase + availabilityMeta label (not just "Out of Stock") */}
        {!canPurchase && (
          <div className="absolute inset-0 bg-black/25 flex items-center justify-center">
            <span className="text-white text-[8px] md:text-[10px] font-bold uppercase tracking-wide bg-black/45 px-2 py-0.5 rounded-full">
              {availabilityMeta.label}
            </span>
          </div>
        )}

   <div className="flex flex-col gap-6">
  {discountPct && canPurchase && (
    <div className="absolute top-2 left-2 z-10">
      <span className="text-[14px] bg-[#EB4C4C] text-white px-2 py-0.5 rounded-md shadow-sm font-bold">
        {discountPct}% OFF
      </span>
    </div>
  )}

  {moq && (
    <div className={`absolute ${discountPct && canPurchase ? "top-8" : "top-2"} left-2 z-10`}>
      <span className="flex items-center gap-1 text-[12px] bg-gray-200 text-zinc-900 px-2 py-0.5 mt-1 rounded-md shadow-sm font-bold">
        MOQ: <span className="font-bold">{moq}</span>
      </span>
    </div>
  )}
</div>

        <div className="absolute top-2 right-2 flex flex-col gap-1.5 z-10
          md:translate-x-10 md:opacity-0
          md:group-hover:translate-x-0 md:group-hover:opacity-100
          transition-all duration-300"
        >
          <button
            onClick={handleWishlist}
            disabled={localLoading.wishlist}
            aria-label="Toggle wishlist"
            className={`w-8 h-8 rounded-full flex items-center justify-center shadow-md transition-all active:scale-90 ${
              wishlisted
                ? "bg-red-500 text-white"
                : "bg-white/90 backdrop-blur-sm text-zinc-600 hover:bg-red-500 hover:text-white"
            } disabled:opacity-50`}
          >
            {localLoading.wishlist
              ? <Loader2 size={13} className="animate-spin" />
              : <Heart size={14} className={wishlisted ? "fill-current" : ""} />
            }
          </button>

          <button
            onClick={(e) => { e.stopPropagation(); handleCardClick(); }}
            aria-label="View product"
            className="w-8 h-8 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-md text-zinc-600 hover:bg-zinc-900 hover:text-white transition-all active:scale-90"
          >
            <Eye size={14} />
          </button>
        </div>
      </div>

      {/* CONTENT */}
      <div className="flex flex-col flex-1 p-2.5 sm:p-3 gap-1">

        {category && (
          <span className="text-[9px] sm:text-[10px] uppercase tracking-wider text-zinc-400 font-medium truncate">
            {getCategoryName(category)}
          </span>
        )}

        <div className="flex items-start justify-between gap-1">
          <h3 className="text-xs sm:text-sm font-semibold text-zinc-900 line-clamp-2 group-hover:text-[#478B8D] transition-colors leading-snug flex-1">
            {title}
          </h3>
          <div className="flex items-center gap-0.5 flex-shrink-0 mt-0.5">
            <Star size={11} className="text-yellow-400 fill-yellow-400" />
            <span className="text-[10px] font-semibold text-zinc-600">
              {Number(ratingUi.average).toFixed(1)}
            </span>
          </div>
        </div>

        {product?.soldInfo?.count > 0 && (
          <p className="text-[9px] sm:text-[10px] text-zinc-500 hidden sm:block">
            <span className="font-bold text-red-500">
              {formatCount(product.soldInfo.count)} bought
            </span>{" "}
            in past month
          </p>
        )}

        <div className="flex flex-col gap-0.5 mt-1">
          <span className="text-[9px] uppercase tracking-widest text-[#478B8D] font-bold">
            Wholesale Price
          </span>
          <div className="flex items-center gap-1.5">
            <span className="text-sm sm:text-base font-bold text-zinc-900">
              ₹{formatPrice(hasDiscount ? salePrice : basePrice)}
            </span>
            {hasDiscount && (
              <span className="text-[10px] sm:text-xs text-zinc-400 line-through">
                ₹{formatPrice(basePrice)}
              </span>
            )}
          </div>
          {moq && (
            <p className="text-[10px] text-zinc-500 font-medium">
              Min. order:{" "}
              <span className="text-zinc-800 font-bold">{moq} pcs</span>
            </p>
          )}

          {/* Version 2: availability chip */}
          <span className={`inline-flex w-fit items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${availabilityMeta.chipClass}`}>
            {availabilityMeta.label}
          </span>

          {/* Version 2: MOQ_UNMET warning */}
          {availability?.status === "MOQ_UNMET" && (
            <p className="text-[10px] text-amber-700 font-semibold">
              Min qty {availability?.requiredQuantity ?? moq ?? 0}, available {availability?.quantity ?? 0}
            </p>
          )}
        </div>

        <div className="mt-auto pt-2" onClick={(e) => e.stopPropagation()}>
          {!canPurchase ? (
            <button disabled className="w-full py-2 text-[10px] font-bold bg-zinc-100 text-zinc-400 rounded-xl cursor-not-allowed">
              {availabilityMeta.label}
            </button>
          ) : !isInCart ? (
            <button
              onClick={handleAddToCart}
              disabled={localLoading.add}
              className="w-full py-2 sm:py-3 text-[10px] sm:text-xs font-bold rounded-xl bg-[#35858E]/95 text-white hover:bg-[#35858E] transition-all flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer disabled:opacity-60"
            >
              {localLoading.add
                ? <><Loader2 size={12} className="animate-spin" /> Adding...</>
                : <><ShoppingBag size={12} /> ADD TO BAG</>
              }
            </button>
          ) : (
            <div className="flex flex-col gap-1">
              <div className="flex items-center w-full border-2 border-[#478B8D] rounded-xl overflow-hidden">
                {/* Version 2: disabled when at or below MOQ */}
                <button
                  onClick={handleDecrement}
                  disabled={isProcessing}
                  className="w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center bg-zinc-100 hover:bg-red-500 hover:text-white transition-colors disabled:opacity-40 flex-shrink-0"
                >
                  {localLoading.remove
                    ? <Loader2 size={11} className="animate-spin" />
                    : <Minus size={13} />
                  }
                </button>
                <div className="flex-1 text-center text-xs sm:text-sm font-bold text-zinc-900 select-none">
                  {localLoading.update
                    ? <Loader2 size={11} className="animate-spin mx-auto" />
                    : currentQty
                  }
                </div>
                <button
                  onClick={handleIncrement}
                  disabled={isAtMax || isProcessing}
                  className="w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center bg-[#478B8D]/90 text-white hover:bg-[#478B8D] transition-colors disabled:opacity-40 flex-shrink-0"
                >
                  {localLoading.update
                    ? <Loader2 size={11} className="animate-spin" />
                    : <Plus size={13} />
                  }
                </button>
              </div>
              {isAtMax && (
                <p className="text-[9px] text-center text-orange-500 font-semibold">
                  Max stock reached
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default WholesaleProductCard;