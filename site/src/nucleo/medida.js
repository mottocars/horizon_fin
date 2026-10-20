// Largura do contêiner (ResizeObserver) — os gráficos desenham na largura exata, como o useLargura do app.
export function observarLargura(el, cb, minimo = 300) {
  let raf = 0;
  let ultima = -1;
  const medir = () => {
    const w = Math.max(minimo, Math.round(el.clientWidth));
    if (w !== ultima) {
      ultima = w;
      cb(w);
    }
  };
  const ro = new ResizeObserver(() => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(medir);
  });
  // Sem medir na hora: a primeira observação do ResizeObserver já chega depois do layout (sem layout forçado).
  ro.observe(el);
  return () => ro.disconnect();
}
