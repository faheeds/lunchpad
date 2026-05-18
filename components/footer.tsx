import Link from "next/link";

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer style={{
      background: "var(--dark-bg)",
      borderTop: "1px solid rgba(255,255,255,0.1)",
      padding: "32px 20px 24px",
      color: "rgba(255,255,255,0.7)",
      fontSize: 13,
    }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        {/* Links grid */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
          gap: "24px 16px",
          marginBottom: 24,
        }}>
          <div>
            <p style={{
              fontSize: 11, fontWeight: 700, letterSpacing: "0.05em",
              textTransform: "uppercase", color: "rgba(255,255,255,0.9)",
              marginBottom: 10, margin: 0,
            }}>
              Product
            </p>
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              <li style={{ marginBottom: 6 }}>
                <Link href="/menu" style={{
                  color: "rgba(255,255,255,0.7)", textDecoration: "none",
                }}>
                  Menu
                </Link>
              </li>
              <li style={{ marginBottom: 6 }}>
                <Link href="/order" style={{
                  color: "rgba(255,255,255,0.7)", textDecoration: "none",
                }}>
                  Order
                </Link>
              </li>
              <li>
                <Link href="/contact" style={{
                  color: "rgba(255,255,255,0.7)", textDecoration: "none",
                }}>
                  Contact
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <p style={{
              fontSize: 11, fontWeight: 700, letterSpacing: "0.05em",
              textTransform: "uppercase", color: "rgba(255,255,255,0.9)",
              marginBottom: 10, margin: 0,
            }}>
              Legal
            </p>
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              <li style={{ marginBottom: 6 }}>
                <Link href="/terms" style={{
                  color: "rgba(255,255,255,0.7)", textDecoration: "none",
                }}>
                  Terms
                </Link>
              </li>
              <li style={{ marginBottom: 6 }}>
                <Link href="/privacy" style={{
                  color: "rgba(255,255,255,0.7)", textDecoration: "none",
                }}>
                  Privacy
                </Link>
              </li>
              <li>
                <a href="#" style={{
                  color: "rgba(255,255,255,0.7)", textDecoration: "none",
                }}>
                  FAQ
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Divider */}
        <div style={{
          borderTop: "1px solid rgba(255,255,255,0.1)",
          paddingTop: 16,
        }}>
          <p style={{ margin: 0, fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
            © {currentYear} LunchPad. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
