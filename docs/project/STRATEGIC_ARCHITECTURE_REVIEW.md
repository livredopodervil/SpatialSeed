# Avaliação estratégica de arquitetura

> Documento vivo. Elaborado em 16 de julho de 2026 a partir da análise externa
> “Análise Profunda do Projeto SpatialSeed” e auditado contra o marco `0026`.
> A análise recebida é uma fonte consultiva; código, testes e decisões numeradas
> continuam sendo as fontes autoritativas do projeto.

## Objetivo

Este documento integra ao processo decisório as críticas e propostas da análise
externa sem transformar entusiasmo, previsão de mercado ou escolha tecnológica
em fato implementado. Ele:

1. identifica observações compatíveis com a arquitetura existente;
2. corrige afirmações mais fortes do que a evidência permite;
3. converte propostas úteis em hipóteses testáveis;
4. registra critérios para aceitar, adiar ou rejeitar cada alternativa;
5. estima o custo das escolhas ao final.

Não é uma aprovação automática de CRDT, QuickJS/WASM ou CGA, nem uma revisão do
roadmap por apelo à novidade.

## Síntese executiva

A análise reconhece corretamente o principal diferencial do SpatialSeed: o
estado lógico, os comandos e as intenções procedurais não pertencem ao renderer
nem a uma interface específica. Também identifica riscos reais: custo fixo das
abstrações, distância entre a arquitetura local e a colaboração distribuída e
uma curva de aprendizagem potencialmente alta.

As três propostas finais são relevantes, mas precisam mudar de estatuto:

- **CRDT** é candidato a mecanismo de convergência de operações ou documentos;
  não decide sozinho a semântica de conflitos geométricos nem a autoridade de
  uma região.
- **QuickJS em WebAssembly** é candidato a segundo backend para código não
  confiável; não invalida automaticamente Worker + SES e não garante segurança
  ou desempenho sem auditoria da ponte de capacidades.
- **Gramáticas de forma inspiradas em CGA** são uma direção forte para a
  linguagem procedural; a primeira decisão deve ser sobre operadores e
  semântica próprios, não sobre incorporar de imediato uma linguagem ou engine
  completa.

Portanto, a recomendação estratégica é manter as fronteiras atuais e executar
provas de conceito reversíveis depois de especificar conflitos, segurança e
topologia. A vantagem do projeto está nos contratos substituíveis; não há motivo
para abandonar essa vantagem escolhendo cedo demais uma implementação única.

## Auditoria das premissas

### Pontos confirmados pelo projeto

- GUI, console e automação convergem para comandos públicos.
- região, sandbox e viewer têm responsabilidades distintas.
- Three.js é projeção e não modelo canônico.
- seleção, pivô, propriedades, geometrias, aparências e hierarquias possuem
  contratos independentes da apresentação.
- instanciamento e caches são otimizações transparentes à identidade lógica.
- expressões afins usam AST restrita e determinística.
- JavaScript isolado produz planos revisáveis antes do commit atômico.
- PWA, arquivos portáteis e futura recuperação local são responsabilidades
  separadas.

Essas características sustentam a tese de que o SpatialSeed pode atender
automação, educação, visualização técnica e autoria procedural web. Elas não
comprovam ainda escalabilidade distribuída, CAD topológico completo ou
adequação comercial a um setor específico.

### Afirmações que exigem correção

#### O projeto ainda não é um event store integral

O SpatialSeed registra comandos editoriais e mantém histórico local, mas o
estado atual não deve ser descrito como Event Sourcing completo. Undo, snapshots
e serialização não constituem por si só um log durável, distribuído e
reexecutável de todos os eventos. Uma futura colaboração deve decidir quais
operações são fatos persistentes e quais são apenas intenção, preview, presença
ou cache.

#### O modelo de objetos não deve ser chamado de ECS genérico sem qualificação

