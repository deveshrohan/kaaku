import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info?.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        this.props.fallback || (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', height: '100%', gap: 12, padding: 24,
            color: 'rgba(255,255,255,0.6)', fontSize: 13,
          }}>
            <span style={{ fontSize: 28 }}>&#9888;</span>
            <span>Something went wrong</span>
            <button
              onClick={() => this.setState({ error: null })}
              style={{
                background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 8, padding: '6px 14px', color: 'rgba(255,255,255,0.7)',
                cursor: 'pointer', fontSize: 12,
              }}
            >
              Retry
            </button>
          </div>
        )
      )
    }
    return this.props.children
  }
}
