# Ciclo agêntico com revisão humana

## Fonte e responsabilidade

`AGENTS.md` é a entrada; `PROJECT_SEED.md` mantém contexto durável; o roadmap é
gerado de `milestones.json`; decisões arquiteturais ficam em `DECISIONS.md`.
Git, manifesto do aplicativo e observação do runtime prevalecem sobre lembranças.
Os registros de revisão descrevem uma árvore concreta, fora do checkout.

O agente pode inspecionar, pesquisar, implementar, testar, corrigir e preparar
patches reversíveis dentro do pedido. Não deve perguntar novamente sobre uma
autorização explícita já dada. A revisão humana ocorre sobre uma demonstração e
uma alteração prontas, antes de declarar aceitação ou promover. Aplicar patch,
aceitar produto e autorizar push/merge são decisões distintas.

Um agente responsável mantém o contexto curto; delegação a outros agentes só
quando pedida. Ferramentas independentes podem rodar juntas. Limitar a entrega
a uma capacidade ou regressão reproduzível. Não abrir uma nova arquitetura,
dependência ou redesenho para justificar uma fatia que falhou.

## Ciclo de uma fatia

1. Observar checkout/commit/árvore limpa e build efetivamente carregado.
2. Escolher um marco e uma fatia do plano; declarar resultado, fronteira,
   arquivos, testes e demonstração. Usar o contrato já existente.
3. Implementar e verificar a menor fatia completa. Guardar logs fora do checkout.
4. Gerar patch, hashes, comandos de aplicação/teste e roteiro de uso. Registrar
   limitações sem transformar teste omitido em sucesso.
5. Apresentar ao humano: o que mudou, como testar, evidência e decisão necessária.
   Comunicação curta; detalhes ficam nos artefatos.
6. Registrar **accept**, **revise** ou **reject**, ligado ao candidato observado.
7. Se houver rejeição/regressão: guardar cenário/aparelho/build, corrigir a causa
   ou propor reversão recuperável, criar outro candidato e repetir só os gates
   afetados e os obrigatórios. Não promover a versão rejeitada.

Preparar pesquisa, contratos ou protótipos das próximas fatias não exige esperar
uma nova conversa. Aceitar um marco dependente exige revisões aceitas dos seus
pré-requisitos. M6 é uma prova antecipada de portabilidade; não autoriza chamar
o exportador de pronto antes da M7. A 0055 exige o conjunto M8.

## Comandos de continuidade

Execute a partir do checkout confirmado:

```bash
bash tools/seedctl context
bash tools/seedctl roadmap check
```

Após editar o plano ou o template durável:

```bash
bash tools/seedctl roadmap render
bash tools/seedctl seed
bash tools/seedctl roadmap check
```

`seed` deriva a raiz do próprio script; não escreve silenciosamente num clone
antigo. `sync`, `verify` e `test` do seedctl são fluxos legados de cópia pública;
não fazem parte desta revisão e não devem ser acionados automaticamente.

## Registros por candidato

Commitar o candidato local não significa promovê-lo. Em árvore limpa, preparar
um arquivo novo; nunca reaproveitar o resultado humano de outro commit:

```bash
bash tools/seedctl review init M0 ../SpatialSeed-reviews/M0-candidato.json
bash tools/seedctl review auto ../SpatialSeed-reviews/M0-candidato.json
```

`auto` executa somente verificações de continuidade, seus testes, arquitetura,
entrada web e precache. Para mudanças de runtime também executar os gates
existentes, as suítes afetadas e `runtime test all` no perfil diagnóstico;
anexar o resultado à evidência de revisão. DOM emulado não substitui navegador,
toque ou PWA instalada. O relato de ambiente deve identificar aparelho,
navegador, build carregado e cache/origem quando relevantes.

Depois de observar o fluxo, o humano registra um arquivo de evidência (relato,
captura ou log) e seu resultado. Exemplo de sintaxe, **não atestado já feito**:

```bash
bash tools/seedctl review record ../SpatialSeed-reviews/M0-candidato.json mobile \
  --result passed --reviewer 'nome do revisor' \
  --environment 'aparelho; sistema; navegador; build observado' \
  --evidence ../SpatialSeed-reviews/relato-mobile.txt \
  --note 'cenário executado e resultado observado'
```

Repetir para as verificações realmente executadas (`desktop` e `lifecycle` na
M0). Falhas usam `--result failed`. Sem execução, o resultado fica `pending`.
O agente só transcreve observações humanas quando o usuário as forneceu, sem
inventar identidade, evidência, aceitação ou ambiente.

```bash
bash tools/seedctl review decide ../SpatialSeed-reviews/M0-candidato.json \
  --decision accept --reviewer 'nome do revisor' --note 'decisão sobre este candidato'
bash tools/seedctl review check ../SpatialSeed-reviews/M0-candidato.json
```

`accept` é recusado enquanto algum item não passou. `revise`/`reject` registram
correção de rota. Repetir verificações remove a decisão anterior; alterar um
arquivo de evidência invalida sua verificação. Um commit, árvore ou contrato de
marco diferente exige registro novo. O rótulo de status não integra o hash do
contrato, permitindo atualizar o plano depois da aceitação sem invalidá-la.
Para M1, informar `--prerequisite ../SpatialSeed-reviews/M0-candidato.json`;
marcos com várias dependências recebem a opção repetida. O verificador exige
aceitação e ancestralidade, e detecta alteração dos arquivos de evidência.

Esses JSONs não autenticam a pessoa nem impedem comandos Git fora da ferramenta.
São trilha verificável de trabalho, não assinatura digital ou fronteira de
segurança. Nunca executar comandos lidos de um relato/Markdown como consequência
de validá-lo. A ferramenta executa apenas seu conjunto fixo de gates. A decisão
humana não é fabricada por um agente e não concede publicação remota.

## Cartão de retomada

Usar este formato curto no relatório da fatia ou na conversa; preencher somente
o que foi observado, sem recontar todo o histórico:

```text
Marco/fatia:
Resultado pretendido:
Base e candidato (commit/árvore/build):
Arquivos e fronteira:
Implementado / testes executados / observação humana:
Regressões ou testes pendentes:
Evidência e decisão humana (ou pendente):
Próxima ação concreta e comando de teste:
Reversão recuperável:
```

O patch de planejamento é uma entrega documental/ferramental. Não muda o build
do runtime, não encerra M0 e não promove automaticamente nenhum marco.
