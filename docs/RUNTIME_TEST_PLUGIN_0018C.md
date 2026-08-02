# Runtime Test Plugin e perfil diagnóstico

O plugin valida as fronteiras do SpatialSeed sem integrar o runtime de
produção. Abra:

```text
/apps/web/?application=diagnostics
```

## Comandos

```text
runtime test help
runtime test viewer
runtime test editor
runtime test clock
runtime test simulation
runtime test property-contract
runtime test all
```

## Cobertura

- estado local do viewer;
- preview editorial sem publicação;
- commit editorial único;
- cancelamento de operação;
- relógio de passo fixo;
- limite de catch-up;
- aceitação por versão;
- rejeição de conflito;
- evolução autônoma do simulador.
- contrato atômico de propriedades, aparência, textura e instância.
- perfis web, rejeição de diagnóstico em produção e rollback de extensões.

O núcleo de testes registra `runtime.test.*` somente pelo registro de comandos.
A composição diagnóstica privilegiada cria também `TestService`, benchmarks e
auditoria de recursos a partir de capabilities explícitas do runtime candidato.
Ela não recebe DOM e não é uma API para extensões de usuário.

Os adapters testados — build, arquivos, armazenamento de procedimentos e PWA —
vêm da API pública `packages/platform-web`; o plugin não importa `apps/web`.
