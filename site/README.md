# Site do Horizon Finanças

Site público de vendas ("A planilha que morreu"). É um projeto separado do app (`frontend/`): Vite + JavaScript puro + GSAP, com o texto no HTML e as telas do produto geradas pelo **mesmo motor de cálculo** do painel do Fluxo de Caixa.

## Rodar

```bash
cd site
npm install
npm run dev        # http://localhost:5180/
npm run build      # confere o motor e a história do Grupo Aurora, depois gera dist/
npm run preview    # http://localhost:4180/
```

## Onde fica cada coisa

- `index.html`: só o `<head>`. As seções ficam em `src/secoes/*.html` e são incluídas pelo `vite/plugin-site.js`.
- `config.js`: número do WhatsApp (ainda placeholder), mensagens prontas de cada botão, endereço do sistema.
- `src/cenas/`: o comportamento de cada seção (montada sob demanda, quando chega perto da tela).
- `src/mocks/`: as telas do produto em HTML/SVG.
- `src/dados/`: o Grupo Aurora, empresa fictícia. `empresa-demo.js` monta o payload no formato da rota real do painel.
- `src/motor/` e `src/assets/integracoes/`: **gerados**. Não edite; rode `npm run sincronizar`.

## O motor do app

O simulador, os 8 indicadores, o fôlego e as respostas da IA saem de `frontend/src/pages/Dashboards/EconomicoFinanceiro/fluxo/{modelo,analise}.js`, copiados para `src/motor/`. Ao mudar esses arquivos no app:

```bash
npm run sincronizar     # copia de novo
npm run testar-motor    # confere que a história do site ainda fecha
```

O `prebuild` acusa erro se a cópia estiver diferente do app ou se a história quebrar.

## Endereço

| | `VITE_BASE` | `VITE_SITE_URL` | `VITE_INDEXAR` |
|---|---|---|---|
| Desenvolvimento (padrão) | `/` | `https://horizonhub.com.br` | (vazio) |
| Produção (docker-compose.yml) | `/` | `https://horizonhub.com.br` | `true` |

Sem `VITE_INDEXAR=true`, a página sai com `noindex` e o `robots.txt` bloqueia tudo.

No Git Bash, use `MSYS_NO_PATHCONV=1` antes de `VITE_BASE=/`; sem isso, o `/` vira `C:/Program Files/Git/`.

## Conferir

```bash
node scripts/capturas.mjs        # capturas em 1440/390/360, com e sem movimento reduzido, axe e interações
node scripts/lighthouse.mjs      # Lighthouse mobile no build (falha abaixo de 90 em desempenho)
node scripts/og.mjs              # regera public/og.png a partir de og/og.html
```

As capturas ficam em `site/capturas/`, que está no `.gitignore`.

## Antes de publicar

- Número do WhatsApp em `config.js`.
- Cálculo mensal da DRE pronto no sistema (o site mostra a DRE completa).
- Razão social e CNPJ (`ORGANIZACAO` em `config.js`).
- Arte oficial dos logos de integração (o `itau.svg` atual é um desenho genérico).
- Abrir num iPhone de verdade (as capturas são só no Chromium).
