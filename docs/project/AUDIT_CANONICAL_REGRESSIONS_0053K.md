# Auditoria — regressões canônicas (0053k)

Data: 2026-08-09

Base auditada: `0053i-scale-render-preset-regressions`

Resultado: aprovado nos gates automatizados, com validação manual em navegador ainda recomendada para comportamento visual WebGL.

## Escopo

Esta auditoria cobre a unificação da resolução de objetos canônicos e efêmeros, referências compostas recursivas, consistência geométrica/espacial, edição de malha e continuidade visual durante transformações.

## Causas confirmadas e correções

| Sintoma | Causa | Correção / invariante |
| --- | --- | --- |
| Override perdido ao agrupar instância compacta | Apenas `$self` sobrevivia à compactação do nível externo | Overrides descendentes agora recebem prefixo de caminho e continuam resolvíveis em qualquer profundidade. |
| Transformação duplicada ou inconsistente em referências | Fontes de matriz efetiva eram combinadas por caminhos independentes | `LocallyResolvedObjectHierarchy` resolve recursivamente mundo/local com precedência explícita e fallback para a camada inferior. |
| “Salto” de um frame após transformar | Overlay era liberado na mutação síncrona do sandbox, antes da projeção visual correspondente | Sessão entra em `committing` e só é liberada quando o renderer confirma uma revisão aplicada posterior à revisão-base; temporizador é apenas salvaguarda. |
| “Fantasma” na primeira edição de malha | Ocultação atingia um recurso por ID, sem compor famílias e outras razões de visibilidade | `MeshEditVisibility` oculta recursos do proprietário antes de exibir o grupo editável e compõe razões independentes de ocultação. |
| Escala negativa ausente | O cálculo 2D truncava fatores no mínimo positivo e o compositor rejeitava componentes negativos | O fator conserva o sinal ao cruzar o pivô; somente a escala singular é proibida e o renderer encaminha a paridade negativa para a geometria espelhada. |

## Ordem de resolução

As camadas efetivas seguem prioridade determinística:

1. base canônica projetada;
2. animação;
3. preview compartilhado;
4. preview local rápido.

Uma camada pode substituir matriz, limites ou patch do objeto. Campos ausentes são herdados da camada inferior. Quando um ancestral muda e um descendente não possui matriz explícita naquela camada, o local do descendente é derivado da camada inferior e recomposto sob o novo mundo do ancestral. Isso preserva referências aninhadas sem materializar a árvore inteira.

## Consistência hierárquica e espacial

- IDs canônicos e caminhos de ocorrência permanecem estáveis; exceções locais continuam em copy-on-write.
- Seleções de transformação são canonicalizadas para impedir commit duplo de ancestral e descendente.
- A mesma matriz resolvida alimenta apresentação e operações espaciais cobertas pelo renderer.

## Evidências automatizadas

Os testes específicos cobrem três níveis de hierarquia, precedência e fallback
entre camadas, preservação de override em grupo aninhado, contexto de mundo sem
dupla aplicação, composição de visibilidade, permanência do preview até a
revisão projetada e escala negativa como espelho. Os gates correntes verificam
também arquitetura, alcance, manifesto PWA e regressões anteriores; a suíte do
navegador permanece a autoridade para casos dependentes de DOM e WebGL.

## Riscos residuais e validação manual recomendada

1. Confirmar em navegador real/WebGL a primeira entrada em edição de malha, verificando ausência de frame com malha antiga e nova simultaneamente.
2. Transformar grupos e referências em três níveis, com animação e preview compartilhado ativos, verificando ausência de salto no commit.
3. Cruzar o pivô pelas alças de eixo, plano e canto, verificando o espelho e a continuidade do commit.

O auditor arquitetural mantém 140 achados legados já existentes; esta mudança não introduziu novos achados nesse conjunto.
