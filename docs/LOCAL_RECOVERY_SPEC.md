# Recuperação local do sandbox

> Contrato técnico implementado no marco `0029d` e corrigido no `0029d1`.

## Objetivo

Recuperar trabalho editorial após recarga, atualização da PWA ou encerramento
acidental sem confundir o armazenamento do navegador com o arquivo portátil
`.spatialseed`.

## Registro

Cada registro usa o formato `spatial-seed-recovery`, schema 1, e contém:

- identidade persistente do sandbox;
- documento de checkpoint limpo;
- versão-base regional;
- sequência vigente de comandos confirmados;
- revisão atual;
- indicador limpo/sujo;
- horário da última gravação.

O checkpoint contém o catálogo de assets necessário à sequência. O estado
intermediário de cada comando não é duplicado.

## Atomicidade

O `Sandbox` valida a sequência inteira sobre um clone do checkpoint. Somente
depois constrói o estado atual e a pilha de undo e substitui o estado interno
numa única operação observável. Um comando inválido ou que não reproduza uma
mudança rejeita a recuperação.

O `IndexedDbRecoveryStore` substitui o registro por uma transação `readwrite`.
As gravações comuns são postergadas por debounce; `pagehide` e a passagem do
documento para segundo plano solicitam uma descarga imediata.

## Identidade e ciclo de vida

`BrowserSandboxIdentity` conserva a identidade atual no armazenamento local.
Recarregar a mesma página usa essa identidade. Abrir um arquivo ou criar um
projeto vazio gera outra identidade e remove o registro anterior, pois essas
ações são substituições explícitas do documento.

O suporte a `?sandbox=<id>` e coordenação entre abas pertence ao `0029e`; não é
simulado por este marco. Até lá, duas abas sobre a mesma origem não devem editar
simultaneamente: ambas compartilham a identidade local e a última gravação pode
substituir a anterior.

## Experiência de restauração

Um checkpoint limpo reabre automaticamente. Um registro sujo bloqueia a
inicialização e apresenta:

- **Continuar:** reaplica os comandos e restaura o undo;
- **Exportar cópia:** produz um `.spatialseed` portátil sem aplicar o rascunho;
- **Descartar:** remove o rascunho e continua com o estado inicial.

Exportar não encerra a decisão: o usuário ainda escolhe continuar ou descartar.

## Exclusões deliberadas

Não entram no registro:

- seleção, hover, pivô visual e gizmos;
- câmera de navegação e câmera ativa local;
- posição e visibilidade de painéis;
- overlays e tempo de animação;
- previews não confirmados;
- handles do sistema de arquivos;
- catálogo de procedimentos, que possui armazenamento próprio.

Limpar os dados da origem pode remover a recuperação. Blobs grandes continuam
no documento do checkpoint no 0029d; migração para OPFS exige contrato de quota,
limpeza e compatibilidade posterior.

## Diagnóstico e testes

No console:

```text
recovery status
runtime test project-recovery
runtime test all
```

Roteiro manual:

1. crie ou transforme um objeto e aguarde brevemente;
2. recarregue a página;
3. confirme que o diálogo informa o rascunho;
4. exporte uma cópia e depois escolha **Continuar**;
5. confirme objeto e undo;
6. recarregue, descarte e confirme que o rascunho não retorna;
7. abra um arquivo e confirme que a identidade muda em `recovery status`;
8. mova somente a câmera, recarregue e confirme que isso não cria rascunho.

O teste de integração usa o `ProjectService` real para proteger conjuntamente
**Continuar**, **Exportar cópia** e a reabertura do arquivo exportado. Fakes do
serviço continuam reservados aos contratos isolados do controlador.
