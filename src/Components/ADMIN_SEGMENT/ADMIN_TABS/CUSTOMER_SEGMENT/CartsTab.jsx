import React, { useState, useCallback } from 'react';
import { 
  useGetAllCartsQuery, 
  useGetAbandonedCartsQuery, 
  useGetHighValueCartsQuery 
} from '../../ADMIN_REDUX_MANAGEMENT/userAnalyticsApi';
import CartDetailsModal from './CartDetailsModal';
import CartReminderEmailModal from './CartReminderEmailModal';
import CartReminderPushModal from './CartReminderPushModal';
import BulkActionsMenu from './BulkActionsMenu';
import LeadsAutoPushToggle from './LeadsAutoPushToggle';
import { DateTimeCell } from './adminDateTime';

const CartsTab = () => {
  const [activeSubTab, setActiveSubTab] = useState('all'); // all, abandoned, high-value
  const [page, setPage] = useState(1);
  const [minAmount, setMinAmount] = useState(5000);
  const [hours, setHours] = useState(24);
  const [selectedCartId, setSelectedCartId] = useState(null);
  const [isCartModalOpen, setIsCartModalOpen] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState([]);
  const [selectedUserMeta, setSelectedUserMeta] = useState({});
  const [cartReminderOpen, setCartReminderOpen] = useState(false);
  const [cartReminderRecipients, setCartReminderRecipients] = useState([]);
  const [cartPushOpen, setCartPushOpen] = useState(false);
  const [cartPushRecipients, setCartPushRecipients] = useState([]);

  const snapshotFromCart = useCallback((cart) => ({
    _id: cart.user?._id,
    name: cart.user?.name || 'Customer',
    email: cart.user?.email || '—',
    cartItemsCount: cart.itemCount || cart.items?.length || 0,
  }), []);

  const openCartDetails = useCallback((cart) => {
    setSelectedCartId(cart._id);
    setIsCartModalOpen(true);
  }, []);

  const closeCartDetails = useCallback(() => {
    setIsCartModalOpen(false);
    setSelectedCartId(null);
  }, []);

  // Queries
  const allCarts = useGetAllCartsQuery({ page, limit: 10 });
  const abandonedCarts = useGetAbandonedCartsQuery({ page, limit: 10, hours }, { skip: activeSubTab !== 'abandoned' });
  const highValueCarts = useGetHighValueCartsQuery({ page, limit: 10, minAmount }, { skip: activeSubTab !== 'high-value' });

  let data, isLoading, error, pagination;

  switch (activeSubTab) {
    case 'abandoned':
      data = abandonedCarts.data?.data || [];
      isLoading = abandonedCarts.isLoading;
      error = abandonedCarts.error;
      pagination = abandonedCarts.data?.pagination || { total: 0, page: 1, totalPages: 1 };
      break;
    case 'high-value':
      data = highValueCarts.data?.data || [];
      isLoading = highValueCarts.isLoading;
      error = highValueCarts.error;
      pagination = highValueCarts.data?.pagination || { total: 0, page: 1, totalPages: 1 };
      break;
    default:
      data = allCarts.data?.data || [];
      isLoading = allCarts.isLoading;
      error = allCarts.error;
      pagination = allCarts.data?.pagination || { total: 0, page: 1, totalPages: 1 };
  }

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      const ids = data.map((c) => c.user?._id).filter(Boolean);
      setSelectedUserIds(ids);
      setSelectedUserMeta((prev) => {
        const next = { ...prev };
        data.forEach((c) => {
          if (c.user?._id) next[c.user._id] = snapshotFromCart(c);
        });
        return next;
      });
    } else {
      setSelectedUserIds([]);
      setSelectedUserMeta({});
    }
  };

  const handleSelectCart = (cart) => {
    const id = cart.user?._id;
    if (!id) return;
    setSelectedUserIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
    setSelectedUserMeta((prev) => {
      const next = { ...prev };
      if (next[id]) delete next[id];
      else next[id] = snapshotFromCart(cart);
      return next;
    });
  };

  const buildRecipientsFromSelection = useCallback(() => {
    return selectedUserIds.map((id) => {
      if (selectedUserMeta[id]) return selectedUserMeta[id];
      const fromPage = data.find((c) => c.user?._id === id);
      if (fromPage) return snapshotFromCart(fromPage);
      return { _id: id, name: 'Customer', email: '—', cartItemsCount: 0 };
    });
  }, [selectedUserIds, selectedUserMeta, data, snapshotFromCart]);

  const openCartReminderModal = useCallback((recipientList) => {
    if (!recipientList?.length) return;
    setCartReminderRecipients(recipientList);
    setCartReminderOpen(true);
  }, []);

  const closeCartReminderModal = useCallback(() => {
    setCartReminderOpen(false);
    setCartReminderRecipients([]);
  }, []);

  const openCartPushModal = useCallback((recipientList) => {
    if (!recipientList?.length) return;
    setCartPushRecipients(recipientList);
    setCartPushOpen(true);
  }, []);

  const closeCartPushModal = useCallback(() => {
    setCartPushOpen(false);
    setCartPushRecipients([]);
  }, []);

  const handleBulkCartEmail = () => {
    if (!selectedUserIds.length) return;
    openCartReminderModal(buildRecipientsFromSelection());
  };

  const handleBulkCartPush = () => {
    if (!selectedUserIds.length) return;
    openCartPushModal(buildRecipientsFromSelection());
  };

  const selectableIds = data.map((c) => c.user?._id).filter(Boolean);
  const allSelected =
    selectableIds.length > 0 && selectableIds.every((id) => selectedUserIds.includes(id));

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500">Loading carts...</p>
        </div>
      </div>
    );
  }

  if (error) {
    console.error('[CartsTab] Error:', error);
    return (
      <div className="bg-red-50 border border-red-200 rounded-2xl p-8 text-center">
        <svg className="w-16 h-16 text-red-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <h3 className="text-lg font-semibold text-red-800 mb-2">Failed to Load Carts</h3>
        <p className="text-red-600">{error?.data?.message || 'Please try again later'}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Sub Tabs */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-2 flex flex-wrap gap-2">
        {[
          { id: 'all', label: 'All Carts', icon: 'M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-1.5 6M17 13l1.5 6M9 21h6M12 15v6' },
          { id: 'abandoned', label: 'Abandoned', icon: 'M12 8v4l3 3M12 2a10 10 0 100 20 10 10 0 000-20z' },
          { id: 'high-value', label: 'High Value', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => { setActiveSubTab(tab.id); setPage(1); }}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              activeSubTab === tab.id
                ? 'bg-purple-600 text-white shadow-md'
                : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={tab.icon} />
            </svg>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Filters for High Value */}
      {activeSubTab === 'high-value' && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">Minimum Cart Value (₹)</label>
          <div className="flex gap-2">
            <input
              type="number"
              value={minAmount}
              onChange={(e) => setMinAmount(Number(e.target.value))}
              className="flex-1 px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg"
              placeholder="Min amount"
            />
            <button
              onClick={() => { setPage(1); highValueCarts.refetch(); }}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
            >
              Apply
            </button>
          </div>
        </div>
      )}

      {/* Filters for Abandoned */}
      {activeSubTab === 'abandoned' && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">Hours Since Abandoned</label>
          <div className="flex gap-2">
            <select
              value={hours}
              onChange={(e) => setHours(Number(e.target.value))}
              className="flex-1 px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg"
            >
              <option value={12}>12 hours</option>
              <option value={24}>24 hours</option>
              <option value={48}>48 hours</option>
              <option value={72}>72 hours</option>
              <option value={168}>7 days</option>
            </select>
            <button
              onClick={() => { setPage(1); abandonedCarts.refetch(); }}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
            >
              Apply
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-end gap-3">
          <LeadsAutoPushToggle showWishlist={false} />
          {selectedUserIds.length > 0 && (
            <BulkActionsMenu
              count={selectedUserIds.length}
              onCartEmail={handleBulkCartEmail}
              onCartPush={handleBulkCartPush}
            />
          )}
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gradient-to-r from-purple-500 to-purple-600 rounded-2xl p-4 text-white">
          <p className="text-sm opacity-90">Total Carts</p>
          <p className="text-2xl font-bold">{allCarts.data?.pagination?.total || 0}</p>
        </div>
        <div className="bg-gradient-to-r from-orange-500 to-red-500 rounded-2xl p-4 text-white">
          <p className="text-sm opacity-90">Abandoned ({hours}h+)</p>
          <p className="text-2xl font-bold">{abandonedCarts.data?.pagination?.total || 0}</p>
        </div>
        <div className="bg-gradient-to-r from-green-500 to-teal-500 rounded-2xl p-4 text-white">
          <p className="text-sm opacity-90">High Value (≥₹{minAmount.toLocaleString()})</p>
          <p className="text-2xl font-bold">{highValueCarts.data?.pagination?.total || 0}</p>
        </div>
        <div className="bg-gradient-to-r from-blue-500 to-indigo-500 rounded-2xl p-4 text-white">
          <p className="text-sm opacity-90">Avg Cart Value</p>
          <p className="text-2xl font-bold">
            {formatCurrency(allCarts.data?.data?.reduce((sum, cart) => sum + (cart.totalAmount || 0), 0) / (allCarts.data?.data?.length || 1))}
          </p>
        </div>
      </div>

      {/* Mobile Card View */}
      <div className="block lg:hidden space-y-4">
        {data.map((cart) => (
          <div
            key={cart._id}
            role="button"
            tabIndex={0}
            onClick={() => openCartDetails(cart)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') openCartDetails(cart); }}
            className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 cursor-pointer hover:border-purple-200 hover:shadow-md transition-all"
          >
            <div className="flex justify-between items-start gap-3">
              {cart.user?._id && (
                <input
                  type="checkbox"
                  className="rounded border-gray-300 text-purple-600 focus:ring-purple-500 w-4 h-4 mt-1 flex-shrink-0"
                  checked={selectedUserIds.includes(cart.user._id)}
                  onClick={(e) => e.stopPropagation()}
                  onChange={() => handleSelectCart(cart)}
                />
              )}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900">{cart.user?.name || 'Guest User'}</p>
                <p className="text-sm text-gray-500">{cart.user?.email}</p>
              </div>
              <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm font-semibold">
                {formatCurrency(cart.totalAmount)}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <div className="bg-gray-50 p-2 rounded-lg">
                <p className="text-xs text-gray-500">Items</p>
                <p className="font-medium">{cart.itemCount || cart.items?.length || 0}</p>
              </div>
              <div className="bg-gray-50 p-2 rounded-lg">
                <p className="text-xs text-gray-500 mb-1">Last Updated</p>
                <DateTimeCell iso={cart.updatedAt} />
              </div>
            </div>
            {activeSubTab === 'abandoned' && cart.hoursSinceUpdate && (
              <div className="mt-2 text-xs text-orange-600 bg-orange-50 p-2 rounded-lg">
                Abandoned for {cart.hoursSinceUpdate} hours
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Desktop Table View */}
      <div className="hidden lg:block bg-white rounded-2xl shadow-sm border border-gray-200 overflow-x-auto">
        <table className="w-full min-w-[800px]">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-4 w-10">
                <input
                  type="checkbox"
                  className="rounded border-gray-300 text-purple-600 focus:ring-purple-500 w-4 h-4"
                  onChange={handleSelectAll}
                  checked={allSelected}
                />
              </th>
              <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
              <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Items</th>
              <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Total Amount</th>
              <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Last Updated</th>
              {activeSubTab === 'abandoned' && <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Abandoned For</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {data.map((cart) => (
              <tr
                key={cart._id}
                onClick={() => openCartDetails(cart)}
                className="hover:bg-purple-50/50 cursor-pointer transition-colors"
              >
                <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                  {cart.user?._id ? (
                    <input
                      type="checkbox"
                      className="rounded border-gray-300 text-purple-600 focus:ring-purple-500 w-4 h-4"
                      checked={selectedUserIds.includes(cart.user._id)}
                      onChange={() => handleSelectCart(cart)}
                    />
                  ) : null}
                </td>
                <td className="px-6 py-4">
                  <div>
                    <p className="font-medium text-gray-900">{cart.user?.name || 'Guest User'}</p>
                    <p className="text-sm text-gray-500">{cart.user?.email}</p>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className="inline-flex items-center gap-1.5 text-sm font-medium text-purple-600">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                    {cart.itemCount || cart.items?.length || 0}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <span className="font-semibold text-purple-600">{formatCurrency(cart.totalAmount)}</span>
                </td>
                <td className="px-6 py-4">
                  <DateTimeCell iso={cart.updatedAt} />
                </td>
                {activeSubTab === 'abandoned' && (
                  <td className="px-6 py-4">
                    <span className="px-2 py-1 bg-orange-100 text-orange-700 rounded-full text-xs">
                      {cart.hoursSinceUpdate} hours
                    </span>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-white rounded-2xl shadow-sm border border-gray-200 p-4">
          <div className="text-sm text-gray-500">
            Showing {data.length} of {pagination.total} carts
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              Previous
            </button>
            <span className="px-4 py-2 text-sm font-medium text-gray-700">
              Page {page} of {pagination.totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
              disabled={page === pagination.totalPages}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}

      <CartDetailsModal
        isOpen={isCartModalOpen}
        onClose={closeCartDetails}
        cartId={selectedCartId}
      />

      <CartReminderEmailModal
        isOpen={cartReminderOpen}
        onClose={closeCartReminderModal}
        recipients={cartReminderRecipients}
      />

      <CartReminderPushModal
        isOpen={cartPushOpen}
        onClose={closeCartPushModal}
        recipients={cartPushRecipients}
      />

      {/* Empty State */}
      {data.length === 0 && !isLoading && (
        <div className="text-center py-16 bg-white rounded-2xl border border-gray-200">
          <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
          </svg>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No carts found</h3>
          <p className="text-gray-500">Try adjusting your filters</p>
        </div>
      )}
    </div>
  );
};

export default CartsTab;