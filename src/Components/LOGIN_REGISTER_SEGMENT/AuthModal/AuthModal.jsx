// Components/LOGIN_REGISTER_SEGMENT/AuthModal/AuthModal.jsx
import React, { useEffect, useCallback, useState } from "react";
import { X, UserPlus, LogIn } from "lucide-react";
import logo from "../../../assets/logo2.svg"
import { useDispatch, useSelector } from "react-redux";
import {
  closeModal,
  setActiveTab,
  selectIsModalOpen,
  selectActiveTab,
} from "../../REDUX_FEATURES/REDUX_SLICES/WHOLESALE/wholesalerSlice";
import LoginPage from "../LoginPage/LoginPage";
import RegisterPage from "../RegisterPage/RegisterPage";
import ForgotPassword from "../ForgotPassword/ForgotPassword";

const AuthModal = () => {
  const dispatch = useDispatch();
  const isOpen = useSelector(selectIsModalOpen);
  const activeTab = useSelector(selectActiveTab);
  const [showForgotPassword, setShowForgotPassword] = useState(false);

  const handleLoginSuccess = (user) => {
    setShowForgotPassword(false);
    dispatch(closeModal());
    console.log('[AuthModal] Login successful for:', user?.name || user?.email);
  };

  const handleKeyDown = useCallback(
    (e) => { if (e.key === "Escape") dispatch(closeModal()); },
    [dispatch]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
      setShowForgotPassword(false);
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) dispatch(closeModal());
  };

  const handleTabChange = (tab) => {
    setShowForgotPassword(false);
    dispatch(setActiveTab(tab));
  };

  return (
    <div
      className="fixed inset-0 z-[9500] flex items-end sm:items-center justify-center sm:p-4"
      style={{ backgroundColor: "rgba(15, 23, 42, 0.7)", backdropFilter: "blur(4px)" }}
      onClick={handleBackdropClick}
    >
      <div
        className="relative bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl
                   max-h-[95vh] sm:max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >

        {/* Mobile drag handle */}
        <div className="flex justify-center pt-3 sm:hidden shrink-0">
          <div className="w-10 h-1 bg-slate-200 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 pt-3 sm:pt-5 pb-3 sm:pb-4 border-b border-slate-100 shrink-0">
          <div className="min-w-0">
            <h1 className="text-sm sm:text-base font-black text-[#0F172A] uppercase tracking-[0.15em] leading-tight">
              Wholesaler Portal
            </h1>
            <p className="text-[10px] sm:text-xs text-slate-500 mt-0.5 font-medium">
              Offer Wale Baba — B2B Marketplace
            </p>
          </div>
          <button
            onClick={() => dispatch(closeModal())}
            className="shrink-0 w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-slate-100
                       hover:bg-slate-200 flex items-center justify-center
                       transition-all duration-200 text-slate-500 hover:text-slate-800"
            aria-label="Close modal"
          >
            <X size={16} />
          </button>
        </div>

        {showForgotPassword ? (
          <div className="overflow-y-auto flex-1 px-4 sm:px-6 py-4 sm:py-5">
            <ForgotPassword
              onBack={() => setShowForgotPassword(false)}
              onLoginClick={() => {
                setShowForgotPassword(false);
                dispatch(setActiveTab("login"));
              }}
              onLoginSuccess={handleLoginSuccess}
            />
          </div>
        ) : (
          <>
            {/* Logo */}
            <div className="flex justify-center pt-3 sm:pt-4 shrink-0">
              <img
                className="w-20 h-20 sm:w-28 sm:h-28 object-contain"
                src={logo}
                alt="OfferWaleBaba logo"
              />
            </div>

            {/* Tab switcher */}
            <div className="flex px-4 sm:px-6 pt-3 sm:pt-4 gap-2 shrink-0">
              <button
                onClick={() => handleTabChange("login")}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl
                            text-xs font-black uppercase tracking-wider transition-all duration-200
                            ${activeTab === "login"
                              ? "bg-[#0F172A] text-white shadow-lg"
                              : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                            }`}
              >
                <LogIn size={13} /> Login
              </button>
              <button
                onClick={() => handleTabChange("register")}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl
                            text-xs font-black uppercase tracking-wider transition-all duration-200
                            ${activeTab === "register"
                              ? "bg-[#478B8D] text-[#0F172A] shadow-lg"
                              : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                            }`}
              >
                <UserPlus size={13} /> Register
              </button>
            </div>

            {/* Scrollable content */}
            <div className="overflow-y-auto flex-1 px-4 sm:px-6 py-4 sm:py-5">
              {activeTab === "login" && (
                <LoginPage
                  onLoginSuccess={handleLoginSuccess}
                  onForgotPasswordClick={() => setShowForgotPassword(true)}
                />
              )}
              {activeTab === "register" && <RegisterPage />}
            </div>
          </>
        )}

      </div>
    </div>
  );
};

export default AuthModal;
