# SpatialSeed 0054l — plano ativo único de autoria

A UI deixa de apresentar plano de edição e plano de desenho como estados independentes. Há um único **Plano ativo** usado por criação de objetos, ferramentas 2D, caminhos (tubo, sweep, extrusão e revolução), medição e gestos de malha.

Internamente `editPlane` e `drawingPlane` permanecem temporariamente como aliases de compatibilidade, mas `EditContextController` espelha toda definição/limpeza nos dois slots. Consumidores usam `resolveActiveAuthoringPlane()` em vez de escolher prioridades localmente.

A fonte do plano ativo pode ser viewer, XY/XZ/YZ mundial, objeto, face, três pontos, superfície ou helper personalizado. Ferramentas de caminho podem usar Viewer/XY/XZ/YZ como override explícito do gesto, mas não mantêm um segundo plano persistente.

A trava de visualização 2D continua sendo outro conceito: restringe a câmera, não cria um segundo plano de autoria.
