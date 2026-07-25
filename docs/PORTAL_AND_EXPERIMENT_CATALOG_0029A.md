# Portal e catálogo de experimentos — 0029a

## Objetivo

O marco 0029a substitui o antigo editor da raiz por uma entrada inequívoca para
o projeto e cria um inventário verificável das superfícies experimentais. Ele
não altera o domínio editorial, o runtime, a seleção, a câmera nem o formato de
projeto.

## Superfícies

| Caminho | Papel | Autoridade |
| --- | --- | --- |
| `/` | portal, introdução e manual breve | nenhuma mutação editorial |
| `/apps/web/` | viewer/editor e PWA mantidos | comandos e serviços atuais |
| `/apps/web/experiments/` | catálogo público | lê o manifesto; não executa planos |
| `/apps/experiments/` | protótipos independentes | histórica e local a cada HTML |

Todos os links internos usam caminhos relativos. Assim, as mesmas páginas
funcionam em `http://127.0.0.1:8082/` e sob o prefixo
`/SpatialSeed/` do GitHub Pages.

## Portal

`index.html`, `portal.css` e `portal.js` formam uma superfície estática, sem
framework e sem etapa de build. O JavaScript possui uma única responsabilidade:
ler `apps/web/build-info.json` e exibir o build efetivamente publicado. Falha
nessa consulta não impede a navegação.

O portal aponta para:

- aplicativo mantido;
- catálogo de experimentos;
- livro e manual;
- README, arquitetura, decisões e repositório.

Ele não registra service worker, não importa módulos do editor e não mantém
estado de cena.

## Preservação do protótipo anterior

O HTML que ocupava a raiz foi movido semanticamente para
`apps/experiments/root-region-prototype/index.html`. Ele continua usando os
arquivos históricos `main.js`, `style.css` e dependências vendorizadas da raiz.
Sua presença no catálogo permite comparação sem apresentá-lo como cliente
atual.

## Manifesto do catálogo

`apps/web/experiments/catalog.json` é a fonte canônica para o inventário
público. Cada entrada contém:

| Campo | Significado |
| --- | --- |
| `id` | identificador estável em kebab-case |
| `title` e `summary` | apresentação humana |
| `kind` | `integrated` ou `standalone` |
| `status` | `maintained`, `historical` ou `diagnostic` |
| `path` | destino local relativo ao manifesto |
| `offline` | `app-cache`, `local-assets` ou `network-required` |
| `externalDependencies` | URLs externas observáveis no HTML |
| `knownIssues` | limites que não devem ser ocultados pela interface |

O laboratório declarativo é catalogado como integrado e mantido. Os HTMLs
independentes são históricos ou diagnósticos; catalogá-los não concede acesso
ao runtime nem promove suas implementações ao núcleo.

## Cache e execução offline

O catálogo, seu manifesto, CSS e JavaScript ficam sob `apps/web/` e entram no
precache do PWA. Os destinos sob `apps/experiments/` permanecem fora do escopo
do service worker. Os sete protótipos algébricos ainda dependem de Math.js por
CDN e são marcados como `network-required`.

O 0029a torna essa dívida explícita; o 0029b deve vendorizar a dependência e
fazer a auditoria offline estrita passar.

## Auditoria estática

`tools/audit_web_entrypoints.py` usa apenas a biblioteca padrão do Python e não
acessa a rede. A execução normal verifica:

- HTML do portal e do catálogo;
- existência de links, scripts, estilos, imagens, import maps e `fetch`
  literais;
- ausência de caminhos dependentes da raiz do domínio;
- schema, identificadores e enumerações do catálogo;
- unicidade de identificadores e destinos;
- correspondência completa entre `apps/experiments/**/*.html` e entradas
  `standalone`;
- correspondência exata entre dependências externas observadas e declaradas.

Comando normal:

```bash
python3 tools/audit_web_entrypoints.py
```

Comando que funciona como gate do 0029b:

```bash
python3 tools/audit_web_entrypoints.py --strict-offline
```

O segundo comando falha intencionalmente enquanto houver uma URL externa
declarada.

## Validação do marco

Validação local:

```bash
python3 tools/audit_web_entrypoints.py
python3 tools/generate_pwa_precache.py --check
node --check portal.js
node --check apps/web/experiments/catalog.js
python3 -m py_compile tools/audit_web_entrypoints.py
git diff --check
```

Roteiro visual:

1. abrir `/` em tela estreita e larga;
2. confirmar ausência do editor antigo na raiz;
3. confirmar links para editor, catálogo, livro e documentação;
4. verificar que o build exibido coincide com o rodapé do editor;
5. abrir `/apps/web/experiments/`;
6. alternar os quatro filtros;
7. abrir o laboratório integrado e ao menos um protótipo histórico;
8. confirmar que limitações e necessidade de rede aparecem antes de abrir o
   protótipo correspondente.

## Próxima fronteira

O 0029b pode alterar dependências e controles dos protótipos, mas não deve
copiar sete vezes seleção, recorte e salvamento. A camada comum deve nascer
independente dos HTMLs e permanecer distinta do domínio mantido até possuir
contratos e testes suficientes para promoção.
