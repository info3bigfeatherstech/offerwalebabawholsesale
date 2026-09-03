import { createApi } from '@reduxjs/toolkit/query/react';
import wholesaleAxios, { AUTH_CONTEXT_ADMIN } from '../../../../SERVICES/Wholesaleaxios';

/**
 * Axios adapter for RTK Query — matches userAnalyticsApi pattern; never use raw axios in components.
 */
const axiosBaseQuery =
  ({ baseUrl } = { baseUrl: '' }) =>
  async ({ url, method, data, params, headers, responseType }) => {
    try {
      const result = await wholesaleAxios({
        url: baseUrl + url,
        method,
        data,
        params,
        headers: { ...headers },
        authContext: AUTH_CONTEXT_ADMIN,
        ...(responseType ? { responseType } : {}),
      });
      return { data: result.data };
    } catch (axiosError) {
      const err = axiosError;
      const status = err.response?.status;
      const payload = err.response?.data;
      const message =
        (typeof payload === 'object' && payload?.message) ||
        (typeof payload === 'string' ? payload : null) ||
        err.message;
      return {
        error: {
          status,
          data: payload ?? { message },
          message,
        },
      };
    }
  };

/**
 * @typedef {Object} AdminOrdersSummaryResponse
 * @property {boolean} success
 * @property {Object} data
 */

