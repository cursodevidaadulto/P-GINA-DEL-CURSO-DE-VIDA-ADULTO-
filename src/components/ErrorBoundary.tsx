import React, { Component, ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: error?.message || 'Error inesperado en la aplicación.',
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('ErrorBoundary capturó un error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      let friendlyMsg = this.state.message;
      try {
        const parsed = JSON.parse(this.state.message);
        if (parsed?.error) {
          friendlyMsg = `Error de acceso o sincronización (${parsed.operationType} en ${parsed.path}): ${parsed.error}`;
        }
      } catch {
        // Plain text message
      }

      return (
        <div className="min-h-screen bg-[#F8F7F2] flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-white rounded-2xl border border-[#102A43]/12 p-8 shadow-md text-center">
            <div className="w-12 h-12 rounded-xl bg-[#F07832]/15 text-[#F07832] flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h2 className="font-display text-xl font-bold text-[#102A43] mb-2">
              Se produjo un inconveniente en la plataforma
            </h2>
            <p className="text-sm text-[#102A43]/75 mb-6 break-words">{friendlyMsg}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 bg-[#102A43] hover:bg-[#183B5E] text-white font-semibold text-sm px-5 py-2.5 rounded-xl transition-colors cursor-pointer"
            >
              <RotateCcw className="w-4 h-4 text-[#F07832]" />
              Recargar plataforma
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
