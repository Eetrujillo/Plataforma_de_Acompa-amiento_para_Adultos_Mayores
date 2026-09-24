function Ld() {
  const [e, t] = Lr.useState(null);
  return (
    Lr.useEffect(() => {
      fetch("/api/health")
        .then((n) => n.json())
        .then((n) => t(n))
        .catch((n) => t({ error: n.message }));
    }, []),
    gr.jsxs("div", {
      style: { fontFamily: "sans-serif" },
      children: [
        gr.jsx("h1", { children: "MEARN Frontend" }),
        gr.jsx("pre", { children: JSON.stringify(e, null, 2) }),
      ],
    })
  );
}
Ql.createRoot(document.getElementById("root")).render(gr.jsx(Ld, {}));
