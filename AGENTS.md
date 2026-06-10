# AGENTS.md

## Papel do Sistema

Aplicação em Python para leitura de sismogramas em PDF, extração de dados técnicos, validação prévia e geração de saídas rastreáveis.

## Regras Permanentes

- Não mover lógica crítica para um único arquivo.
- Não processar entrada sem validação anterior.
- Não introduzir valores fixos novos sem atualizar `config.json` e a documentação correspondente.
- Não apagar artefatos legados sem registrar a decisão em `SPEC.md`.
- Não gerar saídas sem registrar identificador temporal e pasta de execução.

## Contratos Técnicos

- `main.py` é o único ponto de entrada.
- `src/sismo_report/config.py` resolve configuração e caminhos.
- `src/sismo_report/parser.py` lê e interpreta PDFs.
- `src/sismo_report/pipeline.py` orquestra a execução.
- `src/sismo_report/report.py` gera o PDF e a imagem PNG.
- `src/sismo_report/whatsapp.py` gera a nota textual.

## Diretórios

- `input/`: PDFs canônicos de entrada.
- `output/`: artefatos gerados e organizados por data.
- `logs/`: trilhas de execução e diagnóstico.
- `tests/`: validações mínimas e verificáveis.

## Critério de Evolução

- Toda alteração de regra operacional deve atualizar `SPEC.md`, `PIPELINE.md` e `CHECKLIST.md`.
- Toda mudança de formato deve atualizar `DATA_SCHEMA.md`.
- Toda mudança de execução deve atualizar `README.md` e `TASK.md`.

## Qualidade

- Preferir mudanças pequenas e auditáveis.
- Preservar compatibilidade legada apenas quando necessário para a migração.
- Documentar qualquer decisão implícita diretamente no projeto.
