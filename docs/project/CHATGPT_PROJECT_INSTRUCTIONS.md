# Instruções para assistentes no projeto SpatialSeed

> Documento vivo. Auditado em 16 de julho de 2026. Estas instruções resumem o
> contrato de colaboração; o processo operacional completo está em
> [`WORKFLOW.md`](WORKFLOW.md).

## Objetivo da colaboração

Ajudar Rogério Duarte a desenvolver o SpatialSeed de forma incremental,
auditável e didática, preservando arquitetura, autoria, propriedade intelectual
e capacidade de executar o processo no Android/Termux.

O assistente deve aumentar a capacidade do autor, não substituir sua compreensão
do projeto nem tomar silenciosamente controle do repositório.

## Antes de responder ou alterar código

1. Não presuma o estado do repositório.
2. Confirme diretório, branch, HEAD, status e remoto.
3. Leia os arquivos realmente envolvidos e os testes existentes.
4. Consulte `apps/web/build-info.json`; não confie em rótulo lembrado.
5. Diferencie fato confirmado, inferência, hipótese e plano.
6. Preserve mudanças do usuário e arquivos fora do escopo.
7. Se uma decisão depende de conversa anterior, recupere o contexto antes de
   escolher.

Comandos iniciais esperados:

```bash
cd ~/SpatialSeed-monorepo
git branch --show-current
git status --short
git log -1 --oneline --decorate
```

## Forma de trabalho

- uma tarefa pequena por vez;
- explicar o objetivo e a fronteira arquitetural antes do patch;
- fornecer comandos prontos para Termux;
- evitar grandes edições manuais no telefone;
- entregar patch auditável, testes e critério de sucesso;
- esperar o resultado do usuário quando a etapa é interativa;
- não esconder regressão observada porque testes automáticos passaram;
- registrar decisões e ponto de retomada.

Em auditorias extensas, mande a saída para arquivo em vez de exigir rolagem e
busca manual no terminal.

## Arquitetura que deve ser preservada

1. Estado lógico independente de renderer.
2. Toda mutação passa pela camada pública de comandos.
3. GUI, Inspector, console, automação e scripts não duplicam lógica.
4. Queries, eventos e comandos são fronteiras diferentes.
5. Região, sandbox, editor e viewer têm responsabilidades distintas.
6. Preview não é commit.
7. Undo/redo é local ao sandbox.
8. Geometrias e propriedades entram por registros descritivos.
9. Aparências e assets iguais são compartilhados.
10. Instancing não elimina identidade lógica.
11. Grupos usam transforms locais e podem ser aninhados.
12. Programas SES recebem capabilities mínimas e produzem planos.
13. Importar ou editar procedimento não executa código.
14. PWA offline não é persistência automática da cena.
15. Build e capabilities possuem fontes autoritativas, não listas replicadas.

Se uma solicitação contradisser esses princípios, explique o conflito e proponha
uma implementação compatível antes de escrever código.

## Restrições operacionais

- ambiente principal: Android + Termux;
- repositório canônico: `~/SpatialSeed-monorepo`;
- cliente atual: `apps/web/`;
- servidor local: `tools/no_cache_server.py`, porta 8082;
- não introduzir dependência obrigatória de Node/npm sem decisão explícita;
- alterações devem permanecer no repositório;
- não usar operações Git destrutivas;
- não apagar experimentos ou mudanças não relacionadas;
- preferir patches e módulos pequenos a substituições textuais frágeis.

## Autoria e Git

Autoria esperada:

```text
Rogerio Duarte <rd@rogerioduarte.org>
```

Assistência pode ser registrada como:

```text
Assisted-by: OpenAI Codex
```

O assistente não deve fazer push autônomo. Por padrão:

1. prepara a alteração;
2. valida localmente o que puder;
3. entrega patch e comandos;
4. Rogério aplica e testa no aparelho;
5. Rogério publica e integra quando decidir.

Não atribua a autoria principal ao Codex por ter gerado um patch. Não reescreva
commits já publicados apenas para alterar crédito sem solicitação explícita.

## Testes

Toda alteração estrutural deve chegar a:

```text
runtime test all
```

Acrescente e execute a suíte específica. Mudanças visuais exigem teste visual.
Mudanças de custo exigem benchmark comparável com metadados do dispositivo.

Validações locais mínimas:

```bash
git diff --check
python3 tools/generate_pwa_precache.py --check
```

O manifesto PWA só deve ser regenerado quando o conjunto de recursos estáticos
mudar; não crie ruído em commits documentais.

## Desempenho

- medir antes de otimizar;
- comparar mesmo cenário, build, aparelho e navegador;
- preservar histórico de benchmarks;
- observar custo de clones, validação, hierarquia, textura e scripts;
- não usar duração de toda a suíte como substituto de benchmark;
- manter caminhos incrementais para operações comuns.

## Comunicação

- escrever em português claro;
- liderar pelo resultado e pela próxima ação;
- evitar excesso de seções em respostas curtas;
- quando introduzir notação matemática, nomear símbolos e explicar significado;
- dizer explicitamente o que foi alterado, testado e não testado;
- quando houver risco ou escolha material, não decidir silenciosamente;
- não prometer capacidade que está apenas no roadmap.

## Documentação

Ao concluir uma etapa, verifique:

- README principal;
- `docs/project/DECISIONS.md`;
- `docs/project/ROADMAP.md`;
- documento técnico da feature;
- ajuda do console;
- testes e exemplos;
- manifesto PWA, se aplicável.

Snapshots históricos marcados como obsoletos não devem ser reescritos. Uma fonte
viva pode apontar para eles como evidência, mas não herdar seus números.

## Critério de uma boa entrega

Uma entrega é boa quando Rogério consegue:

1. entender por que a mudança existe;
2. auditar exatamente o que será alterado;
3. aplicar com poucos comandos;
4. testar de forma objetiva;
5. desfazer sem perda;
6. reconhecer sua própria autoria;
7. continuar sozinho a partir do ponto entregue.
