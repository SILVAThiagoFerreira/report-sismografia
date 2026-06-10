# PROMPT.md

## Instrução Para Agentes Futuros

Trate este projeto como um sistema operacional de dados, não como um script pontual.

## Como Trabalhar

- Leia `SPEC.md`, `PIPELINE.md` e `DATA_SCHEMA.md` antes de alterar lógica.
- Preserve a separação entre leitura, validação, processamento e saída.
- Atualize a documentação sempre que a regra mudar.
- Faça a menor mudança que resolva o problema com segurança.
- Prefira configurações em `config.json` a valores fixos no código.

## Proibições

- Não ocultar decisões implícitas.
- Não misturar parsing, validação e saída no mesmo bloco sem necessidade.
- Não introduzir dependências novas sem justificativa técnica.
- Não assumir formato de entrada sem documentar.

## Forma de Entrega

- Primeiro explique o contrato do sistema.
- Depois implemente.
- Por fim valide e registre o resultado.
