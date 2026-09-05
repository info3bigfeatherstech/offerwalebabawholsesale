import React, { useState, useCallback } from 'react';
import { 
  useGetAllWishlistsQuery, 
  useGetStaleWishlistsQuery, 
  useGetPopularWishlistProductsQuery 
} from '../../ADMIN_REDUX_MANAGEMENT/userAnalyticsApi';
import WishlistReminderPushModal from './WishlistReminderPushModal';
import BulkActionsMenu from './BulkActionsMenu';
import LeadsAutoPushToggle from './LeadsAutoPushToggle';
import { DateTimeCell } from './adminDateTime';

const WishlistsTab = () => {
  const [activeSubTab, setActiveSubTab] = useState('all'); // all, stale, popular
  const [page, setPage] = useState(1);
  const [days, setDays] = useState(7);
  const [selectedUserIds, setSelectedUserIds] = useState([]);
  const [selectedUserMeta, setSelectedUserMeta] = useState({});
  const [wishlistPushOpen, setWishlistPushOpen] = useState(false);
  const [wishlistPushRecipients, setWishlistPushRecipients] = useState([]);

  const snapshotFromWishlist = useCallback((wishlist) => ({
    _id: wishlist.user?._id,
    name: wishlist.user?.name || 'Customer',
    email: wishlist.user?.email || '—',
    itemCount: wishlist.itemCount || wishlist.products?.length || 0,
  }), []);

  const allWishlists = useGetAllWishlistsQuery({ page, limit: 10 });
  const staleWishlists = useGetStaleWishlistsQuery({ page, limit: 10, days }, { skip: activeSubTab !== 'stale' });
  const popularProducts = useGetPopularWishlistProductsQuery({ limit: 20 }, { skip: activeSubTab !== 'popular' });

  let data, isLoading, error, pagination;

  switch (activeSubTab) {
    case 'stale':
      data = staleWishlists.data?.data || [];
      isLoading = staleWishlists.isLoading;
      error = staleWishlists.error;
      pagination = staleWishlists.data?.pagination || { total: 0, page: 1, totalPages: 1 };
      break;
    case 'popular':
      data = popularProducts.data?.data || [];
      isLoading = popularProducts.isLoading;
      error = popularProducts.error;
      pagination = { total: data.length, page: 1, totalPages: 1 };
      break;
    default:
      data = allWishlists.data?.data || [];
      isLoading = allWishlists.isLoading;
      error = allWishlists.error;
      pagination = allWishlists.data?.pagination || { total: 0, page: 1, totalPages: 1 };
  }

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      const ids = data.map((w) => w.user?._id).filter(Boolean);
      setSelectedUserIds(ids);
      setSelectedUserMeta((prev) => {
        const next = { ...prev };
        data.forEach((w) => {
          if (w.user?._id) next[w.user._id] = snapshotFromWishlist(w);
        });
        return next;
      });
    } else {
      setSelectedUserIds([]);
      setSelectedUserMeta({});
    }
  };

  const handleSelectWishlist = (wishlist) => {
    const id = wishlist.user?._id;
    if (!id) return;
    setSelectedUserIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
    setSelectedUserMeta((prev) => {
      const next = { ...prev };
      if (next[id]) delete next[id];
      else next[id] = snapshotFromWishlist(wishlist);
      return next;
    });
  };

  const buildRecipientsFromSelection = useCallback(() => {
    return selectedUserIds.map((id) => {
      if (selectedUserMeta[id]) return selectedUserMeta[id];
      const fromPage = data.find((w) => w.user?._id === id);
      if (fromPage) return snapshotFromWishlist(fromPage);
      return { _id: id, name: 'Customer', email: '—', itemCount: 0 };
    });
  }, [selectedUserIds, selectedUserMeta, data, snapshotFromWishlist]);

  const openWishlistPushModal = useCallback((recipientList) => {
    if (!recipientList?.length) return;
    setWishlistPushRecipients(recipientList);
    setWishlistPushOpen(true);
  }, []);

  const closeWishlistPushModal = useCallback(() => {
    setWishlistPushOpen(false);
    setWishlistPushRecipients([]);
  }, []);

  const handleBulkWishlistPush = () => {
    if (!selectedUserIds.length) return;
    openWishlistPushModal(buildRecipientsFromSelection());
  };

  const selectableIds = data.map((w) => w.user?._id).filter(Boolean);
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
          <div className="w-16 h-16 border-4 border-pink-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500">Loading wishlists...</p>
        </div>
      </div>
    );
  }

  if (error) {
    console.error('[WishlistsTab] Error:', error);
    return (
      <div className="bg-red-50 border border-red-200 rounded-2xl p-8 text-center">
        <svg className="w-16 h-16 text-red-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <h3 className="text-lg font-semibold text-red-800 mb-2">Failed to Load Wishlists</h3>
        <p className="text-red-600">{error?.data?.message || 'Please try again later'}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Sub Tabs */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-2 flex flex-wrap gap-2">
        {[
          { id: 'all', label: 'All Wishlists', icon: 'M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z' },
          { id: 'stale', label: 'Stale Wishlists', icon: 'M12 8v4l3 3M12 2a10 10 0 100 20 10 10 0 000-20z' },
          { id: 'popular', label: 'Popular Products', icon: 'M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => { setActiveSubTab(tab.id); setPage(1); }}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              activeSubTab === tab.id
                ? 'bg-pink-600 text-white shadow-md'
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

      {/* Filters for Stale */}
      {activeSubTab === 'stale' && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">Days Since Added to Wishlist</label>
          <div className="flex gap-2">
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="flex-1 px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg"
            >
              <option value={3}>3 days</option>
              <option value={7}>7 days</option>
              <option value={14}>14 days</option>
              <option value={30}>30 days</option>
            </select>
            <button
              onClick={() => { setPage(1); staleWishlists.refetch(); }}
              className="px-4 py-2 bg-pink-600 text-white rounded-lg hover:bg-pink-700"
            >
              Apply
            </button>
          </div>
        </div>
      )}

      {activeSubTab !== 'popular' && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-end gap-3">
            <LeadsAutoPushToggle showCart={false} showWishlist showNewProducts />
            {selectedUserIds.length > 0 && (
              <BulkActionsMenu
                count={selectedUserIds.length}
                variant="wishlist"
                onWishlistPush={handleBulkWishlistPush}
              />
            )}
          </div>
        </div>
      )}

      {/* Stats Summary for All/Stale */}
      {activeSubTab !== 'popular' && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-gradient-to-r from-pink-500 to-rose-500 rounded-2xl p-4 text-white">
            <p className="text-sm opacity-90">Total Wishlists</p>
            <p className="text-2xl font-bold">{allWishlists.data?.pagination?.total || 0}</p>
          </div>
          <div className="bg-gradient-to-r from-orange-500 to-red-500 rounded-2xl p-4 text-white">
            <p className="text-sm opacity-90">Stale ({days}+ days)</p>
            <p className="text-2xl font-bold">{staleWishlists.data?.pagination?.total || 0}</p>
          </div>
          <div className="bg-gradient-to-r from-purple-500 to-indigo-500 rounded-2xl p-4 text-white">
            <p className="text-sm opacity-90">Avg Items/Wishlist</p>
            <p className="text-2xl font-bold">
              {Math.round((allWishlists.data?.data?.reduce((sum, w) => sum + (w.itemCount || 0), 0) / (allWishlists.data?.data?.length || 1)) || 0)}
            </p>
          </div>
        </div>
      )}

      {/* Popular Products View */}
      {activeSubTab === 'popular' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {data.map((product, index) => (
            <div key={product.productId} className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <div>
                  <span className="inline-flex items-center justify-center w-8 h-8 bg-pink-100 text-pink-600 rounded-full text-sm font-bold mb-2">
                    #{index + 1}
                  </span>
                  <h3 className="font-semibold text-gray-900 mt-1 line-clamp-2">{product.productName}</h3>
                  <p className="text-lg font-bold text-pink-600 mt-2">{formatCurrency(product.price)}</p>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between text-sm">
                <span className="text-gray-500">Wishlisted by</span>
                <span className="font-semibold text-pink-600">{product.wishlistCount} users</span>
              </div>
              <div className="mt-3 w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-pink-500 h-2 rounded-full" 
                  style={{ width: `${Math.min(100, (product.wishlistCount / (data[0]?.wishlistCount || 1)) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Mobile Card View for All/Stale */}
      {activeSubTab !== 'popular' && (
        <div className="block lg:hidden space-y-4">
          {data.map((wishlist) => (
            <div key={wishlist._id} className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4">
              <div className="flex justify-between items-start gap-3">
                {wishlist.user?._id && (
                  <input
                    type="checkbox"
                    className="rounded border-gray-300 text-pink-600 focus:ring-pink-500 w-4 h-4 mt-1 flex-shrink-0"
                    checked={selectedUserIds.includes(wishlist.user._id)}
                    onChange={() => handleSelectWishlist(wishlist)}
                  />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900">{wishlist.user?.name || 'Guest User'}</p>
                  <p className="text-sm text-gray-500">{wishlist.user?.email}</p>
                </div>
                <span className="px-3 py-1 bg-pink-100 text-pink-700 rounded-full text-sm font-semibold">
                  {wishlist.itemCount} items
                </span>
              </div>
              <div className="mt-3">
                <p className="text-xs text-gray-500 mb-2">Wishlist Items:</p>
                <div className="flex flex-wrap gap-1">
                  {wishlist.products?.slice(0, 3).map((p, idx) => (
                    <span key={idx} className="px-2 py-1 bg-gray-100 text-gray-600 rounded-full text-xs">
                      {p.productName}
                    </span>
                  ))}
                  {wishlist.itemCount > 3 && (
                    <span className="px-2 py-1 bg-gray-100 text-gray-500 rounded-full text-xs">
                      +{wishlist.itemCount - 3} more
                    </span>
                  )}
                </div>
              </div>
              <div className="mt-3">
                <p className="text-xs text-gray-500 mb-1">Created</p>
                <DateTimeCell iso={wishlist.createdAt} />
              </div>
              {activeSubTab === 'stale' && wishlist.daysSinceOldestItem && (
                <div className="mt-3 text-xs text-orange-600 bg-orange-50 p-2 rounded-lg">
                  Oldest item added {wishlist.daysSinceOldestItem} days ago
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Desktop Table View for All/Stale */}
      {activeSubTab !== 'popular' && (
        <div className="hidden lg:block bg-white rounded-2xl shadow-sm border border-gray-200 overflow-x-auto">
          <table className="w-full min-w-[800px]">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-4 w-10">
                  <input
                    type="checkbox"
                    className="rounded border-gray-300 text-pink-600 focus:ring-pink-500 w-4 h-4"
                    onChange={handleSelectAll}
                    checked={allSelected}
                  />
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Items</th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Products</th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
                {activeSubTab === 'stale' && <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Days Stale</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {data.map((wishlist) => (
                <tr key={wishlist._id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    {wishlist.user?._id ? (
                      <input
                        type="checkbox"
                        className="rounded border-gray-300 text-pink-600 focus:ring-pink-500 w-4 h-4"
                        checked={selectedUserIds.includes(wishlist.user._id)}
                        onChange={() => handleSelectWishlist(wishlist)}
                      />
                    ) : null}
                  </td>
                  <td className="px-6 py-4">
                    <div>
                      <p className="font-medium text-gray-900">{wishlist.user?.name || 'Guest User'}</p>
                      <p className="text-sm text-gray-500">{wishlist.user?.email}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm font-semibold text-pink-600">{wishlist.itemCount}</td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1">
                      {wishlist.products?.slice(0, 2).map((p, idx) => (
                        <span key={idx} className="px-2 py-1 bg-gray-100 text-gray-600 rounded-full text-xs">
                          {p.productName?.substring(0, 15)}
                        </span>
                      ))}
                      {wishlist.itemCount > 2 && (
                        <span className="px-2 py-1 bg-gray-100 text-gray-500 rounded-full text-xs">
                          +{wishlist.itemCount - 2}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <DateTimeCell iso={wishlist.createdAt} />
                  </td>
                  {activeSubTab === 'stale' && (
                    <td className="px-6 py-4">
                      <span className="px-2 py-1 bg-orange-100 text-orange-700 rounded-full text-xs">
                        {wishlist.daysSinceOldestItem} days
                      </span>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination for All/Stale */}
      {activeSubTab !== 'popular' && pagination.totalPages > 1 && (
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-white rounded-2xl shadow-sm border border-gray-200 p-4">
          <div className="text-sm text-gray-500">
            Showing {data.length} of {pagination.total} wishlists
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

      <WishlistReminderPushModal
        isOpen={wishlistPushOpen}
        onClose={closeWishlistPushModal}
        recipients={wishlistPushRecipients}
      />

      {/* Empty State */}
      {data.length === 0 && !isLoading && (
        <div className="text-center py-16 bg-white rounded-2xl border border-gray-200">
          <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
          </svg>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No wishlists found</h3>
          <p className="text-gray-500">Try adjusting your filters</p>
        </div>
      )}
    </div>
  );
};

export default WishlistsTab;