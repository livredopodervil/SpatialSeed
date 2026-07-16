# Workflow verificável do SpatialSeed

> Documento vivo. Auditado em 16 de julho de 2026. Este é o processo canônico
> para colaboração local, patches, testes, autoria e integração.

## Objetivos

O workflow deve simultaneamente:

- preservar a autoria e a propriedade intelectual de Rogério Duarte;
- permitir aprendizado, revisão e execução no Android/Termux;
- manter cada alteração pequena e reversível;
- evitar edição manual extensa no celular;
- impedir que estado presumido substitua evidência do repositório;
- produzir código testado antes de chegar ao `main`;
- registrar assistência técnica sem transferir autoria ao assistente.

## Ambiente autoritativo

```text
Repositório local: ~/SpatialSeed-monorepo
Aplicação local:   http://127.0.0.1:8082/apps/web/
Repositório remoto: https://github.com/livredopodervil/SpatialSeed
Aplicação pública:  https://livredopodervil.github.io/SpatialSeed/apps/web/
```

Cópias em armazenamento compartilhado podem existir para teste ou acesso do
navegador, mas não substituem o repositório Git. Antes de qualquer mudança,
confirme o diretório com `pwd`.

## Regra zero: observar antes de alterar

```bash
cd ~/SpatialSeed-monorepo
pwd
git branch --show-current
git status --short
git log -1 --oneline --decorate
git remote -v
```

Não produza patch sobre um branch, hash ou build presumido. A etiqueta visual de
build deve ser confirmada em `apps/web/build-info.json` e na aplicação
carregada.

Em auditorias grandes, grave a saída num arquivo para evitar busca manual no
terminal:

```bash
git status --short > /tmp/spatialseed-audit.txt
git log --graph --oneline --decorate -40 >> /tmp/spatialseed-audit.txt
git diff --stat >> /tmp/spatialseed-audit.txt
```

## Uma tarefa por vez

Uma etapa normal deve ter:

1. objetivo observável;
2. arquivos em escopo;
3. decisão arquitetural relevante;
4. implementação mínima;
5. testes automáticos;
6. teste visual ou operacional;
7. commit único ou pequena sequência coerente;
8. ponto claro de interrupção para revisão.

Não agrupe correções independentes apenas porque foram descobertas na mesma
sessão.

## Branches

Crie branches a partir do `main` publicado e atualizado:

```bash
git switch main
git pull --ff-only origin main
git switch -c feature/NNNN-descricao-curta
```

Branches de feature são linhas temporárias de desenvolvimento. O histórico
durável é `main` mais tags de marcos realmente validados. Não há problema em
manter branches antigas como registro, mas elas não são fontes concorrentes de
estado atual.

## Formas de entrega de patch

Existem duas formas válidas. Escolha uma e não misture suas responsabilidades.

### 1. Patch de commit com `git format-patch` / `git am`

Use quando a entrega já possui commit, mensagem, autor e trailer revisados.

Aplicação:

```bash
cd ~/SpatialSeed-monorepo
git switch feature/NNNN-descricao-curta
git status --short
git am ~/storage/downloads/0001-descricao.patch
```

Se `git am` falhar:

```bash
git status
git am --show-current-patch=diff
```

Não use `git am --abort` ou outra operação de descarte sem confirmar que não há
trabalho próprio no estado da aplicação. Resolva o conflito conscientemente ou
interrompa e peça um patch corrigido.

### 2. Patch de conteúdo com `git apply`

Use quando o usuário deve criar o commit localmente, como em documentação ou
ajuste pequeno.

```bash
git apply --check ~/storage/downloads/alteracao.patch
git apply ~/storage/downloads/alteracao.patch
git diff --check
git diff
```

Depois o usuário escolhe o conteúdo exato do commit com `git add`.

### Hashes

Um patch de e-mail transporta conteúdo e metadados de autoria, mas o commit
criado por `git am` pode ter hash diferente de um commit temporário usado para
gerá-lo, porque committer, data ou parentesco fazem parte do hash. O hash
canônico é o que foi revisado e publicado no repositório do projeto.

## Autoria

Configuração local esperada:

```bash
git config user.name "Rogerio Duarte"
git config user.email "rd@rogerioduarte.org"
```

Confirme antes do commit:

```bash
git config user.name
git config user.email
```

Mensagens podem registrar assistência num trailer separado:

```text
Assisted-by: OpenAI Codex
```

Exemplo:

```bash
git commit \
  -m "feat(area): describe the change" \
  -m "Assisted-by: OpenAI Codex"
```

O assistente não deve fazer push autônomo. Por padrão ele entrega patch,
explicação, testes e comandos; Rogério aplica, valida, cria ou aceita o commit e
publica.

