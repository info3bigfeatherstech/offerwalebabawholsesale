
// ─────────────────────────────────────────────────────────────────────────────
// store.js — MERGED WITH ADMIN PANEL REDUCERS & APIS FROM FIRST FILE
// ─────────────────────────────────────────────────────────────────────────────

import { configureStore } from "@reduxjs/toolkit";

// ========== YOUR EXISTING IMPORTS (PRESERVED) ==========
import { categoriesApi } from "../REDUX_SLICES/SHOP_BY_CATEGORY/categoriesApi";
import userCategoriesReducer from "../REDUX_SLICES/SHOP_BY_CATEGORY/userCategoriesSlice";
import userCartReducer from "../REDUX_SLICES/UserCart/userCartSlice";

import { productsApi } from "../REDUX_SLICES/ProductsApi/productsApi";
import userProductsReducer from "../REDUX_SLICES/ProductsApi/userProductsSlice";

// ── Wholesaler ───────────────────────────────────────────────────────────────
import { wholesalerApi } from "../REDUX_SLICES/WHOLESALE/wholesalerApi";
import wholesalerReducer from "../REDUX_SLICES/WHOLESALE/wholesalerSlice";

import { authApi } from "../REDUX_SLICES/authApi/authApi";
import authReducer from "../REDUX_SLICES/authApi/authSlice";

// ========== ADMIN PANEL IMPORTS (EXTRACTED FROM FIRST FILE) ==========
import { adminAuthApi } from "../../ADMIN_SEGMENT/ADMIN_REDUX_MANAGEMENT/adminAuthApi";
import adminAuthReducer from "../../ADMIN_SEGMENT/ADMIN_REDUX_MANAGEMENT/adminAuthSlice";
import adminProductCreateReducer from "../../ADMIN_SEGMENT/ADMIN_REDUX_MANAGEMENT/adminProductCreateSlice";
import adminGetProductsReducer from "../../ADMIN_SEGMENT/ADMIN_REDUX_MANAGEMENT/adminGetProductsSlice";
import adminEditProductReducer from "../../ADMIN_SEGMENT/ADMIN_REDUX_MANAGEMENT/adminEditProductSlice";
import inventoryStockReducer from "../../ADMIN_SEGMENT/ADMIN_REDUX_MANAGEMENT/inventoryStockSlice";
import adminArchivedReducer from "../../ADMIN_SEGMENT/ADMIN_REDUX_MANAGEMENT/adminArchivedSlice";
import adminBulkUploadReducer from "../../ADMIN_SEGMENT/ADMIN_REDUX_MANAGEMENT/bulkUploadSlice";
import categoriesReducer from "../../ADMIN_SEGMENT/ADMIN_REDUX_MANAGEMENT/categoriesSlice";
import { userAnalyticsApi } from "../../ADMIN_SEGMENT/ADMIN_REDUX_MANAGEMENT/userAnalyticsApi";
import { seoAnalyticsApi, seoUiReducer } from "../../ADMIN_SEGMENT/ADMIN_REDUX_MANAGEMENT/adminSeoAnalytics";
import adminOrdersUiReducer, {
  adminRtoUiReducer,
} from "../../ADMIN_SEGMENT/ADMIN_REDUX_MANAGEMENT/order_management/adminOrdersSlice";
import { adminOrdersApi } from "../../ADMIN_SEGMENT/ADMIN_REDUX_MANAGEMENT/order_management/adminOrdersApi";
import staffReducer from "../../ADMIN_SEGMENT/ADMIN_REDUX_MANAGEMENT/staffSlice";
import staffPasswordReducer from "../../ADMIN_SEGMENT/ADMIN_REDUX_MANAGEMENT/staffPasswordSlice";
import adminSelfPasswordReducer from "../../ADMIN_SEGMENT/ADMIN_REDUX_MANAGEMENT/adminSelfPasswordSlice";
import { wholesalerApi as adminWholesalerApi } from "../../ADMIN_SEGMENT/ADMIN_REDUX_MANAGEMENT/wholesalerApi/wholesalerApi";
import userWishlistReducer from "../REDUX_SLICES/UserWIshlist/userWishlistSLice";
import userAddressReducer from "../REDUX_SLICES/Useraddressslice";
import { searchApi } from "../REDUX_SLICES/searchApi";
import { notificationsApi } from "../REDUX_SLICES/notificationsApi";
import orderReducer from "../REDUX_SLICES/orderSlice";
import checkoutReducer from "../REDUX_SLICES/checkoutSlice/checkoutSlice";
import couponReducer from '../../ADMIN_SEGMENT/ADMIN_REDUX_MANAGEMENT/couponApi/CouponSlice';
import { couponApi } from '../../ADMIN_SEGMENT/ADMIN_REDUX_MANAGEMENT/couponApi/couponApi';
import { outOfStockInquiryApi } from '../../ADMIN_SEGMENT/ADMIN_REDUX_MANAGEMENT/outOfStockInquiryApi';

