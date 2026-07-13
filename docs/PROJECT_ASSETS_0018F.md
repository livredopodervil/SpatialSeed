# Project Assets 0018f

O formato `.spatialseed` passa ao esquema 2.

No salvamento, materiais embutidos são convertidos para `appearanceId` e
um catálogo deduplicado de Appearance, Material e Texture.

Na abertura, o catálogo é resolvido novamente para o formato legado em
memória, preservando o renderer e o Inspector atuais.

Arquivos de esquema 1 continuam aceitos.
