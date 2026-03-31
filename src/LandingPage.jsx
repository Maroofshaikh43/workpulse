import { Link } from "react-router-dom";
import { Icon } from "./brand";

const features = [
  { icon: "attendance", title: "Verified attendance", description: "Trusted check-ins with location-aware controls." },
  { icon: "team", title: "People operations", description: "Leave, payroll, and onboarding in one workspace." },
  { icon: "broadcast", title: "Team communication", description: "Reach employees and managers without scattered tools." },
  { icon: "chart", title: "Executive visibility", description: "Live reporting for managers and operations teams." },
  { icon: "shield", title: "Governance controls", description: "Role-based access and approval workflows built in." },
  { icon: "report", title: "Daily reporting", description: "Track execution with clean report completion flows." },
];

const plans = [
  {
    name: "Free",
    price: "$0",
    description: "For small teams getting started with modern attendance.",
    points: ["Up to 10 employees", "Attendance and leave tracking", "Basic reporting"],
  },
  {
    name: "Growth",
    price: "$49",
    description: "For growing companies centralizing HR operations.",
    featured: true,
    points: ["Up to 100 employees", "Payroll, assets, and reporting", "Manager approvals and analytics"],
  },
  {
    name: "Business",
    price: "$149",
    description: "For larger teams that need rollout support and controls.",
    points: ["Unlimited employees", "Advanced governance controls", "Priority onboarding support"],
  },
];

export default function LandingPage() {
  return (
    <div className="marketing-shell">
      <header className="marketing-header">
        <Link to="/" className="public-brand">
          <span className="public-brand-mark">WP</span>
          <span className="public-brand-text">WorkPulse</span>
        </Link>
        <nav className="marketing-nav">
          <a href="#features">Features</a>
          <a href="#pricing">Pricing</a>
        </nav>
        <Link className="ghost-button" to="/login">
          Login
        </Link>
      </header>

      <main className="marketing-main">
        <section className="marketing-hero">
          <div className="marketing-hero-copy">
            <h1>Run modern team operations.</h1>
            <p>Attendance, approvals, payroll, and reporting for ambitious companies.</p>
            <div className="marketing-cta-row">
              <Link className="primary-button" to="/login">
                Start free
              </Link>
              <a className="ghost-button" href="#pricing">
                View pricing
              </a>
            </div>
          </div>

          <div className="marketing-preview-card">
            <div className="marketing-preview-tags">
              <span>Attendance</span>
              <span>Payroll</span>
              <span>Approvals</span>
            </div>
            <div className="marketing-preview-grid">
              <div className="preview-tile">
                <span>Check-ins</span>
                <strong>GPS verified</strong>
              </div>
              <div className="preview-tile">
                <span>Approvals</span>
                <strong>Leave in one queue</strong>
              </div>
              <div className="preview-tile">
                <span>Reporting</span>
                <strong>Daily status tracked</strong>
              </div>
              <div className="preview-tile">
                <span>Leadership</span>
                <strong>Leadership-ready insights</strong>
              </div>
            </div>
          </div>
        </section>

        <section className="marketing-section" id="features">
          <div className="section-header center">
            <h2>Everything teams need to operate</h2>
            <p>One product for attendance, communication, reporting, and control.</p>
          </div>
          <div className="marketing-feature-grid">
            {features.map((feature) => (
              <article key={feature.title} className="marketing-feature">
                <div className="feature-icon">
                  <Icon name={feature.icon} />
                </div>
                <strong>{feature.title}</strong>
                <p>{feature.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="marketing-section" id="pricing">
          <div className="section-header center">
            <h2>Simple pricing</h2>
            <p>Built for teams that want enterprise feel without enterprise bloat.</p>
          </div>
          <div className="marketing-pricing-grid">
            {plans.map((plan) => (
              <article key={plan.name} className={`pricing-card${plan.featured ? " featured-plan" : ""}`}>
                <span className="pricing-tier">{plan.name}</span>
                <h3>{plan.price}</h3>
                <p>{plan.description}</p>
                <div className="pricing-points">
                  {plan.points.map((point) => (
                    <span key={point}>{point}</span>
                  ))}
                </div>
                <Link className={plan.featured ? "primary-button" : "ghost-button"} to="/login">
                  Get Started
                </Link>
              </article>
            ))}
          </div>
        </section>
      </main>

      <footer className="marketing-footer">
        <span>WorkPulse</span>
        <span>Attendance and HR for modern teams.</span>
      </footer>
    </div>
  );
}
