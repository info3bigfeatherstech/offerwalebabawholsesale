import React, { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import {
  useGetLeadsPushSettingsQuery,
  useUpdateLeadsPushSettingsMutation,
} from '../../ADMIN_REDUX_MANAGEMENT/userAnalyticsApi';

function formatIstHourLabel(hour) {
  const h = Math.floor(Number(hour));
  if (!Number.isFinite(h) || h < 0 || h > 23) return '6:00 PM IST';
  if (h === 0) return '12:00 AM IST';
  if (h === 12) return '12:00 PM IST';
  if (h < 12) return `${h}:00 AM IST`;
  return `${h - 12}:00 PM IST`;
}

function SwitchRow({
  label,
  hint,
  enabled,
  busy,
  pushConfigured,
  onToggle,
  accent = 'violet',
}) {
  const onBg =
    accent === 'pink'
      ? 'bg-pink-50 border-pink-200'
      : accent === 'amber'
        ? 'bg-amber-50 border-amber-200'
        : 'bg-violet-50 border-violet-200';
  const switchOn =
    accent === 'pink'
      ? 'bg-pink-600'
      : accent === 'amber'
        ? 'bg-amber-600'
        : 'bg-violet-600';
  const ring =
    accent === 'pink'
      ? 'focus:ring-pink-500'
      : accent === 'amber'
        ? 'focus:ring-amber-500'
        : 'focus:ring-violet-500';

  return (
    <div
      className={`flex items-center gap-3 px-3 py-2 rounded-xl border shrink-0 ${
        enabled ? onBg : 'bg-gray-50 border-gray-200'
      } ${!pushConfigured ? 'opacity-60' : ''}`}
      title={
        pushConfigured
          ? hint
          : 'Configure VAPID keys on server to enable push'
      }
    >
      <div className="min-w-0">
        <p className="text-xs font-semibold text-gray-800 whitespace-nowrap">{label}</p>
        <p className="text-[10px] text-gray-500 whitespace-nowrap hidden sm:block">
          {enabled ? hint : 'Off'}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={`Toggle ${label}`}
        disabled={busy || !pushConfigured}
        onClick={onToggle}
        className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 ${ring} focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 ${
          enabled ? switchOn : 'bg-gray-300'
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ${
            enabled ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}

/**
 * Admin push policy toggles for this storefront scope.
 * Cart reminder logic/scheduler unchanged — only its enable flag is exposed here.
 */
const LeadsAutoPushToggle = ({ showCart = true, showWishlist = true, showNewProducts = true }) => {
  const { data, isLoading, isFetching } = useGetLeadsPushSettingsQuery();
  const [updateSettings, { isLoading: isSaving }] = useUpdateLeadsPushSettingsMutation();
  const [cartOn, setCartOn] = useState(false);
  const [wishlistOn, setWishlistOn] = useState(false);
  const [newProductsOn, setNewProductsOn] = useState(false);

  const settings = data?.data;
  const pushConfigured = settings?.pushConfigured !== false;
  const hourIst = settings?.autoPushHourIst ?? 18;
  const hourLabel = formatIstHourLabel(hourIst);
  const busy = isLoading || isSaving || isFetching;

  useEffect(() => {
    if (!settings) return;
    setCartOn(Boolean(settings.autoPushEnabled));
    setWishlistOn(Boolean(settings.wishlistAutoPushEnabled));
    setNewProductsOn(Boolean(settings.newProductsAutoPushEnabled));
  }, [
    settings?.autoPushEnabled,
    settings?.wishlistAutoPushEnabled,
    settings?.newProductsAutoPushEnabled,
    settings,
  ]);

  const patchFlag = async (key, next, rollback) => {
    if (!pushConfigured) {
      toast.warning('Web push is not configured on the server (VAPID keys).');
      return;
    }
    try {
      await updateSettings({ [key]: next }).unwrap();
      toast.success('Push setting updated');
    } catch (err) {
      rollback();
      toast.error(err?.data?.message || 'Could not update push setting');
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {showCart && (
        <SwitchRow
          label="Cart auto push"
          hint={`Daily ~${hourLabel}`}
          enabled={cartOn}
          busy={busy}
          pushConfigured={pushConfigured}
          onToggle={() => {
            const next = !cartOn;
            setCartOn(next);
            patchFlag('autoPushEnabled', next, () => setCartOn(!next));
          }}
        />
      )}
      {showWishlist && (
        <SwitchRow
          label="Wishlist auto push"
          hint={`Daily ~${hourLabel}`}
          enabled={wishlistOn}
          busy={busy}
          pushConfigured={pushConfigured}
          accent="pink"
          onToggle={() => {
            const next = !wishlistOn;
            setWishlistOn(next);
            patchFlag('wishlistAutoPushEnabled', next, () => setWishlistOn(!next));
          }}
        />
      )}
      {showNewProducts && (
        <SwitchRow
          label="New products digest"
          hint="11–1 & 6–8 IST"
          enabled={newProductsOn}
          busy={busy}
          pushConfigured={pushConfigured}
          accent="amber"
          onToggle={() => {
            const next = !newProductsOn;
            setNewProductsOn(next);
            patchFlag('newProductsAutoPushEnabled', next, () => setNewProductsOn(!next));
          }}
        />
      )}
    </div>
  );
};

export default LeadsAutoPushToggle;
