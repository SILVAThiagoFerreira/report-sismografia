# Report Sismográfico — Versão GitHub Pages

Frontend estático (HTML + CSS + JS) que reproduz o pipeline Python
`REPORT SISMOGRAFIA` **inteiramente no navegador do usuário**. Nada é enviado
para servidor: os CSVs são lidos localmente, os gráficos são renderizados em
`<canvas>`, o PDF é montado com [pdf-lib], convertido em PNG via [pdf.js] e
empacotado em ZIP com [JSZip].

Aceita os mesmos CSVs `.IDFW.CSV` do pipeline Python e devolve os três
artefatos com nomes idênticos ao original:

- `ENAEX_NSR-<YYYYMMDD>_nota_whatsapp.txt`
- `ENAEX_NSR-<YYYYMMDD>.pdf`
- `ENAEX_NSR-<YYYYMMDD>.png`

## Testar localmente

```bash
cd pages
python -m http.server 5058
# abrir http://127.0.0.1:5058/
```

Não precisa de Node, Flask, nada — só um servidor de arquivos estático (o
navegador exige `http://` para carregar módulos e CDNs).

## Publicar no GitHub Pages

### Opção A — repositório dedicado (mais simples)

1. Cria um repositório novo no GitHub, ex.: `report-sismografia`.
2. Copia o conteúdo desta pasta `pages/` para a raiz do repo — o arquivo
   `index.html` precisa ficar na raiz.
3. Push para `main`.
4. Em **Settings → Pages**, selecione:
   - Source: **Deploy from a branch**
   - Branch: `main` / pasta `/ (root)`
5. Aguarde 1-2 minutos. URL final:
   `https://<seu-usuario>.github.io/report-sismografia/`

Comandos:

```bash
cd caminho/para/pages
git init
git add .
git commit -m "Report Sismográfico: publicação inicial"
git branch -M main
git remote add origin https://github.com/<usuário>/report-sismografia.git
git push -u origin main
```

### Opção B — subpasta em um repositório existente

Se você já tem um repositório com GitHub Pages ativo (por exemplo o hub
OpenBlast US MVV), coloque o conteúdo em uma subpasta e o site ficará em
`https://<seu-usuario>.github.io/<repo>/<subpasta>/`.

Nesse caso, edite o `index.html` desta pasta e ajuste os caminhos relativos
se você renomear a subpasta — hoje tudo é relativo (`assets/`, `js/`,
`styles.css`), então basta não mexer na estrutura interna.

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
- **Gráficos**: canvas 1430×1001, mesma paleta e mesmos marcadores (quadrado
  vermelho / diamante azul / triângulo verde), curva NBR com quebra de eixo
  Y quando aplicável. A proporção vertical 6.5×4.55in é a mesma do renderer
  Python e evita o achatamento dos eixos nos cartões A4.

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