export const store = configureStore({
  reducer: {
    // ========== YOUR EXISTING REDUCERS (PRESERVED) ==========
    auth: authReducer,
    [authApi.reducerPath]: authApi.reducer,
    [categoriesApi.reducerPath]: categoriesApi.reducer,
    [productsApi.reducerPath]: productsApi.reducer,
    [wholesalerApi.reducerPath]: wholesalerApi.reducer,
    [searchApi.reducerPath]: searchApi.reducer,
    [notificationsApi.reducerPath]: notificationsApi.reducer,
    userCategories: userCategoriesReducer,
    userProducts: userProductsReducer,
    wholesaler: wholesalerReducer,
     userCart: userCartReducer,
     userWishlist: userWishlistReducer,
     userAddress: userAddressReducer,
       orders: orderReducer,
           checkout: checkoutReducer,


    // ========== ADMIN PANEL REDUCERS (EXTRACTED FROM FIRST FILE) ==========
    adminAuth: adminAuthReducer,
    adminProductCreate: adminProductCreateReducer,
    adminGetProducts: adminGetProductsReducer,
    adminEditProduct: adminEditProductReducer,
    inventoryStock: inventoryStockReducer,
    adminArchived: adminArchivedReducer,
    adminBulkUpload: adminBulkUploadReducer,
    categories: categoriesReducer,
    staff: staffReducer,
    staffPassword: staffPasswordReducer,
    adminSelfPassword: adminSelfPasswordReducer,
    seoUi: seoUiReducer,
    adminOrdersUi: adminOrdersUiReducer,
    adminRtoUi: adminRtoUiReducer,
        [couponApi.reducerPath]: couponApi.reducer,
    [userAnalyticsApi.reducerPath]: userAnalyticsApi.reducer,
    [seoAnalyticsApi.reducerPath]: seoAnalyticsApi.reducer,
    [adminOrdersApi.reducerPath]: adminOrdersApi.reducer,
    [adminAuthApi.reducerPath]: adminAuthApi.reducer,
    [adminWholesalerApi.reducerPath]: adminWholesalerApi.reducer,
    [outOfStockInquiryApi.reducerPath]: outOfStockInquiryApi.reducer,
  },

  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActionPaths: [
          'meta.arg',
          'meta.baseQueryMeta',
          'meta.baseQueryMeta.request',
          'meta.baseQueryMeta.response',
        ],
        ignoredPaths: [
          "wholesaler.formData.idProofFile",
          "wholesaler.formData.businessAddressProofFile",
        ],
      },
    }).concat(
      // YOUR EXISTING MIDDLEWARES
      categoriesApi.middleware,
      productsApi.middleware,
      wholesalerApi.middleware,
      authApi.middleware,
      searchApi.middleware,
      notificationsApi.middleware,
      // ADMIN MIDDLEWARES (EXTRACTED FROM FIRST FILE)
      adminAuthApi.middleware,
      userAnalyticsApi.middleware,
      seoAnalyticsApi.middleware,
      adminOrdersApi.middleware,
      adminWholesalerApi.middleware,
            couponApi.middleware,
      outOfStockInquiryApi.middleware,
    ),
  
  devTools: import.meta.env.MODE !== "production",
});

export default store;