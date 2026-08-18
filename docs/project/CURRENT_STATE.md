# Estado atual da documentação e do produto

> Documento vivo. Não copie daqui um rótulo para substituir
> `apps/web/build-info.json`. O manifesto e o status PWA da aplicação são as
> fontes da versão realmente publicada e carregada.

## Baseline desta revisão

A documentação viva de 17 de agosto de 2026 corresponde ao build
`20260817-0054mn1`, sucessor do marco publicado `0054mm`. O incremento adiciona
uma paleta fina sobre ações e comandos já registrados, sem criar outro registro.

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

## Contratos em consolidação

- fachada unificada de autoria sobre adapters legados;
- extrusão por caminho e álgebra geral de operadores de malha;
- estabilidade de seleção/preview em hierarquias e ocorrências complexas;
- colisão triangular e aceleração espacial;
- proxy físico, visual GLB e mapeamento de clips;
- runtime de eventos/procedimentos para jogos;
- atualização PWA durante desenvolvimento em múltiplos checkouts.

## Arquitetura pretendida

- modificadores vinculados e regeneração procedural incremental;
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
