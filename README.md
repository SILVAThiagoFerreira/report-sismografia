# Report Sismografia Enaex

Aplicação web estática para importar CSVs de sismografia, validar os dados e gerar um relatório visual no mesmo estilo do material anterior.

## Fluxo

1. O usuário acessa a página publicada no GitHub Pages.
2. Faz upload de um ou mais arquivos CSV.
3. A aplicação consolida os registros, valida os campos essenciais e monta a pré-visualização.
4. O usuário baixa o relatório em PDF, PNG, JSON e a nota rápida para WhatsApp.

## Estrutura de CSV

Cada linha representa um ponto monitorado. Os campos aceitos estão documentados em [`DATA_SCHEMA.md`](./DATA_SCHEMA.md).

## Execução local

Abra [`docs/index.html`](./docs/index.html) em um navegador moderno ou sirva a pasta com um servidor estático.

```powershell
python -m http.server 8000 -d docs
```

Depois acesse `http://localhost:8000`.

## Arquivos principais

- [`docs/index.html`](./docs/index.html): página da aplicação.
- [`docs/styles.css`](./docs/styles.css): identidade visual do report.
- [`docs/app.js`](./docs/app.js): leitura dos CSVs, validação e geração dos artefatos.
- [`docs/manifest.json`](./docs/manifest.json): metadados da aplicação web.
- [`docs/.nojekyll`](./docs/.nojekyll): evita processamento do GitHub Pages.
- [`main.py`](./main.py): mantido para compatibilidade legada do projeto original.

## Observação

O fluxo antigo baseado em PDF foi preservado apenas como referência histórica. O caminho ativo do projeto é o navegador com CSV.
