# Checklist de release e publicação

> Política operacional P0. Auditada em 16 de julho de 2026. O processo atual é
> manual e verificável; ainda não existe pipeline CI no repositório.

## 1. Definição de release

Uma release é um commit identificável no `main`, acompanhado por manifesto de
build coerente, precache atualizado, testes proporcionais ao risco e verificação
da aplicação publicada. Push de branch de feature não é release.

Este checklist usa três estados:

- `[ ]` não verificado;
- `[x]` verificado com evidência;
- `[n/a]` não aplicável, com justificativa registrada.

Nenhum item crítico deve ser presumido pela memória da conversa.

## 2. Registro da release

Preencha antes de integrar:

```text
Marco/objetivo:
Branch de feature:
Commit de ponta:
Base main:
Build esperado:
Responsável:
Data/hora e fuso:
Aparelhos/navegadores:
Riscos principais:
```

## 3. Pré-condições de repositório

```bash
cd ~/SpatialSeed-monorepo
pwd
git branch --show-current
git status --short
git log -5 --oneline --decorate
git remote -v
```

- [ ] diretório é `~/SpatialSeed-monorepo`;
- [ ] branch é a feature pretendida;
- [ ] não há mudança não relacionada ou desconhecida;
- [ ] commits incluídos são exatamente os esperados;
- [ ] autor é `Rogerio Duarte <rd@rogerioduarte.org>`;
- [ ] assistência, quando aplicável, aparece como `Assisted-by: OpenAI Codex`;
- [ ] nenhum segredo, arquivo pessoal, vídeo, download ou build temporário foi
  adicionado.

Audite autores e trailers:

```bash
git log origin/main..HEAD \
  --format='%h | autor=%an <%ae> | integrador=%cn <%ce>%n%B%n---'
```

## 4. Revisão da mudança

```bash
git diff --check origin/main...HEAD
git diff --stat origin/main...HEAD
git diff --name-status origin/main...HEAD
git log --oneline origin/main..HEAD
```

- [ ] `git diff --check` não reporta whitespace inválido;
- [ ] todo arquivo alterado pertence ao objetivo;
- [ ] deleções e renomes são intencionais;
- [ ] comportamento público atualiza ajuda e documentação;
- [ ] nova capability possui validação, orçamento e teste negativo;
- [ ] UI/console/inspector reutilizam comandos públicos;
- [ ] renderer continua derivado do estado, sem regra editorial nova;
- [ ] arquivos de usuário e formatos anteriores continuam cobertos.

## 5. Manifesto de build e cache busting

### 5.1 Build público

`apps/web/build-info.json` é a fonte canônica para versão, build e canal
mostrados pela aplicação e usados para nomear o cache da PWA.

```bash
cat apps/web/build-info.json
```

- [ ] `version` representa a versão de produto;
- [ ] `build` é único para a publicação;
- [ ] `channel` descreve a linha publicada;
- [ ] não existe rótulo duplicado hard-coded no HTML.

### 5.2 Queries em imports

O repositório ainda usa `?build=...` em algumas arestas de import para invalidar
cache de módulos. Essas queries são tokens por dependência, não uma segunda
fonte global de versão.

```bash
rg -n '\?build=' apps packages
```

- [ ] arestas que importam módulos alterados foram revisadas;
- [ ] nenhuma substituição global apagou histórico útil ou alterou módulo não
  relacionado;
- [ ] Worker alterado tem URL de criação revisada;
- [ ] plugin de testes alterado tem sua cadeia de import revisada.

Essa revisão manual é uma dívida técnica. Uma futura estratégia de hashing ou
bundling pode removê-la, mas não deve ser simulada por rótulos inconsistentes.

## 6. Precache e GitHub Pages

Quando qualquer recurso estático em `apps/web/`, `packages/` ou `vendor/` for
criado, removido ou renomeado:

```bash
python3 tools/generate_pwa_precache.py
python3 tools/generate_pwa_precache.py --check
```

- [ ] `--check` informa manifesto atual;
- [ ] `apps/web/pwa/precache-manifest.json` contém os novos recursos;
- [ ] recursos removidos saíram do manifesto;
- [ ] `.nojekyll` existe na raiz;
- [ ] `apps/web/`, `packages/` e `vendor/` permanecem publicáveis;
- [ ] imports usam caminhos relativos válidos sob `/SpatialSeed/`;
- [ ] o service worker permanece em `apps/web/service-worker.js` com escopo
  `apps/web/`;
- [ ] o `service-worker.js` da raiz continua apenas ponte de migração, salvo
  decisão explícita em contrário.

