# SpatialSeed - semente de continuidade

## Projeto

Ambiente espacial, procedural e orientado a comandos para Android, Termux e
navegador. A aplicação mantida está em `apps/web/`.

Nunca presuma o checkout ativo. Confirme `pwd`, branch, HEAD, status, remoto e
`apps/web/build-info.json` antes de fornecer comandos dependentes do estado.

## Fontes de verdade

1. código e testes do checkout;
2. manifesto de build e status PWA exibido;
3. `help`, `runtime test help` e registros consultáveis;
4. `README.md`, Manual e Referência Técnica;
5. decisões e roadmap;
6. documentos de marco;
7. memória de conversa, apenas como pista.

## Estado funcional

O snapshot documental vivo de 17 de agosto de 2026 corresponde ao build
`20260817-0054mn1`. Toda promoção posterior deve atualizar manifesto, tokens de
cache, auditorias sucessoras e estado PWA como uma única alteração.

Capacidades presentes:

- edição, seleção, transformação, pivô, snap, grupos e histórico;
- criação geométrica, aparência, instancing e renderização configurável;
- plano ativo, formas 2D, caminhos, sweep, distribuição e medição;
- edição de malha e operações topológicas incrementais;
- STL, projetos, recuperação local e PWA;
- console, linguagem afim, scripts SES, procedimentos e planos;
- runtime temporal e animação efêmera;
- viewers locais e objetos câmera;
- modo jogo, personagem GLB, colisão, câmera, áudio e eventos;
- gates, diagnóstico, testes e benchmarks.

## Invariantes

1. Three.js e DOM não são autoridades do estado lógico.
2. Toda mutação persistente passa por comando público.
3. Preview, seleção, câmera, painéis, animação e física por quadro não entram no
   documento.
4. Undo/redo pertence ao sandbox.
5. Operações em lote validam tudo antes da primeira mutação.
6. Grupos preservam transformações locais.
7. Programas recebem capabilities mínimas e produzem planos revisáveis.
8. Recursos equivalentes permanecem compartilhados enquanto possível.
9. Viewers locais compartilham estado editorial por revisão, não câmera ou
   seleção.
10. Sessões temporais distribuem definição e época, não matrizes por quadro.
11. Modo jogo é estado efêmero restaurável do viewer.
12. PWA, recuperação e arquivo de projeto são mecanismos distintos.
13. Alterações são pequenas, testáveis, reversíveis e documentadas.
14. Não pedir grandes edições manuais no celular; entregar patch verificável.

## Uso local

```bash
cd <checkout-confirmado>
python3 tools/no_cache_server.py --port 8082
```

Em outra sessão:

```bash
termux-open-url 'https://127.0.0.1:8082/apps/web/'
```

## Testes

```bash
python3 tools/run_current_gates.py
```

No perfil `?application=diagnostics`:

```text
runtime test help
runtime test all
```

Mudanças visuais exigem teste visual. Mudanças de desempenho exigem benchmark
comparável.

## Documentação

- `docs/MANUAL_DO_USUARIO.md` - tarefas;
- `docs/REFERENCIA_TECNICA.md` - contratos;
- `docs/book/` - livro e PDF;
- `docs/project/CURRENT_STATE.md` - estado;
- `docs/project/DECISIONS.md` - invariantes;
- `docs/project/ROADMAP.md` - planejamento.

Documentos numerados de build são históricos. Não copiar contagens, hashes ou
listas geráveis para esta semente.

## Próxima prioridade

Consolidar documentação e acessibilidade das capacidades atuais antes de
expandir arquitetura. Depois, priorizar contratos de maior retorno: ferramentas
procedurais vinculadas, topologia robusta, jogo por eventos e estabilização da
experiência móvel. Colaboração remota e novas VMs dependem de critérios e
benchmarks explícitos.

## Protocolo para nova LLM

1. ler `AGENTS.md`, este arquivo e
   `docs/project/CHATGPT_PROJECT_INSTRUCTIONS.md`;
2. confirmar checkout e build;
3. ler código e testes da área;
4. preservar mudanças do usuário;
5. reutilizar comandos, registros e serviços existentes;
6. diferenciar implementado, testado, em consolidação e pretendido;
7. entregar patch, testes e roteiro manual;
8. não fazer push ou merge sem autorização.
