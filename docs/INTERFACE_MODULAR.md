# Interface modular

A interface organiza as capacidades do SpatialSeed por tarefa. A cena continua
editável diretamente; painéis, HUD e menus usam os comandos existentes.

## Percurso de uso

| Intenção | Acesso |
| --- | --- |
| Criar um objeto | Criar → Objetos e geometrias, ou Ferramentas → Criar |
| Selecionar vários objetos | Ferramentas → Selecionar → Adicionar à seleção |
| Mover, girar ou escalar | Selecione; Ferramentas → Transformar; confira referencial e pivô |
| Desenhar, criar caminhos ou medir | Ferramentas → Desenhar; defina o plano ativo |
| Editar vértices, arestas ou faces | Selecione; Ferramentas → Malha; aplique ou cancele ao terminar |
| Alterar cor ou material | Ferramentas → Aparência; confira o alvo da aplicação |
| Editar propriedades ou comportamentos | Editar → Propriedades do objeto |
| Animar ou executar programas | Programar → Animar, Console ou Editor de procedimentos |
| Jogar com o personagem | Selecione o personagem/objeto; Jogar; Esc retorna |
| Salvar ou abrir | Projeto → Salvar ou Abrir |
| Ver seleção, pivô e versão | Exibir → Seleção e estado do projeto |
| Configurar o espaço | Exibir → Organização da interface |
| Encontrar um comando ou recurso | Comandos / Recursos, ou Ctrl/Cmd+P / Ctrl/Cmd+F |

No celular, Ferramentas começa recolhido para deixar espaço à cena. Abrir um
painel fecha o anterior. No computador, os painéis continuam independentes,
movíveis e maximizáveis. Os controles se ajustam à largura, sem retirar recursos.

**HUD livre configurável** restaura a grade e as preferências anteriores.
Escolher um grupo não inicia ferramentas, não altera a seleção nem gera undo.
O grupo de transformação acompanha a troca para mover/girar/escalar. Durante
edição de malha, o grupo Malha permanece acessível ao trocar a ferramenta.

O demo padrão continua com sua política de lançamento. Para entrar diretamente
em um projeto novo, use `/apps/web/?project=new`. A ajuda da interface está no
botão **Como usar** e no comando `help interface`.

## Composição e extensões

- `packages/ui-config/src/WorkspaceConfiguration.js` valida a seção `workspace`
  do manifesto existente. `mode` aceita `guided` ou `free`; ausência preserva o
  comportamento de manifestos antigos.
- Cada seção declara `id`, `label`, `hint`, `groups` e `when`. Os grupos
  referenciam `data-edit-hud-group`; não duplicam comandos. `when` aceita
  `always`, `selection` ou `mesh`. Pelo menos uma seção deve estar sempre
  disponível. Uma preferência para seção removida volta à seção padrão.
- `WorkspaceContext.js` projeta os snapshots fornecidos pelo host. O resumo lê
  a contagem sem percorrer membros ou pedir geometria/propriedades.
- `WorkspaceShell.js` compõe os elementos existentes, recebe armazenamento por
  injeção e não recebe autoridade editorial. Novos componentes sem mapeamento
  permanecem alcançáveis na seção padrão; providers fornecem seus próprios
  nomes e dicas sem outra lista de comandos.
- `FloatingPanelManager` emite `spatialseed:panel-visibility`. A ponte web usa
  essa notificação para suspender/retomar o Inspector. Modo jogo e modo cena
  também suspendem a inspeção enquanto sua superfície está oculta.
- `workspace.css` contém a apresentação guiada sob `data-workspace="guided"`.
  A apresentação livre mantém as regras e preferências anteriores.

A chave de barra existente guarda `workspace.mode`, `workspace.section` e
`workspace.collapsed`, preservando os demais campos. Nenhuma preferência
editorial é gravada no documento ou no histórico. Não há nova dependência de
runtime, build ou instalação npm obrigatória.

Eventos/bindings existentes permanecem na seção Comportamento do Inspector.
Esta mudança não implementa novas primitivas, física, bindings reativos ou
prefabs; estes seguem o estado funcional e o roadmap próprios.

## Verificações automatizadas

Na raiz do checkout:

```bash
git diff --check
python3 tools/run_current_gates.py
```

No console do perfil `?application=diagnostics`:

```text
runtime test help
runtime test workspace
runtime test ui-configuration
runtime test ui-actions
runtime test object-inspector
runtime test all
```

O teste opcional de integração DOM lê a entrada HTML real, compõe os controles,
verifica contextos, foco, armazenamento e exclusividade em larguras de desktop e
celular. Ele usa Happy DOM, instalado separadamente apenas para desenvolvimento:

```bash
node tools/verify_workspace_dom.mjs /caminho/para/happy-dom/lib/index.js
```

DOM emulado não valida renderização WebGL, posicionamento real, gestos tácteis
ou atualização da PWA instalada. A revisão gráfica do navegador não foi
executada nesta entrega: o acesso ao servidor local foi bloqueado pelo ambiente.

## Roteiro visual obrigatório antes de promover

1. Inicie `python3 tools/no_cache_server.py --port 8082` no checkout aplicado.
   Abra `https://127.0.0.1:8082/apps/web/?project=new`, usando o certificado local
   confiável já configurado. Confira o build em Exibir → Seleção e estado.
2. Teste celular em retrato/paisagem e computador. Abra e recolha Ferramentas;
   percorra os menus. Não deve haver texto cortado, controles sobrepostos nem
   rolagem horizontal involuntária. Verifique também ampliação de texto em 200%.
3. Crie uma caixa e um objeto com malha mais complexa. Selecione cada um e ambos,
   incluindo área/laço/pincel. A seleção não deve abrir Propriedades.
4. Mova, gire e escale; varie Mundo/Objeto e pivô. Desfaça/refaça. Troque grupos
   de ferramentas durante a inspeção sem alterar o histórico.
5. Abra Propriedades, altere um valor e um comportamento existente, feche o
   painel e selecione novamente. No celular, abra outro painel e confirme que
   o anterior fecha; no desktop, mantenha dois painéis e mova-os.
6. Entre em vértices/arestas/faces, selecione, transforme e execute uma operação
   topológica. Confirme Aplicar e Cancelar; a seção Malha deve continuar acessível.
7. Desenhe no plano ativo, conclua/cancele o caminho, altere aparência e abra
   animação/console. Digitar em campos não deve executar atalhos do viewport.
8. Entre e saia do jogo e do modo somente cena. Os controles de edição devem
   desaparecer e retornar com seu estado. Salve/reabra um projeto.
9. Alterne para HUD livre, mude suas preferências, retorne ao guiado e reabra o
   aplicativo. As preferências devem continuar disponíveis. Confira também a
   atualização da PWA instalada e abertura offline após o novo precache.

Uma regressão visual observada continua pendente mesmo com gates aprovados.
