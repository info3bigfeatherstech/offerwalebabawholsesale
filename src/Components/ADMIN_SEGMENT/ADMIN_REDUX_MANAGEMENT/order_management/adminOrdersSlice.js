import { createSlice, createSelector } from '@reduxjs/toolkit';

/**
 * Maps UI tab labels (OrderTab) → backend `bucket` query param.
 */
export const ORDER_TAB_LABEL_TO_BUCKET = Object.freeze({
  All: 'all',
  Pending: 'new',
  Confirmed: 'bill_sent',
  'Ready to Ship': 'ready_to_ship',
  Processing: 'ready_to_pick',
  'In transit': 'in_transit',
  Delivered: 'completed',
  RTO: 'rto',
  Cancelled: 'others',
  'Pickup Exception': 'pickup_exception',
});

/** @type {keyof typeof ORDER_TAB_LABEL_TO_BUCKET} */
export const DEFAULT_ORDER_TAB_LABEL = 'Pending';

/** Order statuses where GST invoice + Shiprocket fulfilment UI are allowed (after admin confirm). */
const POST_CONFIRM_ORDER_STATUSES = [
  'confirmed',
  'processing',
  'shipped',
  'out_for_delivery',
  'delivered',
  'return_requested',
];

export function isPostConfirmOrderStatus(orderStatus) {
  return POST_CONFIRM_ORDER_STATUSES.includes(String(orderStatus || '').toLowerCase());
}

/**
 * Maps backend countsByBucket keys → UI tab labels (for summary sync).
 */
export const BUCKET_KEY_TO_TAB_LABEL = Object.freeze({
  all: 'All',
  new: 'Pending',
  bill_sent: 'Confirmed',
  ready_to_ship: 'Ready to Ship',
  pickup_exception: 'Pickup Exception',
  ready_to_pick: 'Processing',
  in_transit: 'In transit',
  completed: 'Delivered',
  rto: 'RTO',
  others: 'Cancelled',
});

/** @typedef {'none'|'today'|'last7'|'last30'|'custom'} DatePresetId */

/**
 * `YYYY-MM-DD` → start of that local day as ISO (for API `from`)
 */
export function localDateStrToStartIso(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null;
  const [y, m, d] = parts;
  const dt = new Date(y, m - 1, d, 0, 0, 0, 0);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString();
}

/**
 * `YYYY-MM-DD` → end of that local day as ISO (for API `to`)
 */
export function localDateStrToEndIso(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null;
  const [y, m, d] = parts;
  const dt = new Date(y, m - 1, d, 23, 59, 59, 999);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString();
}

/**
 * Browser-local calendar day: midnight 00:00 → 23:59:59.999.
 * Matches Orders table date labels — not server TZ / not hardcoded IST.
 */
export function localTodayRangeIso() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  const from = new Date(y, m, d, 0, 0, 0, 0);
  const to = new Date(y, m, d, 23, 59, 59, 999);
  return { from: from.toISOString(), to: to.toISOString() };
}

/** True when admin applied Today / 7d / 30d / Custom (not default "All dates"). */
export function isOrdersDateFilterActive(datePreset) {
  const p = String(datePreset || 'none').toLowerCase();
  return p === 'today' || p === 'last7' || p === 'last30' || p === 'custom';
}

const initialState = {
  activeTabLabel: DEFAULT_ORDER_TAB_LABEL,
  search: '',
  searchInput: '',
  page: 1,
  limit: 20,
  sortBy: 'createdAt',
  sortOrder: 'desc',
  /**
   * Default `none` = no date window (paginated status tabs).
   * Applying today/last7/last30/custom switches list to mixed statuses for that range.
   * @type {DatePresetId}
   */
  datePreset: 'none',
  /** Custom range — local date inputs `YYYY-MM-DD` */
  customDateFrom: '',
  customDateTo: '',
};

