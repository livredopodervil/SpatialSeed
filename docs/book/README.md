# Livro do SpatialSeed

Esta pasta contém a fonte editorial, os recursos visuais, os exemplos anexados
e as edições consolidadas do livro/manual.

## Edição atual

- `SpatialSeed_Livro_Manual_v1.0.md`: fonte-mestra da edição;
- `SpatialSeed_Livro_Manual_e_Atlas_Procedural_v1.0.pdf`: artefato final;
- `../MANUAL_DO_USUARIO.md`: manual orientado a tarefas, incluído na fonte-mestra;
- `../REFERENCIA_TECNICA.md`: referência derivada dos contratos atuais;
- `assets/`: diagramas e pré-visualizações editoriais;
- `examples/`: programas e manifesto anexados ao PDF;
- `../../tools/build_spatialseed_book.py`: gerador reproduzível.

A edição v0.6 permanece nesta pasta como registro histórico. Ela descreve uma
arquitetura anterior e não deve ser usada como referência do estado 0054.

## Compilar

Na raiz do repositório:

```bash
python3 tools/build_spatialseed_book.py
```

Dependências Python: `Pillow`, `pypdf` e `reportlab`. Para inspeção visual,
instale também Poppler (`pdfinfo`, `pdftoppm`, `pdftotext` e `pdfdetach`).

O gerador expande as diretivas `{{INCLUDE:...}}`, cria temporários em
`tmp/pdfs/` e grava o PDF final nesta pasta. O modo invariável e os metadados
fixos tornam a saída reproduzível a partir das mesmas fontes. Antes de publicar,
renderize todas as páginas e inspecione-as visualmente.

## Política editorial

A edição 1.0 separa explicitamente:

- implementado e utilizável agora;
- contratos em consolidação;
- arquitetura pretendida.

Os exemplos do 0021d são apresentados apenas como evidência histórica do atlas.
O baseline técnico geral desta edição é o build `20260817-0054mm`, promovido em
17 de agosto de 2026. Alterações posteriores devem atualizar a referência sem
reescrever a história dos exemplos.
