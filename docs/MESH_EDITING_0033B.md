# Edição de malha 0033b — correção de entrada visual

A correção resolve três falhas de apresentação do 0033a:

1. O painel de edição não possuía posicionamento visual próprio. Ele era marcado como painel flutuante, mas permanecia no fluxo normal do documento e, com o corpo sem rolagem, ficava fora da área visível.
2. O botão **Editar malha** apenas abria o painel; era necessário localizar e pressionar um segundo botão para iniciar a sessão.
3. Os marcadores usavam teste de profundidade sobre a própria superfície, o que podia tornar a entrada no modo de edição pouco perceptível.

No 0033b, **Editar → Editar malha** abre o painel e inicia a edição quando há exatamente um objeto editável selecionado. O painel é fixo e responsivo, o botão **Travar plano do viewer** aparece junto às ações principais, os vértices ficam sempre visíveis e a opção de oclusão limita somente o picking. A sessão começa com o gizmo de translação ativo.
