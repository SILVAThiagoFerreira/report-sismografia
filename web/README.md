# Report Sismográfico — Versão GitHub Pages

Frontend estático (HTML + CSS + JS) que reproduz o pipeline Python
`REPORT SISMOGRAFIA` **inteiramente no navegador do usuário**. Nada é enviado
para servidor: os CSVs são lidos localmente, os gráficos são renderizados em
`<canvas>`, o PDF é montado com [pdf-lib], convertido em PNG via [pdf.js] e
empacotado em ZIP com [JSZip].

Aceita um ou mais CSVs `.IDFW.CSV` do pipeline Python e devolve os três
artefatos com nomes idênticos ao original, além de um ZIP:

- `ENAEX_NSR-<YYYYMMDD>_nota_whatsapp.txt`
- `ENAEX_NSR-<YYYYMMDD>.pdf`
- `ENAEX_NSR-<YYYYMMDD>.png`
- `ENAEX_NSR-<YYYYMMDD>_report.zip`

Para até três pontos, o PDF e o PNG são uma única página A4 com resumo,
gráficos normativos e cartões dos pontos. A validação rejeita campos
essenciais ausentes, números inválidos e datas de evento misturadas; os
qualificadores instrumentais `<` e `>` são preservados.

## Testar localmente

```bash
cd pages
python -m http.server 5058
# abrir http://127.0.0.1:5058/
```

Não precisa de Node, Flask, nada — só um servidor de arquivos estático (o
navegador exige `http://` para carregar módulos e CDNs).

## Publicação atual no GitHub Pages

O repositório `SILVAThiagoFerreira/report-sismografia` publica a branch `main`
na pasta `/docs` em
<https://silvathiagoferreira.github.io/report-sismografia/>. Mantenha `web/`
como fonte de trabalho e sincronize os arquivos da aplicação com `docs/` antes
do push. O site é estático: os CSVs permanecem no dispositivo do usuário.

## Estrutura

```
pages/
├── index.html         — layout, referência para as libs CDN e módulos JS
├── styles.css         — mesmo tema do hub OpenBlast (paleta Enaex)
├── assets/            — logos usados na UI e embutidos no PDF
│   ├── enaex_logo_horizontal.png
│   └── openblast.png
└── js/
    ├── config.js      — limites, prefixos, textos (equivalente a config.json)
    ├── parser.js      — port de src/parser.py
    ├── compliance.js  — port de src/compliance.py (curva NBR 9653)
    ├── whatsapp.js    — port de src/whatsapp.py
    ├── charts.js      — port de src/charts.py em Canvas 2D
    ├── report.js      — port de src/report.py em pdf-lib
    ├── validation.js  — validação e ordenação dos registros
    └── app.js         — orquestrador da UI: drop → pipeline → download
```

## Dependências externas

Todas via CDN, versões pinadas em `index.html`:

- [pdf-lib 1.17.1](https://pdf-lib.js.org/) — montagem do PDF
- [pdf.js 4.10.38](https://mozilla.github.io/pdf.js/) — PDF → PNG
- [JSZip 3.10.1](https://stuk.github.io/jszip/) — ZIP dos 3 arquivos

## Paridade com o pipeline Python

Testado com os três CSVs de referência do projeto:

- **Nota WhatsApp**: byte-a-byte idêntica (excluindo `\r\n` vs `\n` de
  quebras de linha do Windows).
- **Compliance NBR 9653**: interpolação da curva com o mesmo algoritmo.
- **Layout do PDF**: coordenadas idênticas ao `report.py` (origem A4 canto
  inferior esquerdo, 1 pt = 1/72"). Diferença conhecida: o pdf-lib com fonte
  Helvetica não codifica `■` (U+25A0) — substituímos por `•` na única
  ocorrência (linha "Índices de vibração" do escopo).
- **Gráficos**: canvas 1430×635, mesma paleta e mesmos marcadores (quadrado
  vermelho / diamante azul / triângulo verde), curva NBR com quebra de eixo
  Y quando aplicável.

Para editar limites, textos institucionais ou paleta, edite
`js/config.js` — os módulos leem `window.SISMO_CONFIG` no momento do run.

## Sem backend, sem custo

Toda a operação roda no dispositivo do usuário. Isso significa:

- **Zero custo de hospedagem** (GitHub Pages é grátis).
- **Nenhum arquivo sai do computador** — importante para dados operacionais
  de barragens e comunidades.
- **Funciona offline** depois do primeiro carregamento (as libs ficam no
  cache do navegador).

[pdf-lib]: https://pdf-lib.js.org/
[pdf.js]: https://mozilla.github.io/pdf.js/
[JSZip]: https://stuk.github.io/jszip/
