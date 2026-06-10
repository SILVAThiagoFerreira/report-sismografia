# CHECKLIST.md

## Conclusão Mínima

- [x] `README.md` descreve uso, entradas, saídas e execução.
- [x] `AGENTS.md` define regras permanentes.
- [x] `TASK.md` descreve a tarefa atual.
- [x] `SPEC.md` formaliza comportamento e validações.
- [x] `PIPELINE.md` descreve o fluxo sequencial.
- [x] `DATA_SCHEMA.md` documenta a estrutura dos dados.
- [x] `input/`, `output/`, `logs/` e `tests/` existem.
- [x] Existe ao menos um teste de fumaça executável.
- [x] A aplicação web aceita CSV e gera artefatos.
- [x] A validação falha de forma explícita quando não há CSVs válidos.

## Qualidade Operacional

- [x] Caminhos e parâmetros vêm de configuração externa quando aplicável.
- [x] Não há lógica monolítica.
- [x] A geração é rastreável por timestamp.
- [x] Os artefatos são identificáveis por nome.
- [x] O status de vibração aparece no relatório e na nota rápida.
