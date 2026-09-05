import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, useLocation, Navigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { openModal } from './Components/REDUX_FEATURES/REDUX_SLICES/WHOLESALE/wholesalerSlice';
import { isPwaInstalled } from './utils/pwaInstallPrompt';
import { subscribeToWebPush } from './utils/pushNotifications';
import Navbar from './Components/Common/Navbar';
import Footer from './Components/Common/Footer';
import Home from './Components/Website_Pages/Home';
import ProductDetail from './Components/Website_Pages/ProductDetail';
import CatProducts from './Components/HomeComponents/CatProducts/CatProducts';
import ToastConfig from './Components/Common/ToastConfig';
import AuthModal from './Components/LOGIN_REGISTER_SEGMENT/AuthModal/AuthModal';
import ActivatePage from './Components/Website_Pages/ActivatePage/ActivatePage';
import { useGetMeQuery } from './Components/REDUX_FEATURES/REDUX_SLICES/authApi/authApi';
import { selectIsAuthenticated } from './Components/REDUX_FEATURES/REDUX_SLICES/authApi/authSlice';
import UserTab from "./Components/ADMIN_SEGMENT/ADMIN_TABS/USER/UserTab";
import AdminDashboard from "./Components/ADMIN_SEGMENT/Admin_dashboard";
import AdminLogin from './Components/ADMIN_SEGMENT/ADMIN_LOGIN_SEGMENT/AdminLogin';
import AdminUnauthorized from './Components/ADMIN_SEGMENT/ADMIN_LOGIN_SEGMENT/AdminUnauthorized';
import AdminPrivateRoute from './Components/ADMIN_SEGMENT/ADMIN_LOGIN_SEGMENT/AdminPrivateRoute';
import { adminForceLogout } from "./Components/ADMIN_SEGMENT/ADMIN_REDUX_MANAGEMENT/adminAuthSlice";
import { logout } from './Components/REDUX_FEATURES/REDUX_SLICES/authApi/authSlice';
import { WHOLESALE_USER_ACCESS_TOKEN_KEY } from "./SERVICES/Wholesaleaxios";
import { isCustomerTokenCompatible } from "./SERVICES/authPortalSession";
import './App.css';
import ShopByPrice from './Components/HomeComponents/ShopByWHoleSalePrice/ShopByPrice';
import  WhatsAppFloat  from './Components/WHATSAPP_FLOAT/WhatsAppFloat'
// import { fetchCart, loadGuestCart } from './Components/REDUX_FEATURES/REDUX_SLICES/UserCart/userCartSlice';
// import { fetchWishlist, loadGuestWishlist } from './Components/REDUX_FEATURES/REDUX_SLICES/UserWIshlist/userWishlistSLice';

// ── These two are fine at app-level — they power Navbar badges ───────────────
import useWishlistInit from "./Components/HOOKS/useWishlistInit";
import useCartInit from "./Components/HOOKS/useCartInit";
import usePushNotifications from "./Components/HOOKS/usePushNotifications";
import PushNotificationPrompt from "./Components/Common/PushNotificationPrompt";
import InstallAppPrompt from "./Components/Common/InstallAppPrompt";
import ContactUs from './Components/HomeComponents/Contact';
import UserDashboard from './User_Side_Web_Interface/User_Dash_Segment/UserDashboard';
import Checkout from './User_Side_Web_Interface/CHECKOUT/Checkout';
import TagProducts from './Components/REDUX_FEATURES/REDUX_SLICES/SHOP_BY_CATEGORY/TagProducts';
import AboutUs from './Components/Common/AboutUs';
import PolicyPage from './Components/Common/Policy';
import CustomerCare from './Components/Common/CustomerCare';
import InfluencerFormPage from './Components/Common/Influencer';

// ── Layout: hides Navbar & Footer on admin/activate routes ───────────────────
function Layout({ children }) {
  const location = useLocation();
  const hideNavFooterRoutes = ['/activate', '/babapanel', '/babadash', '/admin/login'];
      const [searchQuery, setSearchQuery]   = useState("");
  const shouldHide = hideNavFooterRoutes.some(
    (route) => location.pathname === route || location.pathname.startsWith(route + '/')
  );
  return (
    <>
      {!shouldHide && <Navbar />}
      {children}
      {!shouldHide && <Footer />}
      {!shouldHide && <WhatsAppFloat />}
    </>
  );
}