Os objetos possuem identidade e componentes descritivos, mas o projeto não
implementa necessariamente as tabelas, archetypes e sistemas de um ECS de alto
desempenho. O termo adequado hoje é **modelo lógico orientado a componentes**.
Uma migração para ECS só se justificará por perfil de acesso e benchmark.

#### AST não deve envolver toda manipulação microscópica

Previews visuais são deliberadamente transitórios. ASTs e planos são valiosos
em expressões, procedimentos e operações persistentes, mas inserir nós
semânticos em cada quadro de arraste contrariaria a decisão “preview não é
commit” e aumentaria custo sem benefício documental.

#### Convergência de CRDT não equivale a validade geométrica

Yjs e Automerge oferecem tipos compartilhados e sincronização independente do
transporte. Eles resolvem ordenação e convergência no modelo que implementam;
não sabem se duas extrusões concorrentes preservam manifold, se uma face
excluída ainda pode receber material ou se um filho pode sobreviver à remoção do
grupo pai. Essas regras continuam sendo responsabilidade do domínio.

#### P2P e federação não são alternativas excludentes

CRDTs podem viajar por WebSocket, WebRTC, arquivo ou servidor; autoridade pode
continuar regional mesmo com replicação entre pares. Transporte, convergência,
identidade, autorização e política de publicação são eixos distintos.

#### WebAssembly não torna uma VM “inquebrantável”

QuickJS/WASM separa representações de objetos e memória da VM hospedeira, uma
vantagem importante para código de terceiros. Entretanto, segurança também
depende de limites de memória e CPU, validação de mensagens, APIs concedidas,
origem do binário, atualizações e vulnerabilidades do interpretador. Toda ponte
host–guest volta a ser parte da base confiável.

#### QuickJS não promete desempenho nativo do navegador

QuickJS é pequeno e tem inicialização rápida, mas é um interpretador diferente
do motor otimizado do navegador. O relato técnico da própria Figma descreveu a
solução baseada em VM como mais segura para aquela classe de vulnerabilidade e
mais lenta para certos plugins. O custo real no Android deve ser medido com os
programas e planos do SpatialSeed.

#### CGA é precedente, não contrato do SpatialSeed

CGA demonstra o valor de shapes com escopo orientado, regras, splits,
componentes, repetição e contexto. O SpatialSeed pode aproveitar esses conceitos
sem reproduzir a sintaxe, a semântica ou o acoplamento a modelagem arquitetônica
de uma plataforma específica.

## Decisões estratégicas derivadas

### 1. Colaboração: autoridade regional com convergência substituível

**Direção:** preservar a região como domínio de autoridade e definir um envelope
de operação independente de transporte e de biblioteca CRDT.

Antes de escolher Yjs, Automerge, OT ou protocolo próprio, especificar:

- identidade de autor, região, operação, alvo e revisão causal;
- diferença entre comando, fato aceito, proposta, presença e snapshot;
- matriz de conflitos por operação;
- regras para exclusão, reparenting, propriedades e futura topologia de mesh;
- invalidação, rejeição e compensação de operações;
- limites de histórico, compactação e recuperação;
- política de autorização da região.

**Prova de conceito:** duas réplicas locais, sem rede obrigatória, editam uma
cena pequena, trocam operações em ordens distintas e convergem para o mesmo
hash canônico. O teste deve incluir conflito semântico deliberado e demonstrar
rejeição ou resolução explícita, não apenas convergência de mapas JSON.

**Critério de escolha:** adotar a biblioteca que preserve o envelope do domínio
com menor custo de bytes, memória, compactação e adaptação. A biblioteca não
entra no formato `.spatialseed` como detalhe incontornável.

### 2. Scripts e plugins: backend de isolamento substituível

**Direção:** Worker + SES permanece o backend implementado para scripts locais
planejadores. QuickJS/WASM será avaliado para um nível de confiança mais baixo,
especialmente plugins distribuídos por terceiros.

