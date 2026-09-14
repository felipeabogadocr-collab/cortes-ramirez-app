// Gráfica de barras simple en HTML/CSS, sin librerías externas.
export default function BarChart({ data, color = "var(--brand-2)", height = 140, formatLabel }) {
  const max = Math.max(1, ...data.map((d) => d.total));

  return (
    <div style={{ width: "100%" }}>
      <div style={{ display: "flex", alignItems: "flex-end", height, gap: 4 }}>
        {data.map((d, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              minWidth: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "flex-end",
              height: "100%",
            }}
          >
            {d.total > 0 && (
              <span style={{ fontSize: 11, color: "var(--muted)", marginBottom: 3, fontWeight: 700 }}>{d.total}</span>
            )}
            <div
              style={{
                width: "100%",
                maxWidth: 34,
                height: `${Math.max((d.total / max) * (height - 26), d.total > 0 ? 3 : 0)}px`,
                background: color,
                borderRadius: "3px 3px 0 0",
              }}
            />
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
        {data.map((d, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              minWidth: 0,
              textAlign: "center",
              fontSize: 10.5,
              color: "var(--muted)",
              overflow: "hidden",
              whiteSpace: "nowrap",
              textOverflow: "ellipsis",
            }}
          >
            {formatLabel ? formatLabel(d) : d.label}
          </div>
        ))}
      </div>
    </div>
  );
}
