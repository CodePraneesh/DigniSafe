import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary
      sectionName="DigniSafe Root Application"
      fallbackTitle="Safety Console Critical Fault Contained"
      fallbackMessage="An unexpected crash occurred in the client application runtime. Sensor ingest and automated facility safety pipelines are functioning normally."
    >
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)

