import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Card } from '../atoms/Card';
import { Button } from '../atoms/Button';

interface Props {
  children: ReactNode;
  featureTitle?: string;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class FeatureErrorBoundary extends Component<Props, State> {
  public override state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('FeatureErrorBoundary caught an error:', error, errorInfo);
  }

  public handleRetry = () => {
    this.setState({ hasError: false, error: undefined });
  };

  public override render() {
    if (this.state.hasError) {
      return (
        <Card borderVariant="critical" className="p-6 my-4 bg-rose-critical/10 border-rose-critical/40">
          <div className="flex flex-col items-center text-center max-w-md mx-auto space-y-3">
            <div className="w-12 h-12 rounded-full bg-rose-critical/20 flex items-center justify-center text-rose-critical text-2xl font-bold">
              ⚠
            </div>
            <h3 className="text-base font-bold text-slate-100">
              {this.props.featureTitle || 'Modul'} Xətası Baş Verdi
            </h3>
            <p className="text-xs text-slate-300 font-mono">
              Bu komponentdə xəta baş verdi, lakin SAMT-ın digər modulları stabil işləməyə davam edir.
            </p>
            {this.state.error && (
              <pre className="p-2 bg-navy-950/80 rounded border border-rose-critical/30 text-[11px] text-rose-300 font-mono text-left w-full overflow-x-auto">
                {this.state.error.message}
              </pre>
            )}
            <Button size="sm" variant="danger" onClick={this.handleRetry}>
              Yenidən Cəhd Et
            </Button>
          </div>
        </Card>
      );
    }

    return this.props.children;
  }
}
