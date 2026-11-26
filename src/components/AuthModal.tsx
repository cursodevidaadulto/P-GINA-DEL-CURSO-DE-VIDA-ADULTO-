import React, { useState } from 'react';
import { LogOut, ShieldCheck, UserCheck, X } from 'lucide-react';
import { BRAND_LOGOS, UserProfile } from '../types';

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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0B1F33]/65 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      <div className="w-full max-w-md bg-[#F8F7F2] rounded-2xl border border-[#102A43]/15 shadow-2xl overflow-hidden">
        <div className="px-6 py-4 bg-gradient-to-r from-[#102A43] to-[#183B5E] text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-20 h-12 rounded-xl bg-white p-1 flex items-center justify-center overflow-hidden shadow-md shrink-0">
              <img
                src={BRAND_LOGOS.cursoVidaAdulto}
                alt="Curso de Vida Adulto"
                className="w-full h-full object-contain"
              />
            </div>
            <div>
              <h2 id="auth-modal-title" className="font-display text-[15px] font-bold leading-tight">
                Acceso Personal de Salud RIS
              </h2>
              <p className="text-[11px] text-[#F07832] font-semibold">
                Curso de Vida Adulto · San Ignacio
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar ventana"
            className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5 bg-white">
          {!user ? (
            <>
              <div className="space-y-2.5">
                <p className="text-[14px] text-[#102A43]/85 leading-relaxed">
                  Inicie sesión con su cuenta institucional autorizada para consultar información
                  operativa del Curso de Vida Adulto:
                </p>
                <ul className="text-[13px] text-[#102A43]/80 space-y-2 bg-[#F8F7F2] p-3.5 rounded-xl border border-[#102A43]/10">
                  <li className="flex items-center gap-2.5">
                    <ShieldCheck className="w-4 h-4 text-[#F07832] shrink-0" />
                    <span>Detalle autorizado de Control de Calidad HIS</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <UserCheck className="w-4 h-4 text-[#102A43] shrink-0" />
                    <span>Seguimiento nominal por paciente (según permisos asignados)</span>
                  </li>
                </ul>
              </div>

              {errorMsg && (
                <div className="p-3 rounded-xl bg-[#F07832]/12 border border-[#F07832]/35 text-[#102A43] text-[12.5px]">
                  {errorMsg}
                </div>
              )}

              <button
                type="button"
                onClick={handleLogin}
                disabled={loading}
                className="gsi-material-button w-full justify-center shadow-sm"
              >
                <div className="gsi-material-button-content-wrapper justify-center">
                  <div className="gsi-material-button-icon">
                    <svg
                      version="1.1"
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 48 48"
                      style={{ display: 'block' }}
                    >
                      <path
                        fill="#EA4335"
                        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                      />
                      <path
                        fill="#4285F4"
                        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                      />
                      <path
                        fill="#34A853"
                        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                      />
                    </svg>
                  </div>
                  <span className="gsi-material-button-contents">
                    {loading ? 'Conectando cuenta...' : 'Continuar con Google'}
                  </span>
                </div>
              </button>
            </>
          ) : (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-[#F8F7F2] border border-[#102A43]/12 space-y-1.5">
                <p className="text-[15px] font-bold text-[#102A43]">{user.displayName}</p>
                <p className="text-[13px] text-[#102A43]/70 font-mono-tabular">{user.email}</p>
                <div className="pt-2 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-[#102A43]/80 border-t border-[#102A43]/10 mt-2">
                  <span>
                    Rol: <strong className="text-[#102A43]">Personal de Salud</strong>
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    Acceso Nominal:{' '}
                    <strong className={user.nominalAccess ? 'text-[#F07832]' : 'text-[#102A43]/60'}>
                      {user.nominalAccess ? 'Autorizado' : 'Solo agregados'}
                    </strong>
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleLogout}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 bg-[#102A43] hover:bg-[#183B5E] text-white font-semibold text-[13.5px] py-2.5 px-4 rounded-xl transition-colors cursor-pointer"
              >
                <LogOut className="w-4 h-4 text-[#F07832]" />
                <span>{loading ? 'Cerrando sesión...' : 'Cerrar sesión institucional'}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
