import { Link } from 'react-router-dom'

export function TermsPage() {
  return (
    <main className="legal-page">
      <section className="panel legal-panel">
        <p className="eyebrow">RideSync</p>
        <h1>Terms of Use</h1>
        <p>
          RideSync is provided as a ride-coordination tool for planning and live status visibility.
          You remain fully responsible for safe riding decisions, route compliance, and legal road use.
        </p>
      </section>

      <section className="panel legal-panel">
        <h2>Safety Notice</h2>
        <p>
          Do not interact with the app while actively operating a motorcycle. Use a passenger or stop
          safely before making changes.
        </p>

        <h2>Service Scope</h2>
        <p>
          RideSync availability, map providers, and realtime delivery are best-effort. Temporary
          outages may occur and should not be treated as emergency-grade infrastructure.
        </p>

        <h2>Acceptable Use</h2>
        <p>
          You must not use RideSync for unlawful activity, harassment, or unsafe group ride behavior.
          Organizers are responsible for invite handling and participant moderation.
        </p>
      </section>

      <footer className="legal-links">
        <Link to="/">Back To RideSync</Link>
        <Link to="/privacy">Privacy Policy</Link>
        <Link to="/delete-account">Delete My Data</Link>
      </footer>
    </main>
  )
}
