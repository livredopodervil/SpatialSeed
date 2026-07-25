# Linha de base dos experimentos — 0029b

## Objetivo

O 0029b torna os sete protótipos algébricos executáveis sem rede e corrige
problemas comuns de recorte, seleção móvel e salvamento. Ele não promove esses
HTMLs ao núcleo nem lhes concede acesso ao sandbox do aplicativo mantido.

## Dependência local

Math.js 11.11.0 foi extraído do pacote npm oficial e incorporado em
`vendor/mathjs-11.11.0/`, junto com licença, aviso e licença do bundle. Os sete
HTMLs apontam para o mesmo arquivo local. O aplicativo em `apps/web/` não usa
Math.js.

Proveniência e hashes estão em [`DEPENDENCIES.md`](DEPENDENCIES.md).

## Controles compartilhados

`apps/experiments/algebraic-structures/legacy-experiment-controls.js` é uma
camada transitória comum aos snapshots. Ela oferece:

- seleção por toque em modos substituir e alternar;
- ação “Selecionar tudo” sem depender de raycasting;
- campos `near` e `far` com a validação `0 < near < far`;
- atualização da matriz de projeção;
- salvamento JSON por seletor nativo quando disponível;
- fallback por download que pergunta o nome e revoga a URL temporária.

Os handlers próprios dos snapshots continuam responsáveis por converter
gestos em identificadores, atualizar a cena e serializar seus objetos. A camada
comum não conhece Three.js, histórico ou formato interno.

## Instâncias, recorte e seleção

Cada snapshot atualiza `InstancedMesh.instanceMatrix` conforme o estado. Antes
do 0029b, os volumes usados por frustum culling e raycasting podiam conservar
posições anteriores. Isso explicava objetos presentes no estado que deixavam de
renderizar ou de responder à seleção.

Depois de cada sincronização, os snapshots agora executam
`computeBoundingBox()` e `computeBoundingSphere()`. O mapa de `instanceId` é
reconstruído na mesma passagem. “Selecionar tudo” usa os identificadores do
estado, portanto também funciona quando um objeto está fora do enquadramento.

## Projeção no aplicativo mantido

O editor principal possui o comando não persistente
`viewer.camera.projection.set` e a consulta
`viewer.camera.snapshot`. A autoridade de `near` e `far` é um `ViewerState`;
`ThreeRegionRenderer` apenas aplica a projeção validada.

O painel “Câmera” usa o mesmo comando. Esses valores não entram no documento,
no sandbox nem no histórico. Um futuro segundo viewer poderá escolher sua
própria projeção sobre o mesmo sandbox.

## Salvamento

No aplicativo mantido, clicar em “Salvar” sempre usa a opção `saveAs`, mesmo
quando já existe um handle anterior. Assim, o seletor nativo oferece o nome em
toda operação. Quando a API não existe ou a plataforma a bloqueia, o gateway
não inicia um download silencioso: a interface pede um nome antes de cada
download compatível.

Nos snapshots históricos, a mesma regra é fornecida pela camada comum. Nomes
sem `.spatialseed` ou `.json` recebem a extensão `.spatialseed`.

## Auditoria

O gate estático precisa passar nos dois modos:

```bash
python3 tools/audit_web_entrypoints.py
python3 tools/audit_web_entrypoints.py --strict-offline
```

A auditoria também verifica que todos os protótipos continuam catalogados e
que scripts, import maps e destinos locais existem.

## Limite arquitetural

O 0029b é uma linha de base de compatibilidade, não uma nova plataforma de
experimentos. Seleção, câmera, persistência e arquivos devem continuar
evoluindo no aplicativo mantido. Construções úteis dos snapshots serão
convertidas gradualmente em definições do `ExperimentRegistry`.

## Roteiro visual

1. abrir os sete HTMLs pelo catálogo, com rede desligada;
2. confirmar cena, grade e objetos iniciais;
3. gerar objetos em posições distantes e confirmar que continuam renderizando;
4. alternar “Seleção: alternar” e tocar em três objetos;
5. usar “Selecionar tudo” e conferir a contagem;
6. aplicar valores válidos e inválidos de `near` e `far`;
7. salvar nos seis snapshots que possuem exportação e escolher nomes;
8. no aplicativo mantido, abrir “Câmera”, alterar o recorte e salvar duas vezes,
   confirmando que o nome é oferecido nas duas operações.
