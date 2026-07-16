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
