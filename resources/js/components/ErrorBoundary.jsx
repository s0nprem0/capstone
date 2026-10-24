import { Component } from 'react'

// React leaves the whole page blank when a render or a lazy import throws.
// A boundary at the app root turns that into a readable message with a way out.
export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('Unhandled UI error', error, info)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <main className="error-page">
        <div className="error-card" role="alert">
          <p className="error-kicker">Something went wrong</p>
          <h1>The page could not be loaded</h1>
          <p className="text-muted">
            Reload the page to try again. If it keeps happening, sign out and back in or contact the cemetery office.
          </p>
          <div className="error-actions">
            <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
              Reload page
            </button>
            <a className="btn btn-secondary" href="/">
              Back to the map
            </a>
          </div>
        </div>
      </main>
    )
  }
}
