import { createApi } from '@reduxjs/toolkit/query/react';
// import wholesaleAxios from '../../../SERVICES/wholesaleAxios';
import wholesaleAxios from "../../../SERVICES/Wholesaleaxios";

// Custom axios base query for RTK Query
const axiosBaseQuery = ({ baseUrl } = { baseUrl: '' }) => 
  async ({ url, method, data, params, headers, timeout }) => {
    try {
      const result = await wholesaleAxios({
        url: baseUrl + url,
        method,
        data,
        params,
        headers: { ...headers },
        ...(timeout != null ? { timeout } : {}),
      });
      return { data: result.data };
    } catch (axiosError) {
      const err = axiosError;
      console.error('[RTK Query Error]', {
        url,
        method,
        status: err.response?.status,
        message: err.response?.data?.message || err.message,
        timestamp: new Date().toISOString(),
      });
      return {
        error: {
          status: err.response?.status,
          data: err.response?.data || err.message,
        },
      };
    }
  };

// Create API slice
export const userAnalyticsApi = createApi({
  reducerPath: 'userAnalyticsApi',
  baseQuery: axiosBaseQuery({ baseUrl: '' }),
  tagTypes: ['Users', 'Carts', 'Wishlists', 'Dashboard', 'LeadsPushSettings', 'Engagement'],
  keepUnusedDataFor: 60, // Cache for 60 seconds
  endpoints: (builder) => ({

    // ========== USER ENDPOINTS ==========
    
    // Get all users (paginated, searchable)
    getAllUsers: builder.query({
      query: ({ page = 1, limit = 20, search = '', role = '' }) => ({
        url: '/admin/analytics/users',
        method: 'GET',
        params: { page, limit, search, role },
      }),
      providesTags: (result) => 
        result?.data 
          ? [...result.data.map(({ _id }) => ({ type: 'Users', id: _id })), { type: 'Users', id: 'LIST' }]
          : [{ type: 'Users', id: 'LIST' }],
    }),

    // Get single user with cart & wishlist
    getUserById: builder.query({
      query: (userId) => ({
        url: `/admin/analytics/users/${userId}`,
        method: 'GET',
      }),
      providesTags: (result, error, userId) => [{ type: 'Users', id: userId }],
    }),

    // Send personalized cart reminders to selected users.
    sendBulkCartReminderEmail: builder.mutation({
      query: (userIds) => ({
        url: '/admin/analytics/users/bulk-cart-reminder-email',
        method: 'POST',
        data: { userIds },
        timeout: 180_000,
      }),
    }),

    sendBulkCartReminderPush: builder.mutation({
      query: (userIds) => ({
        url: '/admin/analytics/users/bulk-cart-reminder-push',
        method: 'POST',
        data: { userIds },
        timeout: 60_000,
      }),
    }),

    sendBulkWishlistReminderPush: builder.mutation({
      query: (userIds) => ({
        url: '/admin/analytics/users/bulk-wishlist-reminder-push',
        method: 'POST',
        data: { userIds },
        timeout: 60_000,
      }),
    }),

    getLeadsPushSettings: builder.query({
      query: () => ({
        url: '/admin/analytics/push-settings',
        method: 'GET',
      }),
      providesTags: ['LeadsPushSettings'],
    }),

    updateLeadsPushSettings: builder.mutation({
      query: (body) => ({
        url: '/admin/analytics/push-settings',
        method: 'PUT',
        data: body,
      }),
      invalidatesTags: ['LeadsPushSettings'],
    }),

    // ========== ENGAGEMENT (push + PWA) ==========

    getEngagementSummary: builder.query({
      query: () => ({
        url: '/admin/analytics/engagement/summary',
        method: 'GET',
      }),
      providesTags: [{ type: 'Engagement', id: 'SUMMARY' }],
    }),

    getPushSubscribers: builder.query({
      query: ({ page = 1, limit = 20, search = '' } = {}) => ({
        url: '/admin/analytics/engagement/push-subscribers',
        method: 'GET',
        params: { page, limit, search },
      }),
      providesTags: [{ type: 'Engagement', id: 'PUSH_LIST' }],
    }),

    getPwaInstalls: builder.query({
      query: ({ page = 1, limit = 20, search = '' } = {}) => ({
        url: '/admin/analytics/engagement/pwa-installs',
        method: 'GET',
        params: { page, limit, search },
      }),
      providesTags: [{ type: 'Engagement', id: 'PWA_LIST' }],
    }),

    // ========== CART ENDPOINTS ==========

    // Get all carts
    getAllCarts: builder.query({
      query: ({ page = 1, limit = 20, sortBy = 'createdAt', order = 'desc' }) => ({
        url: '/admin/analytics/carts',
        method: 'GET',
        params: { page, limit, sortBy, order },
      }),
      providesTags: ['Carts'],
    }),

    // Get abandoned carts (older than X hours)
    getAbandonedCarts: builder.query({
      query: ({ page = 1, limit = 20, hours = 24 }) => ({
        url: '/admin/analytics/carts/abandoned',
        method: 'GET',
        params: { page, limit, hours },
      }),
      providesTags: ['Carts'],
    }),

    // Get high value carts (above threshold)
    getHighValueCarts: builder.query({
      query: ({ page = 1, limit = 20, minAmount = 5000 }) => ({
        url: '/admin/analytics/carts/high-value',
        method: 'GET',
        params: { page, limit, minAmount },
      }),
      providesTags: ['Carts'],
    }),

    // Get single cart with full item details
    getCartById: builder.query({
      query: (cartId) => ({
        url: `/admin/analytics/carts/${cartId}`,
        method: 'GET',
      }),
      providesTags: (result, error, cartId) => [{ type: 'Carts', id: cartId }],
    }),

    // ========== WISHLIST ENDPOINTS ==========

    // Get all wishlists
    getAllWishlists: builder.query({
      query: ({ page = 1, limit = 20, sortBy = 'createdAt', order = 'desc' }) => ({
        url: '/admin/analytics/wishlists',
        method: 'GET',
        params: { page, limit, sortBy, order },
      }),
      providesTags: ['Wishlists'],
    }),

    // Get stale wishlists (items added X days ago)
    getStaleWishlists: builder.query({
      query: ({ page = 1, limit = 20, days = 7 }) => ({
        url: '/admin/analytics/wishlists/stale',
        method: 'GET',
        params: { page, limit, days },
      }),
      providesTags: ['Wishlists'],
    }),

    // Get most wishlisted products
    getPopularWishlistProducts: builder.query({
      query: ({ limit = 20 }) => ({
        url: '/admin/analytics/wishlists/popular-products',
        method: 'GET',
        params: { limit },
      }),
      providesTags: ['Wishlists'],
    }),

    // ========== DASHBOARD ENDPOINTS ==========

    // Get dashboard summary
    getDashboardSummary: builder.query({
      query: () => ({
        url: '/admin/analytics/dashboard/summary',
        method: 'GET',
      }),
      providesTags: ['Dashboard'],
    }),
  }),
});

// Export hooks
export const {
  useGetAllUsersQuery,
  useGetUserByIdQuery,
  useSendBulkCartReminderEmailMutation,
  useSendBulkCartReminderPushMutation,
  useSendBulkWishlistReminderPushMutation,
  useGetLeadsPushSettingsQuery,
  useUpdateLeadsPushSettingsMutation,
  useGetEngagementSummaryQuery,
  useGetPushSubscribersQuery,
  useGetPwaInstallsQuery,
  useGetAllCartsQuery,
  useGetAbandonedCartsQuery,
  useGetHighValueCartsQuery,
  useGetCartByIdQuery,
  useGetAllWishlistsQuery,
  useGetStaleWishlistsQuery,
  useGetPopularWishlistProductsQuery,
  useGetDashboardSummaryQuery,
} = userAnalyticsApi;