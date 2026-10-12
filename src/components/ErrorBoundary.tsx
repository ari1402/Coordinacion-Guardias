import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('Error no capturado en la app:', error);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center px-4 text-center bg-bg text-text">
          <div className="max-w-md">
            <h1 className="text-lg font-semibold mb-2">Algo salió mal</h1>
            <p className="text-sm text-text-dim mb-3">
              La app tuvo un error inesperado. Probá recargar la página; si sigue, avisale a
              Bea o a Ana con el detalle de abajo.
            </p>
            <pre className="text-xs text-left bg-surface-2 border border-border rounded-lg p-3 overflow-auto">
              {this.state.error.message}
            </pre>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
