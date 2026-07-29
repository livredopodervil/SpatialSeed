# Autoria planar, pivô e ferramentas 2D — 0040a

## Contrato

O `0040a` separa três intenções que antes compartilhavam o mesmo plano:

| Referencial | Efeito |
| --- | --- |
| Plano de visualização | restringe navegação e órbita 2D |
| Plano de edição | orienta gizmo e edição de componentes |
| Plano de desenho | recebe pontos e formas criadas por gesto |

Alterar um deles não muda os demais. Todos são frames ortonormais locais do
viewer e guardam origem, eixos X/Y, normal, quaternion e a fonte usada.

## Fontes de plano

- vista atual;
- XY, XZ ou YZ mundial;
- frame do objeto selecionado;
- frame do objeto com inclinação e azimute;
- face ativa durante edição de malha;
- exatamente três objetos ou três vértices selecionados;
- três pontos explícitos `[[x,y,z], ...]`;
- normal e tangente explícitas pela API;
- cópia do plano de edição ou do plano de desenho.

No HUD, a captura rápida prioriza face ativa, três pontos, objeto e viewer.
Todas as opções ficam disponíveis no workspace.

## Ferramentas 2D

O grupo verde do HUD e a seção **Desenho e edição 2D** oferecem ponto,
segmento, polilinha, retângulo, círculo, arco e polígono regular. Contorno,
preenchimento, cor, espessura, segmentos, lados e ângulo do arco são parâmetros
do mesmo registro de ferramentas usado pelo runtime.

Durante o gesto existe somente uma lista de pontos e um mesh de preview. A cena
não é consultada em `pointermove`. Ao concluir, o controlador chama a criação
autoritativa uma vez; o documento recebe uma geometria e o histórico recebe
uma etapa. A polilinha usa clique para pontos, `Enter` ou o botão de concluir,
`Backspace` para retirar o último ponto e `Esc` para cancelar o rascunho.

**Editar 2D** entra na edição de vértices do objeto selecionado. Se não houver
plano de edição, o comando usa o plano de desenho ou deriva o frame do objeto.

## Cores do HUD

Cada setor funcional possui uma identidade cromática própria. A cor é aplicada
ao fundo, contorno e estado ativo de suas células, sem substituir os ícones,
labels acessíveis, ajuda por toque longo ou configuração de visibilidade.

## Verificação

Os contratos `edit-context`, `planar-authoring`, `tool-parameters` e
`hud-context` verificam independência dos planos, três pontos,
inclinação/azimute, descritores das sete formas, publicação única e
rearmamento persistente.
