# Fluxo de trabalho verificável

## Diagnóstico do problema 0005

O HTML e o `main.js` novos foram executados junto com um `ThreeRegionRenderer.js` antigo em cache. Como o construtor antigo aceitava qualquer segundo argumento, a incompatibilidade não falhou imediatamente; os controles do editor ficaram visíveis, mas inoperantes.

## Medidas adotadas

1. identificador de build em HTML, CSS e cada import ES;
2. `apiVersion` nos módulos críticos;
3. falha explícita quando versões incompatíveis são combinadas;
4. servidor HTTP com cabeçalhos `no-cache`;
5. comparação SHA-256 entre repositório e cópia pública;
6. painel de diagnóstico na aplicação;
7. `PROJECT_SEED.md` regenerável para transferência de contexto.

## Regra

Uma interface nova nunca deve depender de um módulo antigo silenciosamente. A aplicação deve iniciar corretamente ou mostrar erro explícito com a versão incompatível.
