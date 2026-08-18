# Documentação do SpatialSeed

Este diretório separa documentação operacional, referência técnica, livro e
registros históricos. A fonte de verdade para o build carregado continua sendo
`apps/web/build-info.json`; comandos e capabilities devem ser consultados no
runtime da própria versão.

## Produtos documentais vivos

| Produto | Público | Função |
| --- | --- | --- |
| [`MANUAL_DO_USUARIO.md`](MANUAL_DO_USUARIO.md) | pessoas usando o editor | tarefas, percursos, interface, PWA e solução de problemas |
| [`REFERENCIA_TECNICA.md`](REFERENCIA_TECNICA.md) | desenvolvimento e integração | contratos, camadas, comandos, formatos, testes e limites |
| [`book/SpatialSeed_Livro_Manual_v1.0.md`](book/SpatialSeed_Livro_Manual_v1.0.md) | leitura longa | fundamentos, arquitetura, manual incorporado e atlas procedural |
| [`book/SpatialSeed_Livro_Manual_e_Atlas_Procedural_v1.0.pdf`](book/SpatialSeed_Livro_Manual_e_Atlas_Procedural_v1.0.pdf) | distribuição | edição consolidada renderizada e verificável |
| [`project/OVERVIEW.md`](project/OVERVIEW.md) | colaboradores | visão do produto e fronteiras atuais |
| [`project/DECISIONS.md`](project/DECISIONS.md) | arquitetura | decisões numeradas e invariantes |
| [`project/ROADMAP.md`](project/ROADMAP.md) | planejamento | sequência, critérios de saída e itens adiados |

## Como interpretar afirmações

Cada texto novo deve usar uma destas categorias:

- **implementado**: existe no código do snapshot documentado;
- **testado**: além de implementado, possui teste ou verificação registrada;
- **contrato em consolidação**: superfície existente cujo comportamento,
  desempenho ou ergonomia ainda pode mudar;
- **decisão**: regra arquitetural vigente;
- **requisito**: condição necessária para aceitar uma entrega;
- **opção**: alternativa avaliada sem compromisso de implementação;
- **horizonte**: arquitetura pretendida, ainda não entregue.

Uma possibilidade não deve ser escrita no tempo presente como capacidade.

## Classificação do acervo anterior

### Preservar como documentos de marco

Arquivos com sufixos de build, como `GAME_MODE_0054A.md`,
`MESH_EXCHANGE_0054J.md` e `CANONICAL_REGRESSIONS_0053K.md`, registram a intenção
e o contrato de um incremento. Eles permanecem úteis para arqueologia e
regressão, mas não são manuais atuais.

### Incorporar nos documentos vivos

Os conteúdos de linguagem, comandos, arquitetura, PWA, arquivos, seleção,
transformações, animação, malha e jogo foram reavaliados e incorporados ao
Manual, à Referência Técnica e ao Livro. Os documentos originais continuam
como fontes especializadas.

### Manter com aviso histórico

Snapshots como `project/CURRENT_STATE.md` quando associados a um marco antigo
devem ser movidos ou explicitamente marcados como históricos. Contagens de
testes, hashes e builds não devem ser copiadas indefinidamente para documentos
vivos.

### Não usar como promessa

`NEXT_ARCHITECTURE.md`, partes prospectivas do `ROADMAP.md`, propostas de
colaboração distribuída, física geral, booleanas robustas e gramáticas de forma
descrevem direções. Elas não são prova de implementação.

## Hierarquia de autoridade

Para determinar o que funciona em uma árvore:

1. código e testes do checkout;
2. `apps/web/build-info.json` e estado PWA exibido;
3. `runtime test help`, `help` e registros consultáveis;
4. Manual e Referência desta edição;
5. documentos vivos em `docs/project/`;
6. documentos de marco e snapshots históricos;
7. conversas e memória, apenas como pista.

## Atualização editorial

Uma mudança pública deve revisar, conforme o impacto:

- README da raiz;
- Manual do Usuário;
- Referência Técnica;
- documento de marco da feature;
- decisões e roadmap;
- ajuda gerada pelo runtime;
- testes e roteiro visual.

O livro não deve ser a única fonte. Ele consolida documentos vivos por inclusão
e adiciona narrativa, fundamentos e atlas.

O contrato de plataformas móveis do build 0054my está registrado em
[`KINEMATIC_PLATFORMS_0054MY.md`](KINEMATIC_PLATFORMS_0054MY.md). Como documento
de marco, ele complementa o Manual e a Referência sem substituir as fontes
vivas.

## Compilação do livro

Na raiz:

```bash
python3 tools/build_spatialseed_book.py
```

O gerador usa os arquivos Markdown vivos, cria o PDF em `docs/book/` e anexa ao
PDF as fontes de consulta selecionadas. A edição só deve ser publicada após
renderização de todas as páginas e inspeção visual.
