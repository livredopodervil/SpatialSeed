# Livro do SpatialSeed

Esta pasta contém a fonte editorial, os recursos visuais, os exemplos anexados
e o PDF do livro/manual.

## Arquivos

- `SpatialSeed_Livro_Manual_v0.6.md`: fonte textual da edição;
- `SpatialSeed_Livro_Manual_e_Atlas_Procedural_v0.6.pdf`: artefato final;
- `assets/`: diagramas e pré-visualizações editoriais;
- `examples/`: programas e manifesto anexados ao PDF;
- `../../tools/build_spatialseed_book.py`: gerador reproduzível.

## Compilar

Na raiz do repositório:

```bash
python3 tools/build_spatialseed_book.py
```

Dependências Python: `Pillow`, `pypdf` e `reportlab`. Para inspeção visual,
instale também Poppler (`pdfinfo`, `pdftoppm`, `pdftotext` e `pdfdetach`).

O gerador cria temporários em `tmp/pdfs/` e grava o PDF final nesta pasta. O PDF
usa metadados fixos e modo invariável para produzir o mesmo SHA-256 a partir das
mesmas fontes. Ele deve ser renderizado para PNG e inspecionado antes de uma
release documental.

## Política editorial

O livro distingue:

- implementado;
- testado;
- decisão;
- requisito;
- opção;
- horizonte.

Exemplos do 0021d permanecem identificados como evidência histórica. O estado
técnico geral da edição v0.6 é o `main` no commit `b4043c6`, build
`20260720-0028e`. Edições futuras devem atualizar a referência, não reescrever a
história dos exemplos.