## 7. Inicialização local limpa

```bash
python tools/no_cache_server.py
termux-open-url 'http://127.0.0.1:8082/apps/web/'
```

- [ ] aplicação inicia sem painel fatal;
- [ ] rodapé mostra o build esperado;
- [ ] console do navegador não mostra import 404/MIME/parse;
- [ ] `runtime test help` contém as suítes novas;
- [ ] fechar e reabrir não volta silenciosamente ao módulo anterior.

Se o build visual mudou, mas a suíte nova é “desconhecida”, trate como cadeia de
cache/import incoerente; não aceite o rótulo como prova.

## 8. Testes automáticos

No console:

```text
runtime test all
```

- [ ] `failed` é zero;
- [ ] a suíte diretamente afetada foi executada separadamente;
- [ ] quantidade de testes foi consultada, não copiada para documento vivo;
- [ ] resultado contém o build que realmente foi carregado como evidência
  visual separada;
- [ ] falhas foram corrigidas, não ocultadas por reload seletivo.

Execute também, quando aplicável:

```text
runtime test property-contract
runtime test scene-hierarchy
runtime test hierarchy-group-transform
runtime test geometry-creation
runtime test project-files
runtime test file-interop
runtime test pwa-status
runtime test program-session
runtime test procedure-catalog
runtime test spatial-plan-commit
```

A lista correta é a retornada por `runtime test help`.

## 9. Testes funcionais e visuais

### 9.1 Edição básica

- [ ] seleção única, múltipla, área e seleção interna de grupo;
- [ ] mover, girar e escalar com gizmo;
- [ ] espaço mundial/local e políticas de pivô;
- [ ] snapping e cancelamento de drag;
- [ ] duplicar, repetir, excluir, undo e redo;
- [ ] bounding box e gizmo permanecem coerentes ao navegar.

### 9.2 Hierarquia

- [ ] criar grupo e grupo aninhado;
- [ ] transformar grupo em cada modo;
- [ ] duplicar e excluir subárvore;
- [ ] desagrupar um nível sem drift mundial;
- [ ] salvar/abrir preserva parentesco e transforms;
- [ ] seleção de grupo não multiplica desnecessariamente o custo visual.

### 9.3 Geometria, aparência e instancing

- [ ] criar box, sphere, cylinder, plane e polygon;
- [ ] testar plane canônico, normal/tangente e três pontos;
- [ ] superfícies abertas mostram frente e verso;
- [ ] pivô/bounds permanecem estáveis;
- [ ] cor comum e `instance.color` funcionam em lote;
- [ ] mesma textura em famílias diferentes não trava;
- [ ] editar cor não regride transform UV;
- [ ] Inspector abre com seleção simples e múltipla.

### 9.4 Console e programas

- [ ] comandos separados por linha e `;`;
- [ ] `calc`, `program`, `session status/reset/cancel`;
- [ ] erro e timeout invalidam sessão sem alterar cena;
- [ ] `spatial.create` produz plano, não objeto imediato;
- [ ] `plan status`, `commit` e `discard`;
- [ ] plano obsoleto é rejeitado;
- [ ] catálogo define, executa, exporta, importa, mescla e substitui;
- [ ] editor de catálogo salva fonte sem executar.

## 10. Arquivos e compatibilidade

- [ ] projeto vazio faz save/open;
- [ ] projeto com cada geometria faz roundtrip;
- [ ] projeto com grupos aninhados faz roundtrip;
- [ ] projeto com textura e cor de instância faz roundtrip;
- [ ] arquivo legado schema 1 abre e salva como schema 2;
- [ ] arquivo schema 2 sem aparência em grupo abre;
- [ ] referência de aparência ausente é rejeitada de modo compreensível;
- [ ] `Novo` descarta handle de arquivo anterior;
- [ ] cancelamento de picker não altera cena;
- [ ] fallback de input/download funciona quando picker é bloqueado;
- [ ] catálogo JSON exportado reimporta sem executar código.

Registre tamanho dos arquivos com textura e grande número de objetos. Crescimento
inesperado não bloqueia automaticamente a release, mas deve entrar na agenda.

## 11. PWA: instalação, atualização e offline

Teste dois perfis distintos.

### 11.1 Instalação limpa

- [ ] origem é HTTPS ou localhost confiável;
- [ ] manifesto e ícones carregam;
- [ ] opção **Instalar** aparece no menu Projeto ou explica instalação manual;
- [ ] app abre em modo standalone;
- [ ] após uma carga online completa, abre com servidor/rede indisponível;
- [ ] salvar/abrir usa a via suportada no modo instalado.

