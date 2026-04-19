import React from 'react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    this.setState({ info });
    // You can also log to an external service here
    console.error('ErrorBoundary caught error:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-8">
          <div className="max-w-2xl rounded-xl bg-white shadow-lg p-8">
            <h1 className="text-2xl font-semibold text-slate-900">Something went wrong</h1>
            <p className="mt-4 text-slate-600">An unexpected error occurred while loading the application.</p>
            <div className="mt-6 bg-slate-100 p-4 rounded">
              <p className="text-sm font-medium text-slate-700">Error:</p>
              <pre className="mt-2 text-xs text-slate-700 whitespace-pre-wrap">{this.state.error?.toString()}</pre>
              {this.state.info?.componentStack && (
                <>
                  <p className="mt-4 text-sm font-medium text-slate-700">Component stack:</p>
                  <pre className="mt-2 text-xs text-slate-700 whitespace-pre-wrap">{this.state.info.componentStack}</pre>
                </>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
