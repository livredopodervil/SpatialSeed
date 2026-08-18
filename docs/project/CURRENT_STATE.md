# Estado atual da documentação e do produto

> Documento vivo. Não copie daqui um rótulo para substituir
> `apps/web/build-info.json`. O manifesto e o status PWA da aplicação são as
> fontes da versão realmente publicada e carregada.

## Baseline desta revisão

A documentação viva de 18 de agosto de 2026 corresponde ao build
`20260818-0054mx`, sucessor do marco publicado `0054mm`.

O incremento `0054mo` conecta os parâmetros já declarados pelos providers de
geometria ao registro comum de propriedades. Inspector e Console passam a
editar esses parâmetros pelo comando existente, com undo e serialização comuns.

O incremento `0054mp` substitui as quatro direções tácteis discretas por um
controle circular analógico e integra o visual GLB ao pipeline de sombras já
existente no renderer.

O incremento `0054mq` torna colisores e contatos observáveis sem alterar a
resposta física: body, formas do mundo, apoio, bloqueios e recuperação de
penetração alimentam um overlay Three separado e desligado por padrão.

O incremento `0054mr` usa a OBB orientada do personagem também na narrow phase,
adiciona normais aos casts e estabiliza rampas e paredes com subida limitada,
aderência ao solo e preservação da componente tangencial do movimento.

O incremento `0054ms` ordena recuperação e lançamento do demo: checkpoints e
journals são resolvidos antes de `game.start`, projetos recuperados reabrem em
autoria e o diálogo de recuperação permanece acessível mesmo diante de uma
transição defensiva para o modo jogo.

O incremento `0054mt` separa a direção visual solicitada da orientação física
aceita pela OBB. Em rampas e junto a paredes, a malha acompanha imediatamente a
direção do movimento sem obrigar o proxy físico a atravessar o apoio.

O incremento `0054mu` adiciona um clipboard tipado e local à sessão sobre o
registro universal de propriedades. Inspector, Console e paleta podem copiar
todas as propriedades compatíveis, transformação ou aparência, e colá-las por
uma única mutação com undo/redo.

O incremento `0054mv` corrige a semântica dessa transferência: posição absoluta
deixa de fazer parte do preset de transformação, cada propriedade e seus valores
de origem/destino aparecem antes da confirmação, e material, textura, regra de
cor e cor própria da instância passam a ser presets distintos. O catálogo de
presets é declarativo e extensível; a mutação continua pertencendo ao comando
público e ao serviço universal de propriedades.

O incremento `0054mw` acrescenta uma busca universal de objetos e assets por
query, Console, atalho e botão móvel. O índice usa descritores compactos,
aceita filtros tipados e encaminha a seleção ao comando público existente. A
prévia do clipboard deixa de renderizar conteúdos Base64 completos e mostra
somente tipo e tamanho, preservando o valor original para a aplicação
confirmada.

O incremento `0054mx` introduz a primeira superfície de comportamento por
objeto: bindings portáteis de evento para comando explicitamente autorizado.
Inspector, Console, arquivo de projeto e undo/redo convergem no mesmo serviço;
o runtime combina fontes de sistema, documento e sessão sem dar autoridade ao
DOM ou ao renderer. Grupos de propriedades do Inspector ficam recolhidos por
padrão e abrem quando um valor do grupo é editado.

## Implementado e verificável

- editor espacial com seleção direta e gestos de área;
- transformações, pivôs, snap, duplicação, repeat e grupos aninhados;
- catálogo geométrico, aparência, instancing e projeção incremental;
- plano ativo, ferramentas 2D, caminhos, tubos, sweep e distribuição;
- edição isolada de malha e operadores topológicos incrementais;
- importação e exportação STL;
- projetos `.spatialseed`, recuperação local e PWA;
- console, linguagem afim, Worker + SES, procedimentos e planos atômicos;
- runtime temporal e animação efêmera;
- múltiplos viewers locais e objetos câmera;
- modo jogo local, personagem GLB, colisão, câmera, áudio e eventos;
- perfil diagnóstico, gates, testes do runtime e benchmarks.
- busca de recursos por nome, ID, tipo, visibilidade e categoria.
- comportamento persistente por objeto no formato evento → comando autorizado,
  editável pelo Inspector e pelo Console.

## Contratos em consolidação

- fachada unificada de autoria sobre adapters legados;
- extrusão por caminho e álgebra geral de operadores de malha;
- estabilidade de seleção/preview em hierarquias e ocorrências complexas;
- colisão triangular e aceleração espacial;
- proxy físico, visual GLB e mapeamento de clips;
- ampliação do catálogo de eventos e ações para ponteiro, colisão e propriedades;
- atualização PWA durante desenvolvimento em múltiplos checkouts.

## Arquitetura pretendida

- modificadores vinculados e regeneração procedural incremental;
- bindings reativos entre propriedades e grafo de dependências;
- prefabs parametrizáveis e exportação de applets web autônomos;
- texto, painéis interativos e geometrias implícitas como recursos extensíveis;
- booleanas robustas e reparo topológico geral;
- física de corpos dinâmicos e contatos completos;
- colaboração remota com envelope causal e conflitos geométricos explícitos;
- backend adicional de isolamento para plugins hostis;
- gramática de forma especializada sobre operadores maduros.

## Estado documental

O acervo anterior foi separado em:

- `docs/MANUAL_DO_USUARIO.md` - tarefas;
- `docs/REFERENCIA_TECNICA.md` - contratos;
- `docs/book/` - livro e PDF consolidados;
- `docs/project/` - decisões e planejamento;
- documentos numerados de marco - histórico técnico.

O antigo snapshot 0019g-c2 foi preservado em
`docs/project/history/CURRENT_STATE_0019G_C2.md`.

## Verificação

```bash
python3 tools/run_current_gates.py
```

No perfil diagnóstico:

```text
runtime test help
runtime test all
```

Interação, PWA, câmera, animação e jogo também exigem teste visual.
