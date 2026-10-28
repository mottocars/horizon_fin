# API Horizon — documentação

Página pública da API Horizon (`https://api.horizonhub.com.br`): referência de todos os endpoints e
"Testar" ao vivo (cada execução gera um token novo com a chave digitada e chama a API).

- Conteúdo dos endpoints, campos e erros: `src/endpoints.js` (fonte única dos exemplos, tabelas e
  formulários). Mudou algo em `backend/src/modules/api-horizon/v1/`? Mude lá também.
- Textos fixos (introdução, autenticação, convenções, limites, segurança): `index.html`.
- Visual: mesmo tema do sistema (`src/styles.css` repete os tokens de `frontend/src/styles/index.css`).

## Desenvolvimento

```bash
cd api-docs
npm install
npm run dev        # http://localhost:5182 — o "Testar" chama o backend local (http://localhost:3001/api/v1)
```

Outro backend: `VITE_API_BASE=http://localhost:3002/api/v1 npm run dev`. A origem da página precisa estar
em `API_HORIZON_DOCS_ORIGINS` do backend (padrão: `http://localhost:5182,https://api.horizonhub.com.br`).

## Produção (VPS)

Contêiner `api-docs` do `docker-compose.yml` (`127.0.0.1:3013`). A API em si é o backend
(`/api/v1`), já no contêiner `backend`.

1. DNS: registro `A` de `api.horizonhub.com.br` → IP da VPS.
2. `backend/.env.production`:
   ```
   API_HORIZON_PUBLIC_URL=https://api.horizonhub.com.br
   API_HORIZON_DOCS_ORIGINS=https://api.horizonhub.com.br
   ```
3. Nginx do host (`/etc/nginx/sites-available/api.horizonhub.com.br`) e depois `certbot --nginx -d api.horizonhub.com.br`:
   ```nginx
   server {
       listen 80;
       server_name api.horizonhub.com.br;

       # API: /v1/... → backend /api/v1/...
       location /v1/ {
           proxy_pass http://127.0.0.1:3011/api/v1/;
           proxy_set_header Host $host;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
           client_max_body_size 64k;
       }

       # Documentação
       location / {
           proxy_pass http://127.0.0.1:3013/;
           proxy_set_header Host $host;
       }
   }
   ```
4. `docker compose up -d --build backend api-docs`.

A chave digitada no "Testar" fica só na memória da aba; a CSP da página (`nginx.conf`) só permite
chamadas ao próprio domínio.
