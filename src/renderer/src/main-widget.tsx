import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import './lib/initTheme'
import React from 'react'
import ReactDOM from 'react-dom/client'
import './global.css'
import './lib/logger'
import { TaskbarWidget } from './components/TaskbarWidget'
import { ErrorBoundary } from './components/ErrorBoundary'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary fallbackTitle="Widget Error">
      <TaskbarWidget />
    </ErrorBoundary>
  </React.StrictMode>
)
