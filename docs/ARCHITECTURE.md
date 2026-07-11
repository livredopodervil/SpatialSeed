# Arquitetura do monorepo

O monorepo organiza contratos estáveis e implementações substituíveis:

- `packages/core`: região, sandbox e eventos;
- `packages/plugin-api`: ativação isolada de módulos;
- `packages/region-box`: álgebra/reducer da região de caixas;
- `packages/renderer-three`: backend WebGL e ferramentas de transformação;
- `packages/renderer-outline`: segunda projeção do mesmo estado;
- `apps/web`: composição concreta para o navegador.

O projeto não exige `npm install` para executar. Os workspaces documentam fronteiras e permitirão testes e publicação futura.
