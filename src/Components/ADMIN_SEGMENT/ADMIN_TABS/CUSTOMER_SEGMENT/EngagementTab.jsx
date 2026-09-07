import React, { useEffect, useState } from 'react';
import {
  useGetEngagementSummaryQuery,
  useGetPushSubscribersQuery,
  useGetPwaInstallsQuery,
} from '../../ADMIN_REDUX_MANAGEMENT/userAnalyticsApi';
import { DateTimeCell } from './adminDateTime';

const LIST_LIMIT = 15;

const EngagementTab = () => {
  const [listMode, setListMode] = useState('push'); // push | pwa
  const [page, setPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchInput, setSearchInput] = useState('');

  useEffect(() => {
    setPage(1);
  }, [listMode]);

  const {
    data: summaryRes,
    isLoading: summaryLoading,
    error: summaryError,
    refetch: refetchSummary,
  } = useGetEngagementSummaryQuery();

  const pushQuery = useGetPushSubscribersQuery(
    { page, limit: LIST_LIMIT, search: searchTerm },
    { skip: listMode !== 'push' }
  );
  const pwaQuery = useGetPwaInstallsQuery(
    { page, limit: LIST_LIMIT, search: searchTerm },
    { skip: listMode !== 'pwa' }
  );

  const activeQuery = listMode === 'push' ? pushQuery : pwaQuery;
  const rows = activeQuery.data?.data || [];
  const pagination = activeQuery.data?.pagination || {
    total: 0,
    page: 1,
    totalPages: 1,
  };
  const summary = summaryRes?.data || {};

  const applySearch = (e) => {
    e.preventDefault();
    setPage(1);
    setSearchTerm(searchInput.trim());
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Engagement</h2>
          <p className="text-sm text-slate-500">
            Customers with app notifications on, and customers who installed the PWA
            (logged-in installs only).
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            refetchSummary();
            activeQuery.refetch?.();
          }}
          className="self-start rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Refresh
        </button>
      </div>

      {summaryError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Could not load engagement summary.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Notifications on
            </p>
            <p className="mt-1 text-2xl font-bold text-slate-900">
              {summaryLoading ? '…' : summary.pushNotificationUsers ?? 0}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {summary.pushNotificationDevices ?? 0} device
              {(summary.pushNotificationDevices ?? 0) === 1 ? '' : 's'}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              PWA installed
            </p>
            <p className="mt-1 text-2xl font-bold text-slate-900">
              {summaryLoading ? '…' : summary.pwaInstallUsers ?? 0}
            </p>
            <p className="mt-1 text-xs text-slate-500">Attributed after login</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Scoped customers
            </p>
            <p className="mt-1 text-2xl font-bold text-slate-900">
              {summaryLoading ? '…' : summary.scopedCustomers ?? 0}
            </p>
            <p className="mt-1 text-xs text-slate-500">This storefront scope</p>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setListMode('push')}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                listMode === 'push'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Notifications on
            </button>
            <button
              type="button"
              onClick={() => setListMode('pwa')}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                listMode === 'pwa'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              PWA installed
            </button>
          </div>
          <form onSubmit={applySearch} className="flex gap-2">
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search name, email, phone"
              className="w-full min-w-[12rem] rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-slate-400 sm:w-64"
            />
            <button
              type="submit"
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
            >
              Search
            </button>
          </form>
        </div>

        {activeQuery.isLoading ? (
          <div className="p-12 text-center text-sm text-slate-400 animate-pulse">
            Loading…
          </div>
        ) : activeQuery.error ? (
          <div className="p-8 text-center text-sm text-red-600">
            Could not load list. Try refresh.
          </div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center text-sm text-slate-400">No users found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Customer</th>
                  <th className="px-4 py-3 font-semibold">Phone</th>
                  {listMode === 'push' ? (
                    <>
                      <th className="px-4 py-3 font-semibold">Devices</th>
                      <th className="px-4 py-3 font-semibold">Subscribed</th>
                      <th className="px-4 py-3 font-semibold">PWA</th>
                    </>
                  ) : (
                    <>
                      <th className="px-4 py-3 font-semibold">Installed</th>
                      <th className="px-4 py-3 font-semibold">Last confirmed</th>
                      <th className="px-4 py-3 font-semibold">Notifications</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => (
                  <tr key={row._id} className="hover:bg-slate-50/80">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{row.name || '—'}</div>
                      <div className="text-xs text-slate-500">{row.email || '—'}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{row.phone || '—'}</td>
                    {listMode === 'push' ? (
                      <>
                        <td className="px-4 py-3 text-slate-700">{row.deviceCount || 0}</td>
                        <td className="px-4 py-3">
                          <DateTimeCell iso={row.subscribedAt} />
                        </td>
                        <td className="px-4 py-3">
                          {row.pwaInstalledAt ? (
                            <DateTimeCell iso={row.pwaInstalledAt} />
                          ) : (
                            <span className="text-xs text-slate-400">No</span>
                          )}
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-3">
                          <DateTimeCell iso={row.installedAt} />
                        </td>
                        <td className="px-4 py-3">
                          <DateTimeCell iso={row.lastConfirmedAt} />
                        </td>
                        <td className="px-4 py-3">
                          {row.notificationsEnabled ? (
                            <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                              On ({row.pushDeviceCount || 0})
                            </span>
                          ) : (
                            <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                              Off
                            </span>
                          )}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm text-slate-600">
          <span>
            {pagination.total || 0} total · page {pagination.page || page} of{' '}
            {pagination.totalPages || 1}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1 || activeQuery.isFetching}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-lg border border-slate-200 px-3 py-1 disabled:opacity-40"
            >
              Prev
            </button>
            <button
              type="button"
              disabled={
                page >= (pagination.totalPages || 1) || activeQuery.isFetching
              }
              onClick={() => setPage((p) => p + 1)}
              className="rounded-lg border border-slate-200 px-3 py-1 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EngagementTab;
