# Cronograma por marcos

## Prioridade atual: hierarquia e famílias geométricas

Concluir o ciclo de grupos com desagrupamento de um nível e, na etapa seguinte, ampliar o `GeometryRegistry` com novas famílias paramétricas sem acoplar geometria, propriedades, comandos e renderização.

## 1. Estabilizar 0019g-c2
Registrar commit e tag, enviar ao GitHub, testar seleção, transformações, exclusão, undo/redo, salvar/abrir e cenas grandes.

## 2. Linguagem procedural mínima
Expressões, variáveis, sequências, transformações afins como valores e comandos em lote.

## 3. Grupos
Raiz própria, coordenadas relativas, transformação externa, serialização e transporte entre sandbox e região.

## 4. Experiência de edição
Janelas móveis, inspetor compacto, menos botões, gestos móveis, tolerância de picking e foco de câmera.

## 5. Portabilidade
README, publicação estática, PWA, cache offline, testes multiplataforma e pacote portátil opcional.

## 6. Plugins e autoinspeção
Navegador de arquivos, árvore do projeto, editor textual, plugins, comandos para agentes e integração segura com Git.

## Prioridade futura: persistência compacta

Manter compatibilidade com o schema atual e evoluir em três etapas: JSON compacto, contêiner `.spatialseed` comprimido com abertura retrocompatível e schema procedural/instanciado capaz de preservar protótipos, transforms ou receitas sem expandir matrizes regulares.
