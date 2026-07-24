# Distribuição, instalação e portabilidade

> Documento vivo. Revalidado em 24 de julho de 2026 até o marco `0028e`.

## Modelo atual

SpatialSeed é uma aplicação web estática composta por HTML, CSS, módulos ES,
JSON e dependências vendorizadas. O código-fonte publicado é o código executado:
não existe etapa obrigatória de bundle, transpilação ou `npm install`.

A aplicação mantida é:

```text
apps/web/
```

Os arquivos web da raiz pertencem à história anterior ao monorepo e não devem
ser tratados como cliente atual.

## Modalidades suportadas

| Modalidade | Estado | Uso principal | Limites |
| --- | --- | --- | --- |
| GitHub Pages | implementada | demonstração e acesso público | depende da publicação do `main` |
| PWA instalada | implementada | abertura offline após primeiro acesso | não salva a cena automaticamente |
| servidor local | implementada | desenvolvimento e teste | exige origem HTTP local |
| pasta portátil com servidor embutido | planejada | distribuição sem Python/Termux | ainda não empacotada |
| aplicativo nativo/híbrido | hipótese | integração profunda com arquivos e sistema | não é dependência do núcleo |

## GitHub Pages

URL pública:

```text
https://livredopodervil.github.io/SpatialSeed/apps/web/
```

O Pages deve publicar a raiz do branch `main`. O arquivo `.nojekyll` impede que
o processamento Jekyll exclua ou transforme caminhos necessários à aplicação.

Os seguintes diretórios precisam permanecer acessíveis com seus caminhos
relativos:

```text
apps/web/
packages/
vendor/
```

Um deploy que abre `index.html`, mas retorna 404, MIME incorreto ou HTML para um
import JavaScript, não é uma publicação funcional.

## PWA e cache offline

`apps/web/manifest.webmanifest` descreve nome, ícones, escopo e modo standalone.
`apps/web/service-worker.js` controla somente `apps/web/`, embora armazene
recursos necessários de `packages/` e `vendor/`.

O arquivo `service-worker.js` da raiz é uma ponte de migração para instalações
antigas que possuíam escopo amplo. Ele não deve voltar a manter um segundo cache.

Quando um módulo estático for criado, removido ou renomeado:

```bash
python3 tools/generate_pwa_precache.py
python3 tools/generate_pwa_precache.py --check
```

O build publicado vem de `apps/web/build-info.json`. O cliente compara esse
manifesto com o service worker que controla a página. Se forem diferentes, o
rodapé informa o cache antigo; fechar todas as abas e reabrir permite que o novo
worker assuma o controle.

### O que “offline” significa

Depois da primeira instalação bem-sucedida, o navegador pode carregar o
aplicativo sem rede. Isso não equivale a persistência da cena:

- recursos do programa ficam no cache do service worker;
- preferências e catálogo de procedimentos ficam em armazenamento local;
- o projeto espacial precisa ser salvo em arquivo;
- limpar dados do navegador pode remover cache, preferências e catálogos;
- recuperação automática da sessão ainda é planejada.

## Interoperabilidade de arquivos

`ProjectService` conhece o documento SpatialSeed, mas não conhece DOM, picker ou
download. `BrowserProjectFileGateway` transporta o documento.

### Via nativa

Quando a File System Access API está realmente disponível:

- **Abrir** usa o seletor do sistema;
- **Salvar** pode escrever novamente no mesmo handle;
- **Novo** descarta o handle anterior;
- cancelar não muda a cena.

### Fallback

Chrome Android e PWAs instaladas podem expor a API e ainda bloquear sua chamada
com `NotAllowedError`. Nesse caso a aplicação desativa a via nativa durante a
sessão, explica a limitação e usa:

- `input type=file` para abrir;
- download para salvar;
- extensão `.spatialseed` com conteúdo JSON UTF-8.

O fallback é comportamento suportado, não erro de inicialização.

## Catálogos de procedimentos

Catálogos são documentos separados da cena. O menu **Projeto** exporta e
importa JSON versionado e legível. A importação valida e armazena fonte, mas não
executa procedimentos.

Essa separação permite:

- versionar bibliotecas no Git;
- editar em outros editores;
- compartilhar funções sem compartilhar uma cena;
- substituir ou mesclar catálogos de forma atômica.

## Execução local

### Termux, caminho canônico do projeto

```bash
cd ~/SpatialSeed-monorepo
python tools/no_cache_server.py
```

Abra:

```bash
termux-open-url 'http://127.0.0.1:8082/apps/web/'
```

O script sem cache pressupõe exatamente `~/SpatialSeed-monorepo` e serve apenas
`127.0.0.1:8082`.

### Ambiente genérico

Na raiz do repositório:

```bash
python3 -m http.server 8082 --bind 127.0.0.1
```

Então abra `http://127.0.0.1:8082/apps/web/`.

## Por que ainda há um servidor HTTP

Mesmo offline, o navegador executa o aplicativo dentro de uma origem HTTP.
Módulos ES, import maps, `fetch`, service workers, texturas e políticas de origem
não têm comportamento confiável quando o projeto é aberto diretamente por
`file://`.

Service workers exigem HTTPS, com exceção de origens locais seguras como
`127.0.0.1` e `localhost`.

## Verificação de uma distribuição

### Local

```bash
cd ~/SpatialSeed-monorepo
git status --short
python3 tools/generate_pwa_precache.py --check
python tools/no_cache_server.py
```

No console da aplicação:

```text
runtime test pwa-status
runtime test file-interop
runtime test project-files
runtime test all
```

### Pública

Verifique:

1. `apps/web/` inicia sem erro fatal;
2. o build exibido corresponde à publicação esperada;
3. não há 404 ou MIME incorreto para módulos;
4. instalação PWA é oferecida ou explicada;
5. fechar, abrir offline e navegar continua funcionando;
6. salvar e abrir funcionam pela via disponível no navegador;
7. um projeto com grupos, geometrias e texturas faz roundtrip;
8. catálogos podem ser exportados e reimportados;
9. Android e desktop executam `runtime test all`.

## Atualização e rollback

Uma publicação deve ser identificável por commit e pelo manifesto de build. Em
caso de regressão:

1. não altere o histórico local de forma destrutiva;
2. identifique o último commit validado;
3. reverta a mudança por novo commit ou publique o branch estável;
4. atualize o manifesto de precache quando os recursos mudarem;
5. confirme qual worker controla a página;
6. registre a causa e o teste que faltava.

## Distribuições futuras

Um servidor embutido, wrapper nativo ou pacote híbrido pode melhorar acesso a
arquivos e instalação. Essas formas devem permanecer lançadores: não podem
introduzir uma segunda semântica editorial nem tornar o núcleo dependente de
Node, Go, Python ou APIs proprietárias.

## Referências

- [`../PWA_FOUNDATION_0025A.md`](../PWA_FOUNDATION_0025A.md)
- [`../FILE_INTEROP_0025B.md`](../FILE_INTEROP_0025B.md)
- [`../../apps/web/manifest.webmanifest`](../../apps/web/manifest.webmanifest)
- [`../../apps/web/build-info.json`](../../apps/web/build-info.json)
