// roles.js
// ─────────────────────────────────────────────────────────────────────────────
// SINGLE SOURCE OF TRUTH for role-based tab access.
// To give a role access to a new tab → just add the tab id here.
// To add a new role → add one new key with its allowed tab ids.
// Nothing else in the codebase needs to change.
// ─────────────────────────────────────────────────────────────────────────────

export const ROLES = {
  ADMIN:              "admin",
  PRODUCT_MANAGER:    "product_manager",
  ORDER_MANAGER:      "order_manager",
  MARKETING_MANAGER:  "marketing_manager",
  INVENTORY_MANAGER:  "inventory_manager",
  // User: "user",
};

export const ROLE_PERMISSIONS = {
  [ROLES.ADMIN]:             ["products", "analytics", "archived", "seoanalysis","customers","staff","demo", "orders","returns_refunds","rto","support","orders","outofstock","customerreview","website","ecommerce","marketing","settings","utilities","wholesaler"],
  [ROLES.PRODUCT_MANAGER]:   ["products", "archived"],
  [ROLES.ORDER_MANAGER]:     ["orders", "returns_refunds", "rto", "settings"],
  [ROLES.MARKETING_MANAGER]: ["analytics"],
  [ROLES.INVENTORY_MANAGER]: ["products"],
  // [ROLES.User]: ["user"],
};

export const ROLE_LABELS = {
  [ROLES.ADMIN]:             "Super Admin",
  [ROLES.PRODUCT_MANAGER]:   "Product Manager",
  [ROLES.ORDER_MANAGER]:     "Order Manager",
  [ROLES.MARKETING_MANAGER]: "Marketing Manager",
  [ROLES.INVENTORY_MANAGER]: "Inventory Manager",
};

export function canManageProductCatalog(role) {
  return role === ROLES.ADMIN || role === ROLES.PRODUCT_MANAGER;
}

export function isInventoryManagerRole(role) {
  return role === ROLES.INVENTORY_MANAGER;
}    