### 11.2 Atualização de instalação existente

- [ ] instalação controlada pelo build anterior abre;
- [ ] nova publicação é detectada;
- [ ] rodapé distingue build publicado e controlador antigo;
- [ ] fechar todas as janelas e reabrir entrega o novo controlador;
- [ ] caches `spatialseed-static-*` antigos são removidos na ativação;
- [ ] cena não salva não é confundida com persistência automática.

Service workers podem manter a versão anterior enquanto páginas antigas estão
abertas. Isso é ciclo normal da plataforma, não justificativa para ocultar build
efetivo.

## 12. Matriz mínima de plataforma

| Plataforma | Obrigatório hoje | Verificações |
| --- | --- | --- |
| Android Chrome via HTTP local | sim | toque, console, arquivos, testes |
| Android PWA via GitHub Pages | sim | instalar, atualizar, offline, fallback |
| Chromium desktop | recomendado | mouse/teclado, picker nativo, WebGL |
| Firefox/Safari | exploratório | iniciar e registrar limitações; não prometer suporte não testado |

Registre modelo do aparelho, SO, navegador e versão. Uma única passagem não
estabelece compatibilidade universal.

## 13. Desempenho

Se a mudança toca estado, hierarquia, renderer, assets, arquivos, scripts ou
hot path:

```text
benchmark scene 1000 10 100
benchmark history
benchmark compare
runtime resources
```

- [ ] cenário e parâmetros são iguais à baseline;
- [ ] aparelho, navegador e estado térmico foram registrados;
- [ ] medição foi repetida após warm-up;
- [ ] regressão aparente foi repetida em sessão limpa;
- [ ] duração de `runtime test all` não foi usada como benchmark.

Siga [`PERFORMANCE_POLICY.md`](PERFORMANCE_POLICY.md).

## 14. Commit, push e integração

Antes do commit:

```bash
git diff --check
git diff --stat
git diff
git add caminho/exato
git diff --cached --check
git diff --cached --stat
git diff --cached
```

Commit:

```bash
git commit \
  -m "feat(area): describe the release change" \
  -m "Assisted-by: OpenAI Codex"
```

Push e verificação do branch:

```bash
git push origin feature/NNNN-descricao-curta
git ls-remote --heads origin feature/NNNN-descricao-curta
```

Integração autorizada:

```bash
git switch main
git pull --ff-only origin main
git merge --no-ff feature/NNNN-descricao-curta \
  -m "merge: integrate NNNN description" \
  -m "Assisted-by: OpenAI Codex"
git push origin main
```

Verifique:

```bash
git log --graph --oneline --decorate -15
git ls-remote --heads origin main feature/NNNN-descricao-curta
```

## 15. Verificação remota

Após o Pages publicar:

```text
https://livredopodervil.github.io/SpatialSeed/apps/web/
```

- [ ] commit remoto do `main` é o esperado;
- [ ] build público é o esperado;
- [ ] imports de `apps/web/`, `packages/` e `vendor/` retornam JavaScript, não
  página HTML de 404;
- [ ] `runtime test all` passa na origem pública;
- [ ] uma produção procedural simples e um commit de plano funcionam;
- [ ] salvar/abrir e catálogo funcionam;
- [ ] atualização/offline da PWA foram verificados.

## 16. Rollback

Se houver regressão crítica:

1. registre commit, build, plataforma e sintoma;
2. identifique o último commit validado;
3. prefira `git revert` ou commit corretivo; não reescreva `main` publicado;
4. gere novo build e precache coerentes;
5. publique e teste atualização de PWA existente;
6. acrescente o teste que teria detectado a falha.

Não use `git reset --hard` como procedimento de release.

## 17. Evidência mínima de conclusão

```text
Commit main:
Build:
runtime test all: passed/failed/total/duration (apenas correção)
Suítes direcionadas:
Teste visual:
Arquivo roundtrip:
PWA limpa:
PWA atualizada:
Offline:
Benchmark, se aplicável:
Problemas conhecidos aceitos:
```

## 18. Referências

- [W3C Service Workers](https://www.w3.org/TR/service-workers/)
- [WICG File System Access](https://wicg.github.io/file-system-access/)
- [NIST SP 800-218: Secure Software Development Framework](https://csrc.nist.gov/pubs/sp/800/218/final)
- [`project/WORKFLOW.md`](project/WORKFLOW.md)
- [`project/DISTRIBUTION.md`](project/DISTRIBUTION.md)
- [`SECURITY_MODEL.md`](SECURITY_MODEL.md)
