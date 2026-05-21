import { Link } from 'react-router-dom'

export function PrivacyPage() {
  return (
    <main className="legal-page">
      <section className="panel legal-panel">
        <p className="eyebrow">RideSync</p>
        <h1>Privacy Policy</h1>
        <p>
          RideSync stores the minimum data needed for realtime ride coordination: display name,
          device rider ID, invite metadata, and telemetry events shared during active sessions.
        </p>
      </section>

      <section className="panel legal-panel">
        <h2>What Is Stored</h2>
        <p>
          Local device data includes display name, rider identity, invite metadata, and queued
          telemetry for reconnect resilience. Server data includes ride members, recent locations,
          waypoints, and invite/organizer access tokens.
        </p>

        <h2>How Data Is Used</h2>
        <p>
          Data is used only to deliver live ride coordination features. It is not sold or used for
          advertising.
        </p>

        <h2>Data Deletion</h2>
        <p>
          Use the Delete My Data page to remove local app data from your browser. Server-side data
          retention depends on the deployment operator configuration.
        </p>
      </section>

      <footer className="legal-links">
        <Link to="/">Back To RideSync</Link>
        <Link to="/terms">Terms of Use</Link>
        <Link to="/delete-account">Delete My Data</Link>
      </footer>
    </main>
  )
}
