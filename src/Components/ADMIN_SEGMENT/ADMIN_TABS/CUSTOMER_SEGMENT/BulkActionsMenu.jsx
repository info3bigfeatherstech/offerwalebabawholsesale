import React, { useState, useRef, useEffect } from 'react';

const BulkActionsMenu = ({
  count,
  onCartEmail,
  onCartPush,
  onWishlistPush,
  variant = 'cart',
  align = 'right',
}) => {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  if (!count) return null;

  const positionClass = align === 'left' ? 'left-0' : 'right-0';

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2.5 rounded-xl hover:bg-indigo-700 transition-all shadow-md"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
        </svg>
        {`Bulk Actions (${count})`}
        <svg className="w-4 h-4 opacity-80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className={`absolute ${positionClass} mt-2 w-64 bg-white border border-gray-200 rounded-xl shadow-lg z-20 py-1`}>
          {variant === 'wishlist' ? (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onWishlistPush?.();
              }}
              className="w-full text-left px-4 py-2.5 text-sm text-gray-800 hover:bg-pink-50 flex items-center gap-2"
            >
              <span aria-hidden>🔔</span>
              Send wishlist reminder (Notification)
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onCartEmail?.();
                }}
                className="w-full text-left px-4 py-2.5 text-sm text-gray-800 hover:bg-indigo-50 flex items-center gap-2"
              >
                <span aria-hidden>✉️</span>
                Send cart reminder (Email)
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onCartPush?.();
                }}
                className="w-full text-left px-4 py-2.5 text-sm text-gray-800 hover:bg-violet-50 flex items-center gap-2"
              >
                <span aria-hidden>🔔</span>
                Send cart reminder (Notification)
              </button>
            </>
          )}
          <button
            type="button"
            disabled
            title="WhatsApp bulk — connect WATI/Meta API later"
            className="w-full text-left px-4 py-2.5 text-sm text-gray-400 cursor-not-allowed flex items-center gap-2"
          >
            <span aria-hidden>💬</span>
            WhatsApp (coming soon)
          </button>
        </div>
      )}
    </div>
  );
};

export default BulkActionsMenu;
