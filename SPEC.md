# SPEC.md

## Objetivo

Receber arquivos CSV de sismografia, validar os registros e gerar um relatório visual com exportação local no navegador.

## Entradas

- Um ou mais arquivos CSV enviados pelo usuário.
- Campos técnicos por ponto monitorado, conforme `DATA_SCHEMA.md`.

## Processamento

1. Ler os CSVs no navegador.
2. Normalizar campos numéricos e datas.
3. Validar presença de pelo menos um registro útil.
4. Calcular status de vibração e conformidade.
5. Renderizar a pré-visualização do report.
6. Permitir exportação de PDF, PNG, JSON e nota rápida.

## Saídas

- Relatório visual com a identidade do projeto.
- PDF exportável a partir da pré-visualização.
- PNG do report.
- JSON com os dados consolidados.
- Texto pronto para WhatsApp.

## Regras de Negócio

- A ordem dos registros segue a ordem do CSV e, quando houver múltiplos arquivos, a ordem de seleção.
- A validação falha explicitamente se não houver registros válidos.
- O status de vibração usa o limite configurado na própria interface.
- Os dados brutos são preservados no JSON exportado.

## Validações

- Campos numéricos são convertidos com tolerância para vírgula decimal.
- Campos ausentes viram `N/D` apenas na apresentação.
- Datas inválidas não interrompem a leitura, mas ficam assinaladas como ausentes.

## Decisões

- O produto ativo é uma aplicação estática para GitHub Pages.
- O fluxo legado em PDF não é mais o caminho principal.
- O processamento local no navegador evita dependência de IA e de backend.
