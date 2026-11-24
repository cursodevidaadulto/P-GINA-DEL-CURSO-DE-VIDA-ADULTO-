import React, { useState } from 'react';
import { LogIn, LogOut, ShieldCheck, UserCheck, X } from 'lucide-react';
import { UserProfile } from '../types';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserProfile | null;
  onGoogleSignIn: () => Promise<void>;
  onSignOut: () => Promise<void>;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  user,
  onGoogleSignIn,
  onSignOut,
}) => {
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleLogin = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      await onGoogleSignIn();
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo iniciar sesión con Google.';
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    setLoading(true);
    try {
      await onSignOut();
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/55 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden">
        <div className="px-6 py-4 bg-[#0F375D] text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-white p-0.5 flex items-center justify-center overflow-hidden">
              <img
                src="/assets/aistudio/emblem_ris_san_ignacio_1795206825601_f641f244.jpg"
                alt="RIS San Ignacio"
                referrerPolicy="no-referrer"
                className="w-full h-full object-contain"
              />
            </div>
            <div>
              <h2 id="auth-modal-title" className="text-[15px] font-bold leading-tight">
                Acceso Institucional RIS
              </h2>
              <p className="text-[11px] text-slate-200">Curso de Vida Adulto · San Ignacio</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar ventana"
            className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {!user ? (
            <>
              <div className="space-y-2">
                <p className="text-[14px] text-slate-700 leading-relaxed">
                  Inicie sesión con su cuenta institucional de Google para acceder a módulos
                  restringidos:
                </p>
                <ul className="text-[13px] text-slate-600 space-y-1.5 bg-[#F5F3EE] p-3.5 rounded-xl border border-slate-200/70">
                  <li className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-[#25804A] shrink-0" />
                    <span>Detalle nominal de Control de Calidad HIS</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-[#123B72] shrink-0" />
                    <span>Padrones nominales de seguimiento (con permiso asignado)</span>
                  </li>
                </ul>
              </div>

              {errorMsg && (
                <div className="p-3 rounded-xl bg-[#C74747]/10 border border-[#C74747]/25 text-[#C74747] text-[12.5px]">
                  {errorMsg}
                </div>
              )}

              <button
                type="button"
                onClick={handleLogin}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2.5 bg-[#123B72] hover:bg-[#0e2f5c] text-white font-semibold text-[14px] py-3 px-4 rounded-xl transition-colors shadow-sm disabled:opacity-60 cursor-pointer"
              >
                <LogIn className="w-4 h-4" />
                <span>{loading ? 'Conectando...' : 'Continuar con Google Institucional'}</span>
              </button>
            </>
          ) : (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-[#F5F3EE] border border-slate-200/80 space-y-1.5">
                <p className="text-[15px] font-bold text-[#123B72]">{user.displayName}</p>
                <p className="text-[13px] text-slate-600 font-mono-tabular">{user.email}</p>
                <div className="pt-2 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-slate-700 border-t border-slate-200/80 mt-2">
                  <span>
                    Rol:{' '}
                    <strong className="text-[#123B72]">
                      {user.role === 'admin' ? 'Administrador' : 'Consultor'}
                    </strong>
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    Acceso Nominal:{' '}
                    <strong className={user.nominalAccess ? 'text-[#25804A]' : 'text-slate-500'}>
                      {user.nominalAccess ? 'Autorizado' : 'Solo agregados públicos'}
                    </strong>
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleLogout}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 bg-white hover:bg-slate-50 border border-slate-200 text-[#C74747] font-semibold text-[13.5px] py-2.5 px-4 rounded-xl transition-colors cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span>{loading ? 'Cerrando sesión...' : 'Cerrar sesión institucional'}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
