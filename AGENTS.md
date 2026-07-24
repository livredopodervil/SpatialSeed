# Colaboração assistida no SpatialSeed

Este arquivo é a entrada operacional para assistentes de código e LLMs. Ele
complementa, sem substituir:

- [`PROJECT_SEED.md`](PROJECT_SEED.md), a semente curta de continuidade;
- [`docs/project/CHATGPT_PROJECT_INSTRUCTIONS.md`](docs/project/CHATGPT_PROJECT_INSTRUCTIONS.md),
  o contrato detalhado de colaboração;
- [`docs/project/WORKFLOW.md`](docs/project/WORKFLOW.md), o fluxo canônico de
  branches, patches, testes e integração;
- [`docs/project/DECISIONS.md`](docs/project/DECISIONS.md), as decisões
  arquiteturais vigentes.

## Antes de agir

1. Confirme `pwd`, branch, `HEAD`, status e remoto; não use estado lembrado.
2. Leia `apps/web/build-info.json` e os arquivos realmente envolvidos.
3. Preserve alterações do usuário e não toque em arquivos fora do escopo.
4. Diferencie código implementado, comportamento testado, decisão, requisito,
   opção e horizonte.
5. Não altere código antes de localizar o comando, registro, serviço ou contrato
   que já implementa a operação.

## Invariantes

- Three.js, DOM, painéis e gizmos são projeções ou superfícies, não autoridade.
- Toda mutação persistente passa por comando público.
- Interface, Inspector, console, procedimentos, experimentos e futuras
  automações reutilizam os mesmos serviços de domínio.
- Preview, animação efêmera, seleção, câmera e estado de painel não entram no
  documento nem no histórico editorial.
- Operações em lote são completamente resolvidas, avaliadas e validadas antes
  da primeira mutação.
- Grupos mantêm transformações locais; expandir um grupo em alvos renderizáveis
  precisa ser uma escolha explícita.
- Programas e experimentos recebem capabilities mínimas, produzem planos
  revisáveis e não acessam DOM, renderer ou sandbox.
- Recursos equivalentes permanecem compartilhados enquanto a semântica permitir.

## Forma de entrega

- Trabalhe em branch criado a partir do `main` confirmado.
- Prefira incremento pequeno, testável, reversível e documentado.
- No ambiente principal Android/Termux, forneça comandos completos e evite
  edição manual extensa.
- Para patches canônicos, use `git format-patch` e aplicação por `git am`;
  informe hash da base, SHA-256 do arquivo e hash esperado do commit quando
  estes forem reproduzíveis.
- Autoria principal:
  `Rogerio Duarte <rd@rogerioduarte.org>`.
- Registre assistência, quando aplicável, com:
  `Assisted-by: OpenAI Codex`.
- Não faça push, merge, rebase ou publicação remota sem autorização explícita.

## Validação

Execute validação proporcional ao risco:

```bash
git diff --check
python3 tools/generate_pwa_precache.py --check
```

No aplicativo, consulte primeiro `runtime test help`, execute a suíte afetada e
depois:

```text
runtime test all
```

Mudanças visuais exigem roteiro visual. Mudanças de desempenho exigem benchmark
comparável com build, dispositivo, navegador, cenário e amostras registrados.
Uma regressão observada pelo usuário continua sendo regressão mesmo com a suíte
automática verde.

## Documentação

Ao concluir uma capacidade pública, revise README, documento técnico da
feature, decisões, roadmap, ajuda do runtime e testes. Não copie para documentos
vivos contagens, listas ou hashes que devem ser consultados em Git, no manifesto
de build ou no próprio runtime. Snapshots históricos marcados como obsoletos
permanecem preservados.
