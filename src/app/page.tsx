/**
 * Placeholder home page — Day 1 only proves the skeleton boots.
 * The mobile (Day 3-4) and desktop (Day 5) interfaces replace this.
 */
export default function HomePage() {
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "2rem" }}>
      <h1>PhoneMail</h1>
      <p>Day 1 walking skeleton is running.</p>
      <ul>
        <li>
          <code>POST /api/auth/send-otp</code>
        </li>
        <li>
          <code>POST /api/auth/verify-otp</code>
        </li>
        <li>
          <code>GET /api/health</code>
        </li>
      </ul>
    </main>
  );
}
