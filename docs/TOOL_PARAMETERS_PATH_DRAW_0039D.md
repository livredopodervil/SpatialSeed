# Parâmetros de ferramenta e desenho distributivo — 0039d

> Marco histórico. O `0039e` substitui `count` no desenho distributivo por
> espaçamento progressivo e cacheia os recursos do preview. Consulte
> [`PATH_BRUSH_AUTHORING_0039E.md`](PATH_BRUSH_AUTHORING_0039E.md).

## Objetivo

Este incremento cria a primeira projeção do registro declarativo de
ferramentas. HUD, workspace, painel contextual e console deixam de manter
defaults concorrentes para tubo, varredura, distribuição no caminho e
operações topológicas parametrizadas.

O desenho livre passa a produzir dois resultados:

- um tubo/caminho paramétrico;
- cópias de qualquer geometria ou grupo selecionado, distribuídas diretamente
  pelo traço.

## Registro e armazenamento

`EditToolRegistry` declara identidade, família, comando, ciclo de vida e schema
dos parâmetros. Cada parâmetro possui tipo, default, limites, opções e, quando
necessário, uma condição de apresentação.

`ToolParameterStore` mantém valores normalizados por `toolId` em:

```text
spatialseed.edit.tool-parameters.v1
```

O registro possui `schemaVersion`. Valores de ferramentas diferentes nunca são
mesclados. Uma execução explícita atualiza somente a ferramenta invocada;
opções omitidas recuperam sua última configuração válida. O armazenamento pode
ser injetado, portanto os testes não leem o `localStorage` real.

Na primeira abertura, os defaults antigos de HUD e criação de tubo são
importados quando válidos. As chaves antigas permanecem intactas. Um registro
gravado por versão futura é preservado e fica somente leitura neste build.

O armazenamento é preferência local do usuário. Não entra no documento
`.spatialseed`, no histórico do projeto nem na coordenação entre viewers.

## Superfícies

O workspace contém um painel gerado pelo schema do registro. Os controles
especializados já existentes são aliases da mesma origem e continuam
adequados ao uso rápido. Alterar qualquer superfície atualiza as demais.

As ferramentas cobertas neste marco são:

- desenho de tubo ou distribuição no traço;
- tubo por referência;
- varredura de perfil;
- distribuição por referência;
- caminho obtido da seleção de malha;
- extrude, inset e split topológicos.

O registro foi construído para receber outras famílias sem acrescentar
armazenamento ou formulários específicos.

## Desenho com preview

`PathSketchController` conserva pontos e parâmetros apenas na sessão local. O
traço é projetado no plano escolhido, simplificado e suavizado antes do
resultado.

Em modo `tube`, o preview reconstrói uma malha temporária. Em modo `array`, a
seleção é congelada ao armar a ferramenta e o preview usa instâncias locais das
geometrias renderizáveis da hierarquia. Para proteger interação e memória, o
preview mostra no máximo 256 cópias; a confirmação aceita até 10.000.

Nenhum preview altera sandbox, recuperação ou undo.

Ao soltar o ponteiro:

- `tube` confirma uma única criação geométrica;
- `array` clona as subárvores selecionadas, calcula frames de transporte
  paralelo e confirma um único `selection.duplicate`.

Um único undo remove todo o lote. A seleção final contém apenas as raízes da
última amostra. Grupos preservam hierarquia e transforms locais.

## Curvas e planos

O desenho pode operar no plano de edição travado, no frame atual do viewer ou
nos planos mundiais XY, XZ e YZ. Catmull-Rom centrípeta, chordal e uniforme,
polilinha e Bézier cúbica compartilham o mesmo pipeline de frames.

Quando amostras livres são solicitadas como Bézier, elas são convertidas para
controles `3n+1` antes de criar, prever ou distribuir.

## Console

```text
path draw
path draw mode=tube radius=0.12 curve=polyline plane=world-xy
path draw mode=array count=16 align=on twist=90

path tube object=curve-id
path sweep path=curve-id profile=profile-id
path array object=curve-id
```

Opções fornecidas são validadas e lembradas. Opções omitidas não recebem
defaults do parser; são resolvidas pelo `ToolParameterStore`.

## Roteiro visual

1. Abra o workspace e, em parâmetros, escolha **Desenhar tubo ou distribuir**.
2. Selecione `tube`, altere raio e cor, arme o desenho e arraste no viewer.
   Confirme que a malha temporária acompanha o traço e que `Esc` não cria undo.
3. Conclua outro traço, use undo uma vez e confirme que somente o tubo criado é
   removido.
4. Recarregue a aplicação e confirme que os valores anteriores reaparecem no
   painel especializado, no painel gerado e no HUD.
5. Selecione uma esfera, uma malha importada ou um grupo, escolha `array` e
   desenhe. Confirme orientação, quantidade e torção no preview.
6. Solte o ponteiro e confirme que um único undo remove todas as cópias.
7. Execute `path tube object=id` sem raio e confirme que ele reutiliza o último
   raio de tubo, não o raio de desenho nem um default do console.

## Fronteira

Este marco não torna resultados de tubo, sweep ou array vinculados às
referências de origem. Eles continuam snapshots persistentes. Também não
implementa ainda a redefinição paramétrica de objetos pelo Inspector, o editor
completo de pivô/origem, o grid configurável ou instrumentos 2D; esses recursos
devem consumir o mesmo registro e o mesmo modelo de sessão/preview.