export const adminOrdersApi = createApi({
  reducerPath: 'adminOrdersApi',
  baseQuery: axiosBaseQuery({ baseUrl: '' }),
  tagTypes: ['AdminOrdersSummary', 'AdminOrdersList', 'AdminOrderTracking', 'AdminRtoList', 'AdminRtoAnalytics'],
  keepUnusedDataFor: 30,
  endpoints: (builder) => ({
    /**
     * Dashboard cards + tab counts (always all-time — ignore table filters).
     * GET /api/admin/orders/summary?rangePreset=all
     */
    getAdminOrdersSummary: builder.query({
      query: (arg = {}) => {
        const params = {};
        if (arg.from) params.from = arg.from;
        if (arg.to) params.to = arg.to;
        if (arg.rangePreset) params.rangePreset = arg.rangePreset;
        if (arg.presetDays != null && arg.presetDays !== '' && !arg.from && !arg.to && !arg.rangePreset) {
          params.presetDays = arg.presetDays;
        }
        if (arg.preset === '30d') params.preset = '30d';
        return {
          url: '/admin/orders/summary',
          method: 'GET',
          params,
        };
      },
      providesTags: [{ type: 'AdminOrdersSummary', id: 'SUMMARY' }],
    }),

    /**
     * Background auto-sync: Shiprocket + Shipmozo forward status → DB for stale orders in date range.
     * POST /api/admin/orders/auto-sync-statuses
     */
    adminAutoSyncOrderStatuses: builder.mutation({
      query: (arg = {}) => {
        const params = {};
        if (arg.from) params.from = arg.from;
        if (arg.to) params.to = arg.to;
        if (arg.rangePreset) params.rangePreset = arg.rangePreset;
        if (arg.presetDays != null && arg.presetDays !== '' && !arg.from && !arg.to && !arg.rangePreset) {
          params.presetDays = arg.presetDays;
        }
        if (arg.preset === '30d') params.preset = '30d';
        if (arg.staleMinutes != null) params.staleMinutes = arg.staleMinutes;
        if (arg.maxRunMs != null) params.maxRunMs = arg.maxRunMs;
        return {
          url: '/admin/orders/auto-sync-statuses',
          method: 'POST',
          params,
        };
      },
      invalidatesTags: (result, error) => {
        if (error) return [];
        const synced = result?.data?.summary?.synced ?? 0;
        if (synced <= 0) return [];
        return [
          { type: 'AdminOrdersList', id: 'PARTIAL' },
          { type: 'AdminOrdersSummary', id: 'SUMMARY' },
        ];
      },
    }),

    /**
     * Paginated list with filters.
     * GET /api/admin/orders
     */
    getAdminOrdersList: builder.query({
      query: (arg = {}) => {
        const params = {
          page: arg.page ?? 1,
          limit: arg.limit ?? 20,
          sortBy: arg.sortBy ?? 'createdAt',
          sortOrder: arg.sortOrder ?? 'desc',
        };
        if (arg.from) params.from = arg.from;
        if (arg.to) params.to = arg.to;
        if (arg.rangePreset) params.rangePreset = arg.rangePreset;
        if (arg.presetDays != null && arg.presetDays !== '' && !arg.from && !arg.to && !arg.rangePreset) {
          params.presetDays = arg.presetDays;
        }
        if (arg.preset === '30d') params.preset = '30d';
        if (arg.bucket && arg.bucket !== 'all') params.bucket = arg.bucket;
        if (arg.search && String(arg.search).trim()) params.search = String(arg.search).trim();
        return {
          url: '/admin/orders',
          method: 'GET',
          params,
        };
      },
      providesTags: (result) =>
        result?.data?.orders?.length
          ? [
              ...result.data.orders.map((o) => ({
                type: 'AdminOrdersList',
                id: o.orderId,
              })),
              { type: 'AdminOrdersList', id: 'PARTIAL' },
            ]
          : [{ type: 'AdminOrdersList', id: 'PARTIAL' }],
    }),

    /**
     * Single order (existing user-facing route; admin / order_manager allowed server-side).
     * GET /api/orders/items/:orderId
     */
    getAdminOrderDetail: builder.query({
      query: (orderId) => ({
        url: `/orders/items/${encodeURIComponent(String(orderId))}`,
        method: 'GET',
      }),
      providesTags: (result, error, orderId) => [{ type: 'AdminOrdersList', id: orderId }],
    }),

    /**
     * Live tracking + timeline sync from provider.
     * GET /api/orders/items/:orderId/track
     */
    getAdminOrderTracking: builder.query({
      query: (orderId) => ({
        url: `/orders/items/${encodeURIComponent(String(orderId))}/track`,
        method: 'GET',
      }),
      providesTags: (result, error, orderId) => [{ type: 'AdminOrderTracking', id: orderId }],
    }),

    getAdminReturnRequests: builder.query({
      query: (arg = {}) => ({
        url: '/orders/admin/returns/requests',
        method: 'GET',
        params: {
          page: arg.page ?? 1,
          limit: arg.limit ?? 20,
          ...(arg.status ? { status: arg.status } : {}),
        },
      }),
      providesTags: [{ type: 'AdminOrderTracking', id: 'RETURNS_LIST' }],
    }),

    getAdminReturnRequestDetail: builder.query({
      query: (orderId) => ({
        url: `/orders/admin/returns/requests/${encodeURIComponent(String(orderId))}`,
        method: 'GET',
      }),
      providesTags: (result, error, orderId) => [{ type: 'AdminOrderTracking', id: `RETURN_${orderId}` }],
    }),

    decideAdminReturnRequest: builder.mutation({
      query: ({ orderId, decision, decisionReason }) => ({
        url: `/orders/admin/returns/requests/${encodeURIComponent(String(orderId))}/decision`,
        method: 'POST',
        data: { decision, decisionReason },
      }),
      invalidatesTags: (result, error, arg) => [
        { type: 'AdminOrderTracking', id: 'RETURNS_LIST' },
        { type: 'AdminOrderTracking', id: `RETURN_${arg.orderId}` },
        { type: 'AdminOrdersList', id: arg.orderId },
      ],
    }),

    initiateAdminReturnRefund: builder.mutation({
      query: ({ orderId }) => ({
        url: `/orders/admin/returns/requests/${encodeURIComponent(String(orderId))}/refund`,
        method: 'POST',
      }),
      invalidatesTags: (result, error, arg) => [
        { type: 'AdminOrderTracking', id: 'RETURNS_LIST' },
        { type: 'AdminOrderTracking', id: `RETURN_${arg.orderId}` },
        { type: 'AdminOrdersList', id: arg.orderId },
      ],
    }),

    adminReturnReversePickupRetry: builder.mutation({
      query: ({ orderId }) => ({
        url: `/orders/admin/returns/requests/${encodeURIComponent(String(orderId))}/reverse-pickup/retry`,
        method: 'POST',
      }),
      invalidatesTags: (result, error, arg) => [
        { type: 'AdminOrderTracking', id: 'RETURNS_LIST' },
        { type: 'AdminOrderTracking', id: `RETURN_${arg.orderId}` },
        { type: 'AdminOrdersList', id: arg.orderId },
      ],
    }),

    getAdminReturnChat: builder.query({
      query: (orderId) => ({
        url: `/orders/admin/returns/requests/${encodeURIComponent(String(orderId))}/chat`,
        method: 'GET',
      }),
      providesTags: (result, error, orderId) => [{ type: 'AdminOrderTracking', id: `RETURN_CHAT_${orderId}` }],
      async onQueryStarted(orderId, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          dispatch(
            adminOrdersApi.util.updateQueryData(
              'getAdminReturnRequestDetail',
              orderId,
              (draft) => {
                if (draft?.order?.returnInfo) {
                  draft.order.returnInfo.adminLastRead = data.adminLastRead;
                  draft.order.returnInfo.userLastRead = data.userLastRead;
                  draft.order.returnInfo.chat = data.chat;
                }
              }
            )
          );
        } catch {
          // ignore
        }
      }
    }),

    sendAdminReturnChatMessage: builder.mutation({
      query: ({ orderId, message }) => ({
        url: `/orders/admin/returns/requests/${encodeURIComponent(String(orderId))}/chat`,
        method: 'POST',
        data: { message },
      }),
      invalidatesTags: (result, error, arg) => [
        { type: 'AdminOrderTracking', id: `RETURN_CHAT_${arg.orderId}` },
        { type: 'AdminOrderTracking', id: `RETURN_${arg.orderId}` },
        { type: 'AdminOrdersList', id: arg.orderId },
      ],
    }),

    adminFulfillmentEnsureShipment: builder.mutation({
      query: (orderId) => ({
        url: `/orders/admin/items/${encodeURIComponent(String(orderId))}/fulfillment/ensure-shipment`,
        method: 'POST',
      }),
      invalidatesTags: (result, error, orderId) => [
        { type: 'AdminOrdersList', id: orderId },
        { type: 'AdminOrderTracking', id: orderId },
      ],
    }),

    adminFulfillmentAssignShip: builder.mutation({
      query: ({ orderId, courierId, confirmSubstitute }) => ({
        url: `/orders/admin/items/${encodeURIComponent(String(orderId))}/fulfillment/assign-ship`,
        method: 'POST',
        data: {
          ...(courierId != null ? { courierId } : {}),
          ...(confirmSubstitute ? { confirmSubstitute: true } : {})
        },
      }),
      invalidatesTags: (result, error, arg) => [
        { type: 'AdminOrdersList', id: arg.orderId },
        { type: 'AdminOrderTracking', id: arg.orderId },
      ],
    }),

    getAdminPickupCalendar: builder.query({
      query: (arg = {}) => ({
        url: '/orders/admin/fulfillment/pickup-calendar',
        method: 'GET',
        params: {
          ...(arg.daysAhead != null ? { daysAhead: arg.daysAhead } : {}),
          ...(arg.refresh ? { refresh: '1' } : {}),
        },
      }),
      providesTags: [{ type: 'AdminOrdersSummary', id: 'PICKUP_CALENDAR' }],
    }),

    adminFulfillmentSyncShiprocket: builder.mutation({
      query: (orderId) => ({
        url: `/orders/admin/items/${encodeURIComponent(String(orderId))}/fulfillment/sync-shiprocket`,
        method: 'POST',
      }),
      invalidatesTags: (result, error, orderId) => [
        { type: 'AdminOrdersList', id: orderId },
        { type: 'AdminOrderTracking', id: orderId },
      ],
    }),

    adminFulfillmentSchedulePickup: builder.mutation({
      query: ({ orderId, pickupDate }) => ({
        url: `/orders/admin/items/${encodeURIComponent(String(orderId))}/fulfillment/schedule-pickup`,
        method: 'POST',
        data: { pickupDate },
      }),
      invalidatesTags: (result, error, arg) => [
        { type: 'AdminOrdersList', id: arg.orderId },
        { type: 'AdminOrderTracking', id: arg.orderId },
      ],
    }),

    adminFulfillmentManifest: builder.mutation({
      query: (orderId) => ({
        url: `/orders/admin/items/${encodeURIComponent(String(orderId))}/fulfillment/manifest`,
        method: 'POST',
      }),
      invalidatesTags: (result, error, orderId) => [
        { type: 'AdminOrdersList', id: orderId },
        { type: 'AdminOrderTracking', id: orderId },
      ],
    }),

    adminBulkApprovalConfirm: builder.mutation({
      query: (arg = {}) => ({
        url: '/orders/admin/items/bulk-approval/confirm',
        method: 'POST',
        data: {
          orderIds: arg.orderIds,
          ...(arg.concurrency != null && arg.concurrency !== '' ? { concurrency: arg.concurrency } : {}),
        },
      }),
      invalidatesTags: (result, error, arg) => {
        if (error) return [];
        const tags = [
          { type: 'AdminOrdersList', id: 'PARTIAL' },
          { type: 'AdminOrdersSummary', id: 'SUMMARY' },
        ];
        const ids = Array.isArray(arg?.orderIds) ? arg.orderIds : [];
        for (const oid of ids) {
          tags.push({ type: 'AdminOrdersList', id: oid }, { type: 'AdminOrderTracking', id: oid });
        }
        return tags;
      },
    }),

    adminBulkApprovalCancel: builder.mutation({
      query: (arg = {}) => ({
        url: '/orders/admin/items/bulk-approval/cancel',
        method: 'POST',
        data: {
          orderIds: arg.orderIds,
          ...(arg.concurrency != null && arg.concurrency !== '' ? { concurrency: arg.concurrency } : {}),
        },
      }),
      invalidatesTags: (result, error, arg) => {
        if (error) return [];
        const tags = [
          { type: 'AdminOrdersList', id: 'PARTIAL' },
          { type: 'AdminOrdersSummary', id: 'SUMMARY' },
        ];
        const ids = Array.isArray(arg?.orderIds) ? arg.orderIds : [];
        for (const oid of ids) {
          tags.push({ type: 'AdminOrdersList', id: oid }, { type: 'AdminOrderTracking', id: oid });
        }
        return tags;
      },
    }),

    /**
     * Preview pending-order item remove / qty reduce (no persist).
     * POST /api/orders/admin/items/:orderId/edit-pending/preview
     */
    adminPreviewPendingOrderEdit: builder.mutation({
      query: ({ orderId, itemUpdates }) => ({
        url: `/orders/admin/items/${encodeURIComponent(String(orderId))}/edit-pending/preview`,
        method: 'POST',
        data: { itemUpdates },
      }),
    }),

    /**
     * Apply pending-order item remove / qty reduce (reprice + refund/COD settle).
     * POST /api/orders/admin/items/:orderId/edit-pending
     */
    adminApplyPendingOrderEdit: builder.mutation({
      query: ({ orderId, itemUpdates }) => ({
        url: `/orders/admin/items/${encodeURIComponent(String(orderId))}/edit-pending`,
        method: 'POST',
        data: { itemUpdates },
      }),
      invalidatesTags: (result, error, arg) => {
        if (error) return [];
        return [
          { type: 'AdminOrdersList', id: 'PARTIAL' },
          { type: 'AdminOrdersSummary', id: 'SUMMARY' },
          { type: 'AdminOrdersList', id: arg.orderId },
          { type: 'AdminOrderTracking', id: arg.orderId },
        ];
      },
    }),

    /**
     * Address Valid/Junk score (local pre-ship + Shiprocket orders/show when available).
     * GET /api/orders/admin/items/:orderId/address-intelligence
     */
    getAdminAddressIntelligence: builder.query({
      query: ({ orderId, refresh } = {}) => ({
        url: `/orders/admin/items/${encodeURIComponent(String(orderId))}/address-intelligence`,
        method: 'GET',
        params: refresh ? { refresh: 1 } : undefined,
      }),
      providesTags: (result, error, arg) => [
        { type: 'AdminOrdersList', id: `ADDR_${arg?.orderId || arg}` },
      ],
    }),

    adminPreviewPendingAddressEdit: builder.mutation({
      query: ({ orderId, addressPatch, alsoUpdateSavedAddress }) => ({
        url: `/orders/admin/items/${encodeURIComponent(String(orderId))}/edit-pending-address/preview`,
        method: 'POST',
        data: { addressPatch, alsoUpdateSavedAddress: Boolean(alsoUpdateSavedAddress) },
      }),
    }),

    adminApplyPendingAddressEdit: builder.mutation({
      query: ({ orderId, addressPatch, alsoUpdateSavedAddress }) => ({
        url: `/orders/admin/items/${encodeURIComponent(String(orderId))}/edit-pending-address`,
        method: 'POST',
        data: { addressPatch, alsoUpdateSavedAddress: Boolean(alsoUpdateSavedAddress) },
      }),
      invalidatesTags: (result, error, arg) => {
        if (error) return [];
        return [
          { type: 'AdminOrdersList', id: 'PARTIAL' },
          { type: 'AdminOrdersSummary', id: 'SUMMARY' },
          { type: 'AdminOrdersList', id: arg.orderId },
          { type: 'AdminOrdersList', id: `ADDR_${arg.orderId}` },
          { type: 'AdminOrderTracking', id: arg.orderId },
        ];
      },
    }),

    adminBulkFulfillmentShipNow: builder.mutation({
      query: (arg = {}) => ({
        url: '/orders/admin/items/bulk-fulfillment/ship-now',
        method: 'POST',
        data: {
          orderIds: arg.orderIds,
          ...(arg.concurrency != null && arg.concurrency !== '' ? { concurrency: arg.concurrency } : {}),
          ...(arg.courierId != null && arg.courierId !== '' ? { courierId: arg.courierId } : {}),
        },
      }),
      invalidatesTags: (result, error, arg) => {
        if (error) return [];
        const tags = [
          { type: 'AdminOrdersList', id: 'PARTIAL' },
          { type: 'AdminOrdersSummary', id: 'SUMMARY' },
        ];
        const ids = Array.isArray(arg?.orderIds) ? arg.orderIds : [];
        for (const oid of ids) {
          tags.push({ type: 'AdminOrdersList', id: oid }, { type: 'AdminOrderTracking', id: oid });
        }
        return tags;
      },
    }),

    adminBulkFulfillmentSchedulePickup: builder.mutation({
      query: (arg = {}) => ({
        url: '/orders/admin/items/bulk-fulfillment/schedule-pickup',
        method: 'POST',
        data: {
          orderIds: arg.orderIds,
          pickupDate: arg.pickupDate,
          ...(arg.concurrency != null && arg.concurrency !== '' ? { concurrency: arg.concurrency } : {}),
        },
      }),
      invalidatesTags: (result, error, arg) => {
        if (error) return [];
        const tags = [
          { type: 'AdminOrdersList', id: 'PARTIAL' },
          { type: 'AdminOrdersSummary', id: 'SUMMARY' },
        ];
        const ids = Array.isArray(arg?.orderIds) ? arg.orderIds : [];
        for (const oid of ids) {
          tags.push({ type: 'AdminOrdersList', id: oid }, { type: 'AdminOrderTracking', id: oid });
        }
        return tags;
      },
    }),

    adminBulkFulfillmentSyncShiprocket: builder.mutation({
      query: (arg = {}) => ({
        url: '/orders/admin/items/bulk-fulfillment/sync-shiprocket',
        method: 'POST',
        data: {
          orderIds: arg.orderIds,
          ...(arg.concurrency != null && arg.concurrency !== '' ? { concurrency: arg.concurrency } : {}),
        },
      }),
      invalidatesTags: (result, error, arg) => {
        if (error) return [];
        const tags = [
          { type: 'AdminOrdersList', id: 'PARTIAL' },
          { type: 'AdminOrdersSummary', id: 'SUMMARY' },
        ];
        const ids = Array.isArray(arg?.orderIds) ? arg.orderIds : [];
        for (const oid of ids) {
          tags.push({ type: 'AdminOrdersList', id: oid }, { type: 'AdminOrderTracking', id: oid });
        }
        return tags;
      },
    }),

    adminFulfillmentShippingLabel: builder.mutation({
      query: (orderId) => ({
        url: `/orders/admin/items/${encodeURIComponent(String(orderId))}/fulfillment/shipping-label`,
        method: 'POST',
      }),
      invalidatesTags: (result, error, orderId) => [
        { type: 'AdminOrdersList', id: orderId },
        { type: 'AdminOrderTracking', id: orderId },
      ],
    }),

    adminFulfillmentCancelShipment: builder.mutation({
      query: (orderId) => ({
        url: `/orders/admin/items/${encodeURIComponent(String(orderId))}/fulfillment/cancel-shipment`,
        method: 'POST',
      }),
      invalidatesTags: (result, error, orderId) => [
        { type: 'AdminOrdersList', id: orderId },
        { type: 'AdminOrderTracking', id: orderId },
      ],
    }),

    adminFulfillmentRetryPickup: builder.mutation({
      query: (orderId) => ({
        url: `/orders/admin/items/${encodeURIComponent(String(orderId))}/fulfillment/retry-pickup`,
        method: 'POST',
      }),
      invalidatesTags: (result, error, orderId) => [
        { type: 'AdminOrdersList', id: orderId },
        { type: 'AdminOrderTracking', id: orderId },
      ],
    }),

    getAdminRtoOrders: builder.query({
      query: (params = {}) => ({
        url: '/admin/rto/orders',
        method: 'GET',
        params,
      }),
      providesTags: (result) => {
        const tags = [
          { type: 'AdminRtoList', id: 'LIST' },
          { type: 'AdminRtoAnalytics', id: 'SUMMARY' },
        ];
        const orders = result?.data?.orders;
        if (Array.isArray(orders)) {
          for (const o of orders) {
            if (o?.orderId) tags.push({ type: 'AdminRtoList', id: o.orderId });
          }
        }
        return tags;
      },
    }),

    getAdminRtoAnalytics: builder.query({
      query: (params = {}) => ({
        url: '/admin/rto/analytics',
        method: 'GET',
        params,
      }),
      providesTags: [{ type: 'AdminRtoAnalytics', id: 'SUMMARY' }],
    }),

    /**
     * Background RTO sync: Shiprocket → DB for stale non-warehouse-delivered RTO orders.
     * POST /api/admin/rto/auto-sync-statuses
     */
    adminAutoSyncRtoStatuses: builder.mutation({
      query: (arg = {}) => {
        const params = {};
        if (arg.from) params.from = arg.from;
        if (arg.to) params.to = arg.to;
        if (arg.rangePreset) params.rangePreset = arg.rangePreset;
        if (arg.presetDays != null && arg.presetDays !== '' && !arg.from && !arg.to && !arg.rangePreset) {
          params.presetDays = arg.presetDays;
        }
        if (arg.preset === '30d') params.preset = '30d';
        if (arg.staleMinutes != null) params.staleMinutes = arg.staleMinutes;
        if (arg.maxRunMs != null) params.maxRunMs = arg.maxRunMs;
        return {
          url: '/admin/rto/auto-sync-statuses',
          method: 'POST',
          params,
        };
      },
      invalidatesTags: (result, error) => {
        if (error) return [];
        const updated = result?.data?.summary?.updated ?? 0;
        const synced = result?.data?.summary?.synced ?? 0;
        if (updated <= 0 && synced <= 0) return [];
        return [
          { type: 'AdminRtoList', id: 'LIST' },
          { type: 'AdminRtoAnalytics', id: 'SUMMARY' },
        ];
      },
    }),

    exportAdminRtoReport: builder.query({
      query: (params = {}) => ({
        url: '/admin/rto/report',
        method: 'GET',
        params,
        responseType: 'blob',
      }),
    }),

    adminRtoRefund: builder.mutation({
      query: (body) => ({
        url: '/admin/rto/refund',
        method: 'POST',
        data: body,
      }),
      invalidatesTags: (result, error, arg) => {
        if (error) return [];
        const id = arg?.orderId;
        return [
          { type: 'AdminRtoList', id: 'LIST' },
          { type: 'AdminRtoAnalytics', id: 'SUMMARY' },
          ...(id ? [{ type: 'AdminRtoList', id: String(id) }] : []),
        ];
      },
    }),

    adminRtoReject: builder.mutation({
      query: (body) => ({
        url: '/admin/rto/reject',
        method: 'POST',
        data: body,
      }),
      invalidatesTags: (result, error, arg) => {
        if (error) return [];
        const id = arg?.orderId;
        return [
          { type: 'AdminRtoList', id: 'LIST' },
          { type: 'AdminRtoAnalytics', id: 'SUMMARY' },
          ...(id ? [{ type: 'AdminRtoList', id: String(id) }] : []),
        ];
      },
    }),

    /** @deprecated use adminRtoReject */
    adminRtoResolve: builder.mutation({
      query: (body) => ({
        url: '/admin/rto/reject',
        method: 'POST',
        data: body,
      }),
      invalidatesTags: (result, error, arg) => {
        if (error) return [];
        const id = arg?.orderId;
        return [
          { type: 'AdminRtoList', id: 'LIST' },
          { type: 'AdminRtoAnalytics', id: 'SUMMARY' },
          ...(id ? [{ type: 'AdminRtoList', id: String(id) }] : []),
        ];
      },
    }),

    adminRtoBulkAction: builder.mutation({
      query: (body) => ({
        url: '/admin/rto/bulk-action',
        method: 'POST',
        data: body,
      }),
      invalidatesTags: (result, error) => {
        if (error) return [];
        return [
          { type: 'AdminRtoList', id: 'LIST' },
          { type: 'AdminRtoAnalytics', id: 'SUMMARY' },
        ];
      },
    }),
  }),
});

