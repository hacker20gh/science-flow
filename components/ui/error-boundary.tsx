"use client";

import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="bg-white border border-gray-200 rounded-xl p-6 text-center">
          <div className="w-12 h-12 mx-auto mb-3 bg-red-50 rounded-full flex items-center justify-center">
            <svg
              className="w-6 h-6 text-red-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v2m0 4h.01M12 3l9.5 16.5H2.5L12 3z"
              />
            </svg>
          </div>

          <p className="text-sm font-medium text-gray-800 mb-1">
            组件加载出错
          </p>
          <p className="text-xs text-gray-500 mb-4">
            {this.state.error?.message || "未知错误"}
          </p>

          <button
            onClick={this.handleRetry}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            重试
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
