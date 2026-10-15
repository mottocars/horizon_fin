# Alterar o Orçamento com segurança

Só existe no conector **"DFC CONSTRUTORAS (ALTERA ORÇAMENTO)"**. Se as ferramentas `dfc_informado_*` não
aparecerem, o conector é só de leitura: explique e sugira ajustar na tela (DFC Construtoras › Orçamentos)
ou pedir ao administrador o conector de alteração.

## O que pode e o que não pode

- **Pode:** inserir, atualizar ou limpar valores de contas com origem **HORIZON - INFORMADO** (digitadas).
- **Não pode:** contas de origem Aging do Sienge, Orçamento Empresarial ou Projeção CEF — vêm das
  integrações. Para mudá-las, o caminho é na fonte (Sienge, Parâmetros da Projeção CEF) ou trocar a
  origem da conta na aba Plano Contas (decisão do usuário, na tela).
- Tudo é gravado em nome de quem fez login no conector e aparece no log da versão como
  "Informado pelo Claude (conector MCP)".

## Fluxo obrigatório

1. **Entenda o pedido** e converta em centro × natureza × meses × valor. Valor com sinal: **saída
   negativa**, entrada positiva. Se o usuário disser "1.700" para uma despesa, confirme que é −1.700.
2. **Ache a conta:** `dfc_informado_contas` (com `centros` e `inicio`/`fim` para ver os valores atuais).
   Se a natureza não estiver lá, ela não é INFORMADO naquele centro — diga a origem dela
   (`dfc_cadastros` tipo naturezas, ou `dfc_detalhar_valor`) e pare.
3. **Mostre o memorando** (modelo em [relatorios.md](relatorios.md#memorando-de-ajuste-do-orçamento)):
   de → para, meses, efeito no caixa. **Peça confirmação explícita.**
4. **Grave** com `dfc_informado_gravar` (vários meses/contas numa chamada só; é tudo ou nada) ou
   `dfc_informado_replicar` (mesmo valor num intervalo de meses).
5. **Prévia da versão:** `dfc_informado_salvar_versao` sem `confirmar`. Mostre TODAS as mudanças — a prévia
   inclui o que outras pessoas digitaram na tela e ainda não foi salvo; destaque o que não foi você.
6. **Só com novo "sim" do usuário:** `dfc_informado_salvar_versao` com `confirmar: true`. Informe o número
   da versão criada.
7. **Confira:** `dfc_painel_fluxo_caixa` (indicadores, trajetória) para mostrar o efeito no caixa.

## Erros comuns

- "Só dá pra informar valor em conta com Origem Projeção HORIZON - INFORMADO" → a conta não é INFORMADO
  naquele centro. Não tente outra conta parecida sem perguntar.
- "Há o mesmo centro × natureza × mês repetido" → mande cada mês uma vez.
- "Não há valores informados pendentes de salvar" → nada a salvar (já salvo ou nada gravado).
- Valores gravados ficam **pendentes** até salvar a versão — o painel e o fluxo só mudam depois.
