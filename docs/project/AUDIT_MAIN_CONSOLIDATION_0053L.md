# Auditoria — consolidação do main (0053l)

Data: 2026-08-09

Base auditada: `0053k-canonical-regressions`

Resultado local: gates automatizados aprovados; validação visual no navegador
permanece obrigatória antes da promoção do `main`.

## Causas e invariantes

| Sintoma | Causa confirmada | Invariante 0053l |
| --- | --- | --- |
| Primeiro arraste de vértice inerte | Entrada de malha forçava `translate` e a seleção era publicada antes da ativação efetiva do gizmo | A última transformação é reativada e a seleção de componentes é sincronizada depois dela. |
| Duplicação voltava para translação | O HUD executava uma segunda ação editorial após duplicar | Duplicação não altera o modo de transformação. |
| Grupo contendo grupo não acompanhava a prévia | O gesto local escrevia diretamente na lista achatada de proxies | A prévia contém raízes e a hierarquia resolvida recompõe toda a subárvore. |
| Pivô variava entre entradas | Estado editorial nascia com política de âncora | A política padrão é `bounds`; alternativas exigem escolha explícita. |
| Âncora ligada ignorava animação/preview do alvo | O renderer não consumia `anchorRef` na posição de referência | A referência usa a matriz efetiva da hierarquia local. |

## Evidência automatizada

- A suíte de runtime recuperada passa integralmente no executor local fora do
  DOM; o caso dependente de DOM continua reservado ao navegador.
- `audit_main_consolidation_0053l.py` verifica os contratos estáticos, inclusive
  a ausência da troca de ferramenta no handler de duplicação.
- Os gates históricos 0053g, 0053h, 0053i e 0053k aceitam 0053l como build
  descendente e continuam verificando suas próprias invariantes.
- Arquitetura, entrada web, PWA, alcance e regressões standalone permanecem no
  gate agregado.

## Limite da aprovação

O executor local não prova interação real com `TransformControls`, WebGL,
eventos de ponteiro, atualização de service worker ou sincronização entre abas.
A lista manual em `MAIN_CONSOLIDATION_0053L.md` é, portanto, condição de
promoção e não uma recomendação opcional.