A interface comum deve cobrir:

- carregar fonte e dados clonáveis;
- conceder capabilities explícitas;
- limitar tempo, memória, quantidade de saída e tamanho do plano;
- interromper e descartar a instância;
- retornar somente valores serializáveis;
- produzir diagnósticos sem expor DOM, renderer ou runtime;
- registrar versão do backend para reprodução e suporte.

**Prova de conceito:** executar o mesmo corpus no backend atual e em
QuickJS/WASM, comparando compatibilidade ECMAScript, startup, pico de memória,
tempo de cálculo, custo da fronteira e tamanho adicional do PWA.

**Critério de escolha:** QuickJS torna-se obrigatório apenas para uma classe de
extensão cujo threat model não seja atendido pelo backend atual e quando a
degradação em mobile for conhecida e aceitável. SES não é removido antes dessa
evidência.

### 3. Geração procedural: operadores próprios inspirados em gramáticas de forma

**Direção:** ampliar o modelo atual de procedimentos e planos com operações
geométricas semanticamente pequenas e combináveis. A ordem recomendada é:

1. shapes 2D, polylines, curvas e frames locais;
2. identidade estável de faces, arestas e vértices;
3. perfil e extrusão;
4. `split`, `repeat`, seleção de componentes e escopo orientado;
5. regras nomeadas, parâmetros e condicionais;
6. consultas espaciais com orçamento explícito;
7. avaliação preguiçosa, cache e regeneração incremental.

Uma regra procedural deve poder gerar um plano, ser inspecionada antes do
commit, referenciar resultados por identidade estável e declarar uma semente
aleatória quando não for puramente determinística.

**Prova de conceito:** uma fachada ou pequeno quarteirão gerado por regras,
editável por parâmetros e salvo como receita compacta sem perder a possibilidade
de materialização.

**Critério de escolha:** só criar uma gramática textual nova quando os
operadores tiverem semântica e testes independentes. A linguagem JavaScript pode
orquestrá-los primeiro; sintaxe especializada é uma superfície posterior.

### 4. Desempenho: medir o custo das abstrações por fronteira

A crítica sobre overhead é pertinente e deve produzir instrumentação, não a
remoção preventiva dos contratos. Além dos benchmarks existentes, medir:

- preview versus commit;
- validação, simulação e publicação de plano separadamente;
- `structuredClone` e transferência Worker–host por tamanho de entrada;
- expansão de receita procedural e materialização incremental;
- bytes e memória por operação colaborativa;
- custo de merge, compactação e reconstrução;
- startup frio/quente de cada backend de script.

Toda decisão tecnológica desta avaliação depende de baseline reproduzível no
Android de referência e em desktop. A duração total de `runtime test all` não é
benchmark de arquitetura.

## Relação com o posicionamento do produto

A análise sugere um foco B2B em visualização técnica, educação, CAD distribuído
e AEC. Isso é uma hipótese comercial plausível, não uma decisão arquitetural.
O núcleo deve continuar geral, enquanto demonstrações verticais validam onde o
valor é maior.

O caminho com menor risco é vender capacidades construídas sobre contratos
abertos — implantação privada, colaboração gerenciada, bibliotecas procedurais,
integrações, suporte e aplicações verticais — sem fechar o formato, a linguagem
ou o runtime local antes de conquistar interoperabilidade e adoção.

## Relatório sucinto: escolhas tecnológicas e custo de implementação

As estimativas abaixo representam **dias de trabalho focado no workflow atual**,
incluindo código, testes, documentação e validação manual. Não são prazos de
calendário. “Produção” inclui migração, diagnóstico, limites e casos de falha;
uma demonstração isolada custa menos, mas não encerra a decisão.

