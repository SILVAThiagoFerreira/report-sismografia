# PIPELINE.md

## Fluxo Sequencial

1. Carregar a interface web.
2. Selecionar um ou mais CSVs.
3. Ler e normalizar os registros.
4. Validar se existe pelo menos um ponto monitorado processável.
5. Calcular o resumo executivo e o status de vibração.
6. Renderizar o report na tela.
7. Exportar PDF, PNG, JSON e nota rápida, se solicitado.

## Regra visual

As cores das séries e dos componentes do relatório são resolvidas pela paleta
configurada em `docs/js/config.js`. O marcador longitudinal deve usar Cinza
Enaex, o marcador vertical deve permanecer verde e os estados de conformidade
devem continuar usando o verde de status.

## Modo de Uso

1. Abrir a página do GitHub Pages.
2. Fazer upload dos CSVs.
3. Conferir os dados.
4. Baixar os artefatos gerados.

A renderização dos gráficos reserva área para a legenda inferior e mantém os segmentos da curva normativa e os marcadores das medições no PDF e PNG gerados no navegador.

Após a geração, a interface apresenta uma pré-visualização do relatório e disponibiliza os arquivos para download. A alteração das entradas ou opções invalida a prévia anterior. O relatório mantém divisórias úteis, sem contornos externos nos blocos.

O relatório usa marcadores discretos nos títulos, sem linhas cinzas decorativas, e uma assinatura vetorial DNA Enaex no rodapé. O cabeçalho técnico não repete a contagem de pontos. A geometria compacta reserva mais altura aos gráficos e mantém os três primeiros pontos na primeira página.

Os estados de conformidade usam um retângulo neutro sem contorno, filete e símbolo vetoriais na cor do estado e texto selecionável no PDF. O PNG é derivado desse mesmo relatório.
