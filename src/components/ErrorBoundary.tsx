import { Component, type ErrorInfo, type ReactNode } from 'react'

/**
 * Fallback UI component to display when an error occurs in the child components.
 */

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}
class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children
    }

    return (
      <div className="flex items-center justify-center h-dvh w-full bg-base-100">
        <div className="card w-96 bg-base-200 shadow-xl">
          <div className="card-body">
            <h2 className="card-title text-error">
              Oops! Something went wrong
            </h2>
            <p className="text-base-content/70">
              The application encountered an unexpected error. Please try again.
            </p>
            {this.state.error && (
              <details className="collapse collapse-arrow bg-base-300 mt-4">
                <summary className="collapse-title text-sm font-medium">
                  Error Details
                </summary>
                <div className="collapse-content">
                  <p className="text-xs font-mono break-all">
                    {this.state.error.toString()}
                  </p>
                </div>
              </details>
            )}
            <div className="card-actions justify-end mt-4">
              <button
                type="button"
                className="btn btn-primary"
                onClick={this.handleReset}
              >
                Try Again
              </button>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => window.location.reload()}
              >
                Reload Page
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }
}

export default ErrorBoundary