export const {
  useGetAdminOrdersSummaryQuery,
  useGetAdminOrdersListQuery,
  useAdminAutoSyncOrderStatusesMutation,
  useGetAdminOrderDetailQuery,
  useLazyGetAdminOrderDetailQuery,
  useGetAdminOrderTrackingQuery,
  useGetAdminReturnRequestsQuery,
  useGetAdminReturnRequestDetailQuery,
  useDecideAdminReturnRequestMutation,
  useInitiateAdminReturnRefundMutation,
  useAdminReturnReversePickupRetryMutation,
  useGetAdminReturnChatQuery,
  useSendAdminReturnChatMessageMutation,
  useAdminFulfillmentEnsureShipmentMutation,
  useAdminFulfillmentAssignShipMutation,
  useGetAdminPickupCalendarQuery,
  useAdminFulfillmentSyncShiprocketMutation,
  useAdminFulfillmentSchedulePickupMutation,
  useAdminFulfillmentManifestMutation,
  useAdminFulfillmentShippingLabelMutation,
  useAdminFulfillmentCancelShipmentMutation,
  useAdminFulfillmentRetryPickupMutation,
  useAdminBulkApprovalConfirmMutation,
  useAdminBulkApprovalCancelMutation,
  useAdminPreviewPendingOrderEditMutation,
  useAdminApplyPendingOrderEditMutation,
  useGetAdminAddressIntelligenceQuery,
  useLazyGetAdminAddressIntelligenceQuery,
  useAdminPreviewPendingAddressEditMutation,
  useAdminApplyPendingAddressEditMutation,
  useAdminBulkFulfillmentShipNowMutation,
  useAdminBulkFulfillmentSchedulePickupMutation,
  useAdminBulkFulfillmentSyncShiprocketMutation,
  useGetAdminRtoOrdersQuery,
  useGetAdminRtoAnalyticsQuery,
  useLazyExportAdminRtoReportQuery,
  useAdminAutoSyncRtoStatusesMutation,
  useAdminRtoRefundMutation,
  useAdminRtoRejectMutation,
  useAdminRtoResolveMutation,
  useAdminRtoBulkActionMutation,
} = adminOrdersApi;