## Regras de implementação

1. Alterações permanecem dentro do repositório.
2. Arquivos do usuário e mudanças não relacionadas são preservados.
3. `apply_patch` ou patches Git substituem edições textuais frágeis.
4. UI, console e automação reutilizam comandos públicos.
5. Renderer não recebe responsabilidade de domínio.
6. Preview e commit continuam separados.
7. Novas propriedades e geometrias entram pelos registros correspondentes.
8. Um valor hard-coded não duplica manifesto ou query autoritativa.
9. Código de programa não recebe novas capabilities sem decisão e teste.
10. Otimização precisa de linha de base comparável.

## Validação antes do commit

### Validação estática

```bash
git diff --check
git status --short
```

Quando arquivos estáticos da PWA mudarem:

```bash
python3 tools/generate_pwa_precache.py
python3 tools/generate_pwa_precache.py --check
```

### Inicialização local

```bash
python tools/no_cache_server.py
```

Abra `http://127.0.0.1:8082/apps/web/` e confirme o build no rodapé.

### Teste automático

No console:

```text
runtime test all
```

Execute também a suíte diretamente afetada, por exemplo:

```text
runtime test property-contract
runtime test geometry-creation
runtime test spatial-plan-commit
runtime test procedure-catalog
runtime test file-interop
```

Não transforme a duração total de `runtime test all` em benchmark de
desempenho: ela varia com dispositivo, aquecimento e composição das suítes.

### Teste visual

Escolha o roteiro conforme o risco. Mudanças editoriais devem verificar, quando
aplicável:

- inicialização sem painel fatal;
- seleção única, múltipla e por área;
- gizmo mundial/local e políticas de pivô;
- mover, girar, escalar, snapping e cancelamento;
- duplicar, repetir, agrupar, desagrupar e excluir;
- undo/redo;
- Inspector em seleção única e múltipla;
- cor, textura e cor por instância;
- criar cada família geométrica;
- salvar, abrir e novo projeto;
- fechar/reabrir PWA e conferir cache;
- console, planos e procedimentos.

Um teste automático verde não invalida uma regressão visual observada.

### Desempenho

Quando a mudança pode alterar custo:

```text
benchmark scene 1000 10 100
benchmark history
benchmark compare
runtime resources
```

Registre build, commit, aparelho, navegador, contagem, amostras e condições. Não
compare apenas números sem o mesmo cenário.

## Commit

Antes de confirmar:

```bash
git diff --check
git diff --stat
git diff
```

Depois de selecionar arquivos:

```bash
git add caminho/do/arquivo
git diff --cached --check
git diff --cached --stat
git diff --cached
```

Mensagens seguem, preferencialmente:

```text
feat(área): capacidade nova
fix(área): correção observável
refactor(área): estrutura sem mudança de comportamento
test(área): cobertura
docs(área): documentação
chore(área): manutenção operacional
```

## Push do branch

```bash
git push origin feature/NNNN-descricao-curta
git ls-remote --heads origin feature/NNNN-descricao-curta
```

Confira o que ainda não está no `main`:

```bash
git fetch origin
git log --oneline origin/main..feature/NNNN-descricao-curta
```

## Integração ao main

Depois dos testes:

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

O merge do `main` possui hash próprio. O branch continua apontando para seu
último commit; isso é esperado.

## Documentação

Uma feature não está concluída se muda comportamento público sem atualizar:

- README, quando muda a experiência de entrada;
- `DECISIONS.md`, quando muda fronteira durável;
- `ROADMAP.md`, quando conclui ou reordena marco;
- documento técnico da feature;
- ajuda do console gerada pelo runtime;
- testes e exemplos correspondentes;
- manifesto PWA, quando arquivos estáticos mudam.

Não replique contagens de testes ou builds em documentos vivos. Consulte a
fonte executável.

## Reversão

Prefira operações recuperáveis e auditáveis:

- corrigir com novo commit;
- `git revert` para desfazer commit publicado;
- branch de correção a partir do último `main` conhecido;
- restauração explícita de backup somente quando necessário.

Não use `git reset --hard`, `git checkout -- arquivo` ou exclusão recursiva como
atalho sem resolver exatamente o que será perdido.

## Critério de conclusão

Uma etapa termina quando:

- o comportamento solicitado funciona;
- testes automáticos e visuais relevantes passaram;
- não há regressão conhecida escondida;
- desempenho foi medido quando havia risco;
- documentação e ajuda estão coerentes;
- autoria e trailer estão corretos;
- branch foi publicado e, quando autorizado, integrado ao `main`;
- o próximo ponto de retomada está explícito.