const adminOrdersUiSlice = createSlice({
  name: 'adminOrdersUi',
  initialState,
  reducers: {
    setActiveTabLabel: (state, { payload }) => {
      const label = payload === 'All' ? DEFAULT_ORDER_TAB_LABEL : payload;
      if (label && ORDER_TAB_LABEL_TO_BUCKET[label] != null) {
        state.activeTabLabel = label;
        state.page = 1;
      }
    },
    setSearchInput: (state, { payload }) => {
      state.searchInput = payload ?? '';
    },
    commitSearch: (state) => {
      state.search = String(state.searchInput || '').trim();
      state.page = 1;
    },
    clearSearch: (state) => {
      state.search = '';
      state.searchInput = '';
      state.page = 1;
    },
    setPage: (state, { payload }) => {
      const p = Math.max(1, Number(payload) || 1);
      state.page = p;
    },
    setLimit: (state, { payload }) => {
      const l = Math.min(100, Math.max(1, Number(payload) || 20));
      state.limit = l;
      state.page = 1;
    },
    setSort: (state, { payload }) => {
      if (payload?.sortBy) state.sortBy = payload.sortBy;
      if (payload?.sortOrder) state.sortOrder = payload.sortOrder;
    },
    /**
     * @param {import('@reduxjs/toolkit').PayloadAction<DatePresetId>} action
     */
    setDatePreset: (state, { payload }) => {
      const p = payload || 'none';
      const allowed = new Set(['none', 'today', 'last7', 'last30', 'custom']);
      state.datePreset = allowed.has(p) ? p : 'none';
      state.page = 1;
      if (state.datePreset !== 'custom') {
        state.customDateFrom = '';
        state.customDateTo = '';
      }
    },
    /**
     * Committed when user clicks Apply on custom range (avoids refetch on every keystroke).
     */
    commitCustomRange: (state, { payload }) => {
      state.customDateFrom = String(payload?.from || '');
      state.customDateTo = String(payload?.to || '');
      state.datePreset = 'custom';
      state.page = 1;
    },
    /** Reset date filter → default paginated status-tab mode. */
    clearDateFilter: (state) => {
      state.datePreset = 'none';
      state.customDateFrom = '';
      state.customDateTo = '';
      state.page = 1;
    },
    resetAdminOrdersUi: () => ({ ...initialState }),
  },
});

export const {
  setActiveTabLabel,
  setSearchInput,
  commitSearch,
  clearSearch,
  setPage,
  setLimit,
  setSort,
  setDatePreset,
  commitCustomRange,
  clearDateFilter,
  resetAdminOrdersUi,
} = adminOrdersUiSlice.actions;

export default adminOrdersUiSlice.reducer;

function buildDateQueryArgs(ui) {
  if (ui.datePreset === 'custom') {
    const fromIso = localDateStrToStartIso(ui.customDateFrom);
    const toIso = localDateStrToEndIso(ui.customDateTo);
    if (fromIso && toIso) {
      return { from: fromIso, to: toIso };
    }
    return { rangePreset: 'all' };
  }
  if (ui.datePreset === 'today') return localTodayRangeIso();
  if (ui.datePreset === 'last7') return { rangePreset: 'last7' };
  if (ui.datePreset === 'last30') return { rangePreset: 'last30' };
  return { rangePreset: 'all' };
}

const selectAdminOrdersUi = (state) => state.adminOrdersUi;

/**
 * Build RTK Query args for list endpoint from Redux state (memoized — stable ref when UI slice unchanged).
 */
export const selectAdminOrdersListQueryArgs = createSelector([selectAdminOrdersUi], (ui) => {
  const search = String(ui.search || '').trim();
  const tabLabel =
    ui.activeTabLabel === 'All' || !ORDER_TAB_LABEL_TO_BUCKET[ui.activeTabLabel]
      ? DEFAULT_ORDER_TAB_LABEL
      : ui.activeTabLabel;
  const dateFilterActive = isOrdersDateFilterActive(ui.datePreset);
  const bucket = dateFilterActive ? 'all' : ORDER_TAB_LABEL_TO_BUCKET[tabLabel];
  const dateArgs = buildDateQueryArgs(ui);
  return {
    page: ui.page,
    limit: ui.limit,
    sortBy: ui.sortBy,
    sortOrder: ui.sortOrder,
    ...(search ? {} : { bucket }),
    search,
    ...(search ? { rangePreset: 'all' } : dateArgs),
  };
});

/**
 * Finite date window for background auto-sync only.
 * Auto-sync API rejects all-time; when UI has no date filter, sync last 30 days silently.
 */
export const selectAdminOrdersDateQueryArgs = createSelector([selectAdminOrdersUi], (ui) => {
  if (isOrdersDateFilterActive(ui.datePreset)) {
    const args = buildDateQueryArgs(ui);
    if (args.from && args.to) return args;
    if (args.rangePreset && args.rangePreset !== 'all') return args;
  }
  return { rangePreset: 'last30' };
});

