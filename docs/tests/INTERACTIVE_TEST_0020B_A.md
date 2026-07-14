# Teste interativo 0020b-a

1. Abrir a cena padrão.
2. Selecionar e mover uma caixa.
3. Testar rotação e escala.
4. Executar uma repetição afim com pivô explícito.
5. Testar `repeat`, undo e redo.
6. Salvar e reabrir um projeto.
7. Executar:
   - `runtime test runtime-api`
   - `runtime test affine-pivot`
   - `runtime test affine-repeat`
   - `runtime test all`
8. Executar três vezes:
   - `runtime benchmark api 10000`
9. Registrar mediana de `overheadPerCallUs`.
10. Executar `runtime resources` e comparar draw calls, lotes, materiais,
    geometrias e memória com a cena equivalente anterior.
11. Confirmar que `window.__SPATIAL_SEED__` expõe apenas a fachada pública.
