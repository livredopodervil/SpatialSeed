# HUD contextual, luzes e materiais — build 0037c

O build `20260727-0037c` mantém o workspace **Editar** como superfície única e transforma o HUD numa grade estritamente icônica. Cada ícone possui explicação por `title`, indica disponibilidade por iluminação e aparece apenas nos contextos em que sua operação é válida. Em modo objeto ficam disponíveis criação, luz, material, spline, agrupamento, duplicação e exclusão. Em edição de malha aparecem seleção topológica, criação, preenchimento, extrusão, inset, divisão, colapso, bridge, subdivisão, normais, caminho derivado e limpeza.

A janela de configuração do HUD é fixa à viewport, rolável, redimensionável em desktop e redimensionável verticalmente no mobile. Colunas, linhas, tamanho, opacidade, posição, grupos e parâmetros rápidos são persistidos em `localStorage["spatialseed.edit.hud.v1"]`.

O workspace mantém por padrão criação, caminhos e topologia visíveis. A criação comum e a avançada aceitam outro objeto como argumento de posição, orientação ou ambas. Geometria, cor e parâmetros usados recentemente são memorizados.

Materiais físicos são editáveis por objeto mediante as propriedades `appearance.model`, `roughness`, `metalness`, `transmission`, `ior`, `thickness`, `dispersion`, `clearcoat` e `envMapIntensity`. O painel pode ler a seleção, aplicar os parâmetros e usá-los como padrão das próximas criações.

Luzes são objetos persistentes dos tipos pontual, direcional, spot e ambiente. Elas podem ser selecionadas, movidas e giradas como outros objetos, editadas no Inspector ou no workspace e configuradas por cor, intensidade, distância, decaimento, ângulo, penumbra e sombra. O renderer cria a luz Three.js e um helper selecionável exclusivamente no viewer.