// ── FIX: was reading state.auth.isLoggedIn (undefined) ───────────────────────
// authSlice stores isAuthenticated, not isLoggedIn.
// This caused every /account visit to redirect to "/" even when logged in.
const PrivateRoute = ({ children }) => {
  const isAuthenticated = useSelector(selectIsAuthenticated);
  return isAuthenticated ? children : <Navigate to="/" replace />;
};

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/product/:slug" element={<ProductDetail />} />
      <Route path="/category/:slug" element={<CatProducts />} />
      <Route path='/contact' element={<ContactUs />} />

      {/* Redirect bare /account to default tab */}
      <Route path="/account" element={<Navigate to="/account/userprofile" replace />} />
      <Route
        path="/account/:activeTab"
        element={
          <PrivateRoute>
            <UserDashboard />
          </PrivateRoute>
        }
      />
      <Route path="/wholesale/about" element={<AboutUs/>}/>

      <Route path="/activate" element={<ActivatePage />} />
      <Route path="/shopByCategory/:slug" element={<ShopByPrice />} />
                      <Route path="/policies/:slug" element={<PolicyPage/>}/>
                      <Route path='/wholesale/customer-care' element={<CustomerCare/>}/>
                      <Route path='/wholesale/influencer' element={<InfluencerFormPage/>}/>

      {/* Public admin auth entrypoints for wholesale admin users. */}
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route path="/admin/unauthorized" element={<AdminUnauthorized />} />

      {/*
       * /no-access is shown to regular users who hit admin URLs.
       * It stays public so the redirect target can always render.
       */}
      <Route path="/no-access" element={<UserTab />} />

      <Route
        path="/babapanel"
        element={
          <AdminPrivateRoute>
            <AdminDashboard />
          </AdminPrivateRoute>
        }
      />
      <Route
        path="/babadash/*"
        element={
          <AdminPrivateRoute>
            <AdminDashboard />
          </AdminPrivateRoute>
        }
      />
       <Route path="/checkout" element={<Checkout />} />
                      {/* <Route path="/TagProducts/:slug" element={<TagProducts/>}/> */}
    </Routes>
  );
}
// ✅ Fix — App.jsx SessionHandler mein
function SessionHandler() {
  const dispatch = useDispatch();
  const isAuthenticated = useSelector(selectIsAuthenticated);
  const [sessionChecked, setSessionChecked] = useState(false);
  const location = useLocation();
  const isAdminRoute =
    location.pathname.startsWith('/babapanel') ||
    location.pathname.startsWith('/babadash') ||
    location.pathname.startsWith('/admin/login') ||
    location.pathname.startsWith('/admin/unauthorized') ||
    location.pathname.startsWith('/no-access');
  const hasUserToken = (() => {
    try {
      const token = localStorage.getItem(WHOLESALE_USER_ACCESS_TOKEN_KEY);
      return Boolean(token) && isCustomerTokenCompatible(token, "wholesale");
    } catch {
      return false;
    }
  })();
  
  const { isLoading, error } = useGetMeQuery(undefined, {
    // Only run once on mount to check existing session
    refetchOnMountOrArgChange: false,
    refetchOnReconnect: false,
    refetchOnFocus: false,
    // Don't auto-refetch, just check once
    skip: isAdminRoute || !hasUserToken || (sessionChecked && isAuthenticated),
  });

  useEffect(() => {
    const handleUserForceLogout = () => {
      dispatch(logout());
    };

    const handleAdminForceLogout = () => {
      dispatch(adminForceLogout());
    };

    window.addEventListener('auth:logout:wholesale-user', handleUserForceLogout);
    window.addEventListener('auth:logout:wholesale-admin', handleAdminForceLogout);

    return () => {
      window.removeEventListener('auth:logout:wholesale-user', handleUserForceLogout);
      window.removeEventListener('auth:logout:wholesale-admin', handleAdminForceLogout);
    };
  }, [dispatch]);

  useEffect(() => {
    // Once we have a response (success or error), session check is complete
    if (!isLoading) {
      setSessionChecked(true);
    }
  }, [isLoading]);

  useWishlistInit();
  useCartInit();

  const { canPrompt: canShowPushPrompt } = usePushNotifications(
    isAuthenticated && !isAdminRoute,
    isAuthenticated
  );
  const [pushPromptVisible, setPushPromptVisible] = useState(false);
  const [installPromptOpen, setInstallPromptOpen] = useState(() => !isPwaInstalled());

  useEffect(() => {
    if (isAdminRoute || !canShowPushPrompt || installPromptOpen) {
      setPushPromptVisible(false);
      return undefined;
    }
    const delayMs = isPwaInstalled() ? 900 : 800;
    const t = window.setTimeout(() => setPushPromptVisible(true), delayMs);
    return () => window.clearTimeout(t);
  }, [isAdminRoute, canShowPushPrompt, installPromptOpen]);

  useEffect(() => {
    if (!isAuthenticated || isAdminRoute) return undefined;
    let pending = false;
    try {
      pending = sessionStorage.getItem('owb_push_subscribe_after_login') === '1';
    } catch {
      // ignore
    }
    if (!pending) return undefined;
    let cancelled = false;
    (async () => {
      try {
        sessionStorage.removeItem('owb_push_subscribe_after_login');
        if (cancelled) return;
        await subscribeToWebPush();
        setPushPromptVisible(false);
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, isAdminRoute]);

  return (
    <>
      <PushNotificationPrompt
        visible={pushPromptVisible}
        isLoggedIn={isAuthenticated}
        onNeedLogin={() => dispatch(openModal('login'))}
        onDismiss={() => setPushPromptVisible(false)}
      />
      <InstallAppPrompt
        enabled={!isAdminRoute}
        onVisibilityChange={setInstallPromptOpen}
      />
    </>
  );
}

// ── SessionHandler: checks existing session on every app load ─────────────────
// Runs GET /auth/me once. On success → authSlice populates user + isAuthenticated.
// On 401 → authSlice quietly sets isAuthenticated = false (no error shown).
// After session is confirmed, loads the right cart/wishlist source.
// function SessionHandler() {
//   const dispatch = useDispatch();
//   const isAuthenticated = useSelector(selectIsAuthenticated);
//   const [sessionChecked, setSessionChecked] = useState(false);

//   const { isLoading } = useGetMeQuery(undefined, {
//     refetchOnMountOrArgChange: false,
//     refetchOnReconnect: false,
//     refetchOnFocus: false,
//     skip: sessionChecked && isAuthenticated,
//   });
//      // ── Cart & wishlist — fine here, they drive Navbar badges ────────────────
//     // DO NOT call these again inside any tab component
//     // useWishlistInit();
//     // useCartInit();
//     // In App.jsx — also skip wishlist/cart on admin routes
//     useWishlistInit();  // pass enabled flag
//     useCartInit();

//   // Mark session as checked once the query settles (success or error)
//   useEffect(() => {
//     if (!isLoading) setSessionChecked(true);
//   }, [isLoading]);

//   // Guest: load cart & wishlist from localStorage
//   // useEffect(() => {
//   //   if (sessionChecked && !isAuthenticated) {
//   //     dispatch(loadGuestCart());
//   //     dispatch(loadGuestWishlist());
//   //   }
//   // }, [sessionChecked, isAuthenticated, dispatch]);

//   // Authenticated: fetch cart & wishlist from server
//   // useEffect(() => {
//   //   if (sessionChecked && isAuthenticated) {
//   //     dispatch(fetchCart());
//   //     dispatch(fetchWishlist());
//   //   }
//   // }, [sessionChecked, isAuthenticated, dispatch]);

//   return null;
// }

function App() {
  return (
    <BrowserRouter>
      <ToastConfig />
      <SessionHandler />
      <AuthModal />
      <Layout>
        <AppRoutes />
      </Layout>
    </BrowserRouter>
  );
}

export default App;
