# 0052c — occurrence compatibility, mesh entry and PWA handoff

Build: `20260807-0052c`

## Correções

### Delete em ocorrências do InstanceGraph

`SelectionOperations` recebe o `CoordinatedSandbox`, não o `Sandbox` base. O
0052b adicionou `getObjectDescendantIds()` ao Sandbox mas não ao wrapper de
coordenação. O resultado era a exceção:

```text
this.sandbox.getObjectDescendantIds is not a function
```

O wrapper agora encaminha a API de leitura/localidade do Sandbox, incluindo
ocorrências, matrizes mundiais e hierarquia. `deleteIds()` também possui
fallback defensivo e não depende mais da forma concreta do wrapper.

### Edição de malha de cópias estruturais

`MeshEditController.enter()` não procura mais o alvo exclusivamente em
`state.objects`. Primeiro resolve o objeto pela identidade de ocorrência do
Sandbox. A matriz mundial também é obtida pelo resolvedor de ocorrência, de
modo que um filho projetado de um assembly pode entrar em edição sem ser
materializado no documento.

O commit de geometria continua passando por `object.geometry.replace`; o
InstanceGraph aplica copy-on-write somente à ocorrência divergente.

### Primeiro arrasto do gizmo em edição de malha

A entrada em edição agora sincroniza explicitamente:

1. nível `vertex` do `EditContext`;
2. ferramenta `translate`;
3. seleção de componentes do renderer depois de a ferramenta estar ativa.

Isso elimina a dependência acidental de uma troca manual de ferramenta para o
primeiro arrasto operar sobre a seleção.

### Atualização PWA

O HTML volta a conter as ações `Atualizar agora` e `Reparar atualização`.

A inicialização agora impede um runtime misto: quando o HTML publicado é de um
build novo, mas a página ainda é controlada por um service worker antigo, o
SpatialSeed não carrega `main.js`. O usuário recebe a ação de atualização e o
runtime só é iniciado quando não existe conflito de build.

O registro do service worker usa `updateViaCache: "none"`. A atualização
explícita aguarda o worker que corresponde ao build publicado, envia
`SKIP_WAITING`, aguarda `controllerchange` para o mesmo build e então recarrega.
Verificações adicionais ocorrem em `focus`, `online` e ao voltar à aba, com
limite de frequência.

## HTTPS

O servidor de desenvolvimento padrão é HTTPS. Use:

```text
https://127.0.0.1:8082/apps/web/
```

A página externa de reparo é:

```text
https://127.0.0.1:8082/apps/reset-spatialseed-cache.html?return=./web/
```

Não usar `http://` para validar instalação/atualização PWA.
