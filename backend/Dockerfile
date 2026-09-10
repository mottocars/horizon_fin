FROM node:20-alpine

WORKDIR /app

# Python + brazilfiscalreport — gera o DANFE/DANFSe oficial (layout ABNT) a
# partir do XML da nota; não existe biblioteca Node com a mesma fidelidade,
# por isso rodamos como subprocesso a partir do backend Node. Os demais
# pacotes (asyncpg, pandas, pdfplumber, requests, xlrd) são usados pelos
# scripts de importação em backend/scripts/ (parse_dcd.py, parse_epr.py,
# parse_extrato.py, _sie_unitis.py) — sem eles, "Falha ao processar o
# arquivo: ModuleNotFoundError" ao importar planilha/PDF.
RUN apk add --no-cache python3 py3-pip && \
    python3 -m venv /opt/venv && \
    /opt/venv/bin/pip install --no-cache-dir \
        'brazilfiscalreport[danfse]' \
        asyncpg \
        pandas \
        pdfplumber \
        requests \
        xlrd
ENV PATH="/opt/venv/bin:$PATH"
ENV PYTHON_BIN=python3

# Instala só as dependências de produção primeiro (melhor uso do cache do Docker)
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY . .

# uploads/ é montado como volume em produção, mas o diretório precisa existir
# antes do primeiro upload — e precisa pertencer ao usuário não-root abaixo.
RUN mkdir -p uploads && \
    addgroup -S horizonfin && adduser -S horizonfin -G horizonfin && \
    chown -R horizonfin:horizonfin /app

USER horizonfin

EXPOSE 3001

CMD ["node", "src/server.js"]
