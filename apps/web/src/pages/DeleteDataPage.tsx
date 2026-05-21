import { useState } from 'react'

import { Link } from 'react-router-dom'

import { clearTelemetryQueue } from '../services/telemetryStorage'
import { clearAllLocalIdentityData } from '../utils/id'

async function clearBrowserCache(): Promise<void> {
  if (!('caches' in window)) {
    return
  }

  const keys = await caches.keys()
  await Promise.all(keys.map((key) => caches.delete(key)))
}

export function DeleteDataPage() {
  const [isWorking, setIsWorking] = useState(false)
  const [message, setMessage] = useState('')

  const handleDelete = async () => {
    setIsWorking(true)
    setMessage('')

    try {
      await clearTelemetryQueue()
      clearAllLocalIdentityData()
      await clearBrowserCache()
      setMessage('Local RideSync data has been deleted from this browser.')
    } catch (error) {
      const details = error instanceof Error ? error.message : 'Unknown error'
      setMessage(`Could not complete deletion: ${details}`)
    } finally {
      setIsWorking(false)
    }
  }

  return (
    <main className="legal-page">
      <section className="panel legal-panel">
        <p className="eyebrow">RideSync</p>
        <h1>Delete My Data</h1>
        <p>
          This action removes local browser data used by RideSync, including telemetry queue,
          display/profile data, and cached invite metadata.
        </p>
      </section>

      <section className="panel legal-panel">
        <button type="button" className="btn btn-danger" onClick={handleDelete} disabled={isWorking}>
          {isWorking ? 'Deleting...' : 'Delete Local RideSync Data'}
        </button>
        <p>
          After deletion, ride participation will require new invite links and a fresh profile setup
          on this device.
        </p>
        {message && <p className="banner-error">{message}</p>}
      </section>

      <footer className="legal-links">
        <Link to="/">Back To RideSync</Link>
        <Link to="/privacy">Privacy Policy</Link>
        <Link to="/terms">Terms of Use</Link>
      </footer>
    </main>
  )
}