| Proposta | Escolha recomendada agora | Prova de conceito | Caminho até produção | Dependências e principal custo | Decisão |
| --- | --- | ---: | ---: | --- | --- |
| Modelo de conflitos geométricos | envelope próprio antes da biblioteca | 3–5 dias | 2–4 semanas para operações atuais | semântica por comando, causalidade, hashes e testes de convergência | iniciar especificação antes de colaboração |
| Yjs | candidato JavaScript para réplica experimental | 4–7 dias | 3–6 semanas, se escolhido | adaptar tipos compartilhados sem vazar Yjs no domínio/formato; medir memória e compactação | comparar, não adotar por decreto |
| Automerge | candidato local-first alternativo | 5–8 dias | 3–7 semanas, se escolhido | WASM/bundle, documentos, armazenamento, compactação e ponte com comandos | comparar no mesmo corpus |
| Rede colaborativa | transporte inicialmente cliente–servidor simples; P2P opcional | 4–7 dias | 4–8 semanas | identidade, autenticação, autorização regional, reconexão e observabilidade | posterior ao modelo de conflitos |
| Worker + SES | manter para scripts locais planejadores | já implementado; 2–4 dias de hardening e benchmark | 1–2 semanas para threat model, CSP e testes negativos adicionais | segurança da fronteira e atualização da dependência | vigente |
| QuickJS/WASM | segundo backend experimental para plugins não confiáveis | 5–10 dias | 3–6 semanas | adapter, limites, depuração, compatibilidade, tamanho do PWA e benchmark mobile | condicional ao threat model |
| Operadores inspirados em CGA | implementar primitivas próprias sobre planos | 5–10 dias após curvas/mesh básica | 4–8 semanas para núcleo útil de regras | topologia estável, extrusão, escopos, cache e serialização de receitas | direção aceita, engine completa adiada |
| Linguagem CGA completa ou compatível | não implementar agora | 1–2 semanas apenas para estudo de sintaxe/semântica | 2–4 meses ou mais | parser, runtime, compatibilidade, tooling, depuração e documentação | rejeitada no horizonte próximo |
| Benchmarks das novas fronteiras | ampliar a infraestrutura existente | 2–4 dias | contínuo | cenários fixos, armazenamento histórico e dispositivos de referência | requisito de todas as provas |

### Ordem econômica recomendada

1. concluir tempo/animação, geometria 2D e identidade topológica já previstas;
2. escrever o envelope de operações e a matriz de conflitos sem dependência;
3. criar benchmark comparável para backends de scripts;
4. testar QuickJS somente contra um threat model concreto de plugin;
5. testar Yjs e Automerge com o mesmo corpus geométrico;
6. introduzir `split`, extrusão e escopos antes de desenhar uma gramática nova;
7. escolher dependências apenas após resultados publicados no repositório.

O custo mínimo para obter evidência útil sobre as três propostas é de cerca de
**15–28 dias focados**, distribuídos depois das dependências geométricas e de
segurança. Transformar simultaneamente as três provas em infraestrutura de
produção exigiria aproximadamente **10–20 semanas focadas** e aumentaria demais
o risco de integração. A adoção deve, portanto, ser incremental e orientada por
gates, não um único sprint de reescrita.

## Fontes primárias para as decisões

- [Yjs: shared types, suporte offline e independência de rede](https://yjs.dev/)
- [Automerge: CRDT, merge automático e arquitetura local-first](https://automerge.org/docs/hello/)
- [Figma: migração do Realms shim para QuickJS/WASM e seus trade-offs](https://www.figma.com/blog/an-update-on-plugin-security/)
- [QuickJS: características e documentação do interpretador](https://bellard.org/quickjs/)
- [Endo: Hardened JavaScript, SES e object capabilities](https://endojs.org/)
- [Müller et al.: Procedural Modeling of Buildings](https://doi.org/10.1145/1179352.1141931)
- [Esri: conceitos de shapes, scopes e pivôs em CGA](https://doc.arcgis.com/en/cityengine/latest/help/help-cga-essential-concepts.htm)