/**
 * Summary cards + tab badge counts: always all-time (ignore date/search filters).
 * Filters apply only to the orders table via list query args.
 */
export const ADMIN_ORDERS_SUMMARY_ALL_TIME_ARGS = Object.freeze({ rangePreset: 'all' });

export const selectAdminOrdersSummaryQueryArgs = () => ADMIN_ORDERS_SUMMARY_ALL_TIME_ARGS;

/** RTO tab UI state — lifetime by default (not Orders tab's last-30 window). */
const rtoInitialState = {
  activeSection: 'dashboard',
  statusFilter: '',
  search: '',
  searchInput: '',
  page: 1,
  limit: 20,
  datePreset: 'all',
  customDateFrom: '',
  customDateTo: '',
};

const adminRtoUiSlice = createSlice({
  name: 'adminRtoUi',
  initialState: rtoInitialState,
  reducers: {
    setRtoActiveSection: (state, { payload }) => {
      state.activeSection = payload || 'dashboard';
      state.page = 1;
    },
    setRtoStatusFilter: (state, { payload }) => {
      state.statusFilter = payload ?? '';
      state.page = 1;
    },
    setRtoSearchInput: (state, { payload }) => {
      state.searchInput = payload ?? '';
    },
    commitRtoSearch: (state) => {
      state.search = String(state.searchInput || '').trim();
      state.page = 1;
    },
    clearRtoSearch: (state) => {
      state.search = '';
      state.searchInput = '';
      state.page = 1;
    },
    setRtoPage: (state, { payload }) => {
      state.page = Math.max(1, Number(payload) || 1);
    },
    setRtoLimit: (state, { payload }) => {
      state.limit = Math.min(100, Math.max(1, Number(payload) || 20));
      state.page = 1;
    },
    setRtoDatePreset: (state, { payload }) => {
      state.datePreset = payload || 'all';
      state.page = 1;
      if (payload !== 'custom') {
        state.customDateFrom = '';
        state.customDateTo = '';
      }
    },
    commitRtoCustomRange: (state, { payload }) => {
      state.customDateFrom = String(payload?.from || '');
      state.customDateTo = String(payload?.to || '');
      state.datePreset = 'custom';
      state.page = 1;
    },
    resetAdminRtoUi: () => ({ ...rtoInitialState }),
  },
});

export const {
  setRtoActiveSection,
  setRtoStatusFilter,
  setRtoSearchInput,
  commitRtoSearch,
  clearRtoSearch,
  setRtoPage,
  setRtoLimit,
  setRtoDatePreset,
  commitRtoCustomRange,
  resetAdminRtoUi,
} = adminRtoUiSlice.actions;

export const adminRtoUiReducer = adminRtoUiSlice.reducer;

const selectAdminRtoUi = (state) => state.adminRtoUi;

function buildRtoDateQueryArgs(ui) {
  if (ui.datePreset === 'custom') {
    const fromIso = localDateStrToStartIso(ui.customDateFrom);
    const toIso = localDateStrToEndIso(ui.customDateTo);
    if (fromIso && toIso) return { from: fromIso, to: toIso };
    // Incomplete custom inputs → keep lifetime list (never silently shrink to 30d).
    return { rangePreset: 'all' };
  }
  if (ui.datePreset === 'today') return localTodayRangeIso();
  if (ui.datePreset === 'last7') return { rangePreset: 'last7' };
  if (ui.datePreset === 'last30') return { rangePreset: 'last30' };
  return { rangePreset: 'all' };
}

export const selectAdminRtoListQueryArgs = createSelector([selectAdminRtoUi], (ui) => {
  const section = ui.activeSection === 'dashboard' ? 'all' : ui.activeSection;
  const dateArgs = buildRtoDateQueryArgs(ui);
  return {
    page: ui.page,
    limit: ui.limit,
    section: ['reports', 'analytics', 'redispatch', 'cod_restricted'].includes(ui.activeSection)
      ? undefined
      : section,
    status: ui.statusFilter || undefined,
    search: ui.search || undefined,
    ...dateArgs,
  };
});

export const selectAdminRtoAnalyticsQueryArgs = createSelector([selectAdminRtoUi], (ui) =>
  buildRtoDateQueryArgs(ui)
);
