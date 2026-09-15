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

Antes da geração, o usuário informa a unidade de serviço no campo
**Unidade de serviço**. O valor inicial é `US MINERAÇÃO VALE-VERDE` e o texto
preenchido é aplicado ao cabeçalho e ao escopo do relatório somente naquela
execução.

## Paleta ENAEX

A identidade do relatório é centralizada em `js/config.js`, no objeto
`branding.palette`: Cinza Enaex `#38424B`, Vermelho Enaex `#E20613` e variações
de branco/cinza nos fundos e rótulos. A série longitudinal usa Cinza Enaex,
a série vertical mantém o verde `#16A34A` e o verde `#67C70A` fica reservado
à conformidade positiva; nenhum azul é usado no template.

O formulário também permite informar o target executivo de vibração em mm/s
(inicialmente `0,8`) e escolher se a linha “Índices de vibração” será exibida
no relatório. O target continua sendo aplicado à avaliação do limite executivo
e à nota para WhatsApp; a caixa de seleção controla apenas a visibilidade da
linha no PDF.

Para até três pontos, PDF e PNG formam uma única página A4 com resumo, os dois
gráficos normativos e os cartões dos pontos. Campanhas com datas de evento
misturadas ou campos essenciais inválidos são rejeitadas antes da geração.
Qualificadores instrumentais `<` e `>` são preservados nos valores exibidos.

## Testar localmente

```bash
cd pages
python -m http.server 5058
# abrir http://127.0.0.1:5058/
```

Não precisa de Node, Flask, nada — só um servidor de arquivos estático (o
navegador exige `http://` para carregar módulos e CDNs).

## Publicação atual no GitHub Pages

O gerador está publicado em
<https://silvathiagoferreira.github.io/report-sismografia/> no repositório
`SILVAThiagoFerreira/report-sismografia`. A configuração atual do Pages usa a
branch `main` na pasta `/docs`. Portanto, `pages/` é a fonte de trabalho local;
antes do push, seu conteúdo deve ser sincronizado com `docs/`.

Não publique CSVs de operação, logs ou pastas `output/`: o gerador processa os
arquivos escolhidos somente em memória no navegador.

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
- **Layout do PDF**: a primeira página concentra resumo, gráficos e pontos
  monitorados para campanhas de até três pontos. O pdf-lib usa a mesma origem
  A4 do reportlab (canto inferior esquerdo, 1 pt = 1/72").
- **Gráficos**: canvas 1430×794, mesma paleta e curva NBR com quebra de eixo Y
  quando aplicável. A proporção é derivada de `figure_width`/`figure_height`
  em `js/config.js`; a área dos eixos usa margens compactas para preservar a
  leitura dentro dos cartões A4 mais altos.

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
