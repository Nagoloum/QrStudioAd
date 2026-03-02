import { useTheme } from "./ThemeContext";

/**
 * QRScanSpinner – replaces the old CSS spinner.
 * Shows a QR-pattern frame with an animated scan-line.
 * Fully themed (dark / light).
 */
export default function QRScanSpinner({ visible = true }) {
  const { c } = useTheme();
  if (!visible) return null;

  const dots = [
    1,1,1,0,1,1,1,
    1,0,1,0,1,0,1,
    1,0,1,0,1,0,1,
    0,0,0,1,0,0,0,
    1,0,1,0,1,0,1,
    1,0,1,0,1,0,1,
    1,1,1,0,1,1,1,
  ];

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: c.spinnerBg,
      backdropFilter: "blur(8px)",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      gap: 16, transition: "background 0.3s",
    }}>
      {/* QR frame */}
      <div style={{ position: "relative", width: 110, height: 110 }}>
        {/* Corner brackets */}
        {[
          { top: 0,    left: 0,    borderTop:`3px solid ${c.accent}`, borderLeft: `3px solid ${c.accent}` },
          { top: 0,    right: 0,   borderTop:`3px solid ${c.accent}`, borderRight:`3px solid ${c.accent}` },
          { bottom: 0, left: 0,    borderBottom:`3px solid ${c.accent}`, borderLeft: `3px solid ${c.accent}` },
          { bottom: 0, right: 0,   borderBottom:`3px solid ${c.accent}`, borderRight:`3px solid ${c.accent}` },
        ].map((s, i) => (
          <div key={i} style={{ position: "absolute", width: 20, height: 20, ...s, borderRadius: 2 }} />
        ))}

        {/* QR mini pattern */}
        <div style={{
          position: "absolute", inset: 10,
          display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2,
          padding: 4,
        }}>
          {dots.map((v, i) => (
            <div key={i} style={{
              borderRadius: 2,
              background: v ? c.accent : "transparent",
              opacity: v ? 0.75 : 0,
              animation: v ? `qrCellPulse ${1.2 + (i % 5) * 0.18}s ${(i % 7) * 0.06}s ease-in-out infinite alternate` : "none",
            }} />
          ))}
        </div>

        {/* Scan line */}
        <div style={{
          position: "absolute", left: 8, right: 8, height: 2, borderRadius: 1,
          background: `linear-gradient(to right, transparent, ${c.accent}, transparent)`,
          boxShadow: `0 0 8px ${c.accent}`,
          animation: "scanLine 1.6s ease-in-out infinite",
        }} />
      </div>

      <p style={{
        margin: 0, fontSize: 12, fontWeight: 600,
        color: c.textMuted, letterSpacing: "0.12em",
        textTransform: "uppercase", animation: "fadeText 1.6s ease-in-out infinite",
      }}>
        Generating…
      </p>

      <style>{`
        @keyframes scanLine {
          0%   { top: 12px; opacity: 0; }
          8%   { opacity: 1; }
          92%  { opacity: 1; }
          100% { top: 98px; opacity: 0; }
        }
        @keyframes qrCellPulse {
          from { opacity: 0.35; transform: scale(0.85); }
          to   { opacity: 0.85; transform: scale(1); }
        }
        @keyframes fadeText {
          0%, 100% { opacity: 0.5; }
          50%       { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
