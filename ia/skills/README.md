# Skills do Claude para o Horizon Fin

## analista-cfo-horizon

Analista CFO financeiro que usa o conector MCP "DFC Construtoras" para analisar caixa, fôlego por SPE,
cenários, orçamento × realizado, dívida PJ (CEF), fornecedores e carteira, e escrever relatórios para a
diretoria. Com o conector "ALTERA ORÇAMENTO", também ajusta valores HORIZON - INFORMADO com confirmação.

### Instalar no claude.ai

1. Gere o pacote: `python ia/skills/empacotar.py` → `ia/skills/analista-cfo-horizon.zip`.
2. No claude.ai: **Configurações › Capacidades** — deixe ligada a execução de código e criação de
   arquivos (as skills dependem dela).
3. **Configurações › Capacidades › Skills › Enviar skill** e escolha o `.zip`. Ligue a skill.
4. Conecte o conector DFC Construtoras (no Horizon Fin, ícone de IA ao lado da foto → copie a URL →
   Configurações › Conectores › Adicionar conector personalizado).
5. Numa conversa nova, pergunte, por exemplo: "Como está o caixa da empresa?" ou "Qual SPE preocupa e
   por quê?". O Claude carrega a skill sozinho.

### Manter

- A skill descreve as ferramentas do MCP (`backend/src/modules/integracoes-mcp/dfc/tools`) e os limites do
  painel (`frontend/src/pages/Dashboards/EconomicoFinanceiro/fluxo/analise.js`). Mudou uma regra lá?
  Atualize `references/metricas.md` / `references/ferramentas.md`, gere o zip de novo e reenvie.
- As consultas de `references/sql.md` foram testadas na ferramenta `dfc_consultar_sql`.
