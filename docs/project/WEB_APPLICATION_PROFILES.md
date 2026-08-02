# Perfis de aplicação web e diagnóstico isolado

Status: implementado inicialmente no build `0047c`

## Objetivo

O runtime web de produção não depende de testes, benchmarks ou auditorias de
desenvolvimento. Essas capacidades continuam disponíveis numa composição
explícita, sem criar outro runtime e sem alterar comandos de domínio, HUD ou
documento.

Há duas definições versionadas:

- `application.default.json`: aplicação funcional, papel `production`, sem
  extensões de diagnóstico;
- `application.diagnostics.json`: mesma aplicação funcional acrescida da
  extensão confiável `spatialseed.diagnostics.runtime-tests`.

Este documento de boot é deliberadamente menor que a futura
`ApplicationDefinition` do módulo `interface`: ele escolhe somente o papel da
composição web e extensões nativas confiáveis. Não contém layout, ferramentas,
permissões de usuário nem ativação de módulos de domínio.

O perfil é escolhido antes da criação do runtime. A aplicação padrão usa
`/apps/web/`; o ambiente de validação usa:

```text
/apps/web/?application=diagnostics
```

## Fronteira

`packages/platform-web` é a API pública dos adapters de navegador. Ele possui:

- manifesto de build e configuração da UI;
- transporte de arquivos e persistência local de procedimentos;
- instalação e registro PWA;
- carregamento, validação e ativação atômica dos perfis web.

`apps/web` conhece apenas essa API pública e o contrato genérico de extensão.
Ele não importa `runtime-test-plugin`, `tests`, `benchmarks` nem
`resource-audit`. O plugin de diagnóstico também não importa `apps/web`; seus
testes de plataforma usam a API pública de `platform-web`.

Uma extensão web confiável publica:

```js
{
  manifest: {
    id: "spatialseed.diagnostics.runtime-tests",
    apiVersion: "spatial-seed-web-runtime-extension-v1",
    role: "diagnostics"
  },
  activate(host) {
    return { dispose() {} };
  }
}
```

ID, versão e papel devem coincidir com a definição JSON antes da ativação. A
entrada precisa ser relativa e permanecer na mesma origem. Um perfil de
produção rejeita extensões com papel `diagnostics`.

## Ativação e falha

O carregador importa e valida todos os descritores antes de entregar as
extensões ao composition root. A ativação ocorre sobre um runtime candidato
ainda não publicado. Se uma extensão falhar, as anteriores são descartadas em
ordem inversa e a inicialização é abortada. O objeto de lifecycle resultante
também possui `dispose` idempotente.

O host diagnóstico recebe somente as dependências enumeradas pela composição:
registro de comandos, reducer, serviço de projeto, sandbox, editor, renderer,
runtime de aparência e operações de seleção. Essa porta é privilegiada e
embutida; ela não é uma API para extensões de usuário. Extensões internas do
usuário continuarão restritas a manifestos, catálogos, schemas e programas no
worker SES.

## PWA

O precache de produção exclui os quatro pacotes de diagnóstico. Ao abrir o
perfil diagnóstico com rede, seus módulos são carregados sob demanda e podem
entrar no cache de execução normal do service worker. A aplicação funcional
offline não depende deles.

Worker e escopo são resolvidos por `platform-web` a partir da URL absoluta do
módulo de entrada. O registro recebe um `scopeUrl` absoluto da mesma origem; a
forma `scope` em pathname permanece apenas como descrição. Isso impede que um
caminho iniciado por `//apps/` seja reinterpretado pelo navegador como o host
`apps`.

## Verificação

Abra o perfil diagnóstico e execute:

```text
runtime test web-application-profile
runtime test all
benchmark compact 10000 1000 5
```

No repositório, execute:

```bash
python3 tools/audit_architecture.py
python3 tools/generate_pwa_precache.py --check
```

O auditor valida as duas definições reais, impede diagnóstico transitivamente
alcançável pelo boot de produção e mantém os pacotes diagnósticos fora da regra
de componentes funcionais órfãos.
