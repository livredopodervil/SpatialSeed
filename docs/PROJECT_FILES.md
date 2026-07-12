# Arquivos de projeto

O formato inicial do Spatial Seed é um JSON autocontido com extensão `.spatialseed`.

Módulos:

- `ProjectSerializer`: cria o documento persistível;
- `ProjectValidator`: valida e normaliza;
- `ProjectService`: salva, abre e cria projetos.

O arquivo salva cena, objetos, materiais, texturas, editor, pivô e configuração do renderer. Não salva seleção, logs nem histórico de undo/redo.
