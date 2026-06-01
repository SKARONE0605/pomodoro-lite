import { StrictMode, Component, ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

class ErrorBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null }
  static getDerivedStateFromError(e: Error) { return { error: e.message + '\n' + e.stack } }
  render() {
    if (this.state.error) {
      return (
        <pre style={{ padding: 20, color: 'red', background: '#fff', whiteSpace: 'pre-wrap', fontSize: 13 }}>
          {this.state.error}
        </pre>
      )
    }
    return this.props.children
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
