import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Mapa do drilldown "Onde acessou" (Leaflet + OpenStreetMap). Cada local é
// um marcador numerado na ordem em que apareceu no período (1 = primeiro);
// a linha tracejada liga os locais nessa ordem — dá pra ver o caminho
// quando o IP muda. O círculo é a incerteza: localização por IP é de
// cidade, não de endereço. Local exterior em vermelho; a "segunda opinião"
// (outra base que discorda) em cinza, ligada ao local principal.
//
// locais: [{ chave, numero, latitude, longitude, exterior, titulo, linhas: string[], alternativa? }]
// selecionado: chave do local em foco (centraliza e abre o balão).

const AZUL = '#2563eb';
const VERMELHO = '#dc2626';
const CINZA = '#6b7280';
const RAIO_INCERTEZA_M = 15000;

function icone(numero, cor, destaque) {
  const tamanho = destaque ? 30 : 24;
  return L.divIcon({
    className: '',
    iconSize: [tamanho, tamanho],
    iconAnchor: [tamanho / 2, tamanho / 2],
    popupAnchor: [0, -tamanho / 2],
    html: `<div style="width:${tamanho}px;height:${tamanho}px;border-radius:9999px;background:${cor};color:#fff;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;font:600 ${destaque ? 13 : 11}px system-ui,sans-serif">${numero}</div>`,
  });
}

function escapar(texto) {
  return String(texto ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

function balao(local) {
  return `<div style="font:12px system-ui,sans-serif;min-width:180px">
    <div style="font-weight:600;margin-bottom:4px">${local.numero}. ${escapar(local.titulo)}</div>
    ${local.linhas.map((l) => `<div style="color:#4b5563">${escapar(l)}</div>`).join('')}
  </div>`;
}

export default function MapaLocais({ locais, selecionado, onSelecionar }) {
  const divRef = useRef(null);
  const mapaRef = useRef(null);
  const marcadoresRef = useRef(new Map());

  // Cria o mapa uma vez; os locais entram no efeito abaixo.
  useEffect(() => {
    const mapa = L.map(divRef.current, { scrollWheelZoom: true, worldCopyJump: true }).setView([-15.8, -47.9], 4);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
    }).addTo(mapa);
    mapaRef.current = mapa;
    // O modal termina de abrir depois do mount — sem isso o mapa calcula o
    // tamanho errado e fica com faixas cinzas.
    const timer = setTimeout(() => mapa.invalidateSize(), 50);
    return () => {
      clearTimeout(timer);
      mapa.remove();
      mapaRef.current = null;
    };
  }, []);

  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa) return undefined;
    const camada = L.layerGroup().addTo(mapa);
    const marcadores = new Map();

    const ordem = [...locais].sort((a, b) => a.numero - b.numero);
    if (ordem.length > 1) {
      L.polyline(
        ordem.map((l) => [l.latitude, l.longitude]),
        { color: CINZA, weight: 2, opacity: 0.6, dashArray: '6 6' }
      ).addTo(camada);
    }

    for (const local of locais) {
      const cor = local.exterior ? VERMELHO : AZUL;
      const ponto = [local.latitude, local.longitude];
      L.circle(ponto, { radius: RAIO_INCERTEZA_M, color: cor, weight: 1, opacity: 0.4, fillOpacity: 0.08 }).addTo(camada);
      if (local.alternativa) {
        const alt = [local.alternativa.latitude, local.alternativa.longitude];
        L.polyline([ponto, alt], { color: CINZA, weight: 1, dashArray: '2 4' }).addTo(camada);
        L.circleMarker(alt, { radius: 6, color: CINZA, weight: 2, fillColor: '#fff', fillOpacity: 1 })
          .bindTooltip(`Outra base indica ${escapar(local.alternativa.rotulo)}`)
          .addTo(camada);
      }
      const marcador = L.marker(ponto, { icon: icone(local.numero, cor, false), zIndexOffset: 1000 })
        .bindPopup(balao(local))
        .on('click', () => onSelecionar?.(local.chave))
        .addTo(camada);
      marcadores.set(local.chave, { marcador, local, cor });
    }
    marcadoresRef.current = marcadores;

    const pontos = locais.flatMap((l) => [[l.latitude, l.longitude], ...(l.alternativa ? [[l.alternativa.latitude, l.alternativa.longitude]] : [])]);
    if (pontos.length === 1) mapa.setView(pontos[0], 10);
    else if (pontos.length > 1) mapa.fitBounds(pontos, { padding: [40, 40], maxZoom: 11 });

    return () => {
      camada.remove();
      marcadoresRef.current = new Map();
    };
  }, [locais, onSelecionar]);

  useEffect(() => {
    for (const [chave, { marcador, local, cor }] of marcadoresRef.current) {
      const ativo = chave === selecionado;
      marcador.setIcon(icone(local.numero, cor, ativo));
      if (ativo) {
        mapaRef.current?.flyTo(marcador.getLatLng(), Math.max(mapaRef.current.getZoom(), 9), { duration: 0.6 });
        marcador.openPopup();
      }
    }
  }, [selecionado, locais]);

  return <div ref={divRef} className="h-full w-full rounded-lg" />;
}
