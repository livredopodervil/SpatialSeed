# AST canônica e semântica afim 0021d

A linguagem de superfície compila para uma AST versionada com IDs semânticos.
Palavras-chave e idiomas podem mudar sem alterar a AST persistida.

Modos:
- `indexed` (padrão): move e rotate são incrementos; scale é fator da semente no índice.
- `recursive`: preserva a composição matricial anterior.

Espaços de translação:
- `world` (padrão);
- `local`.

A AST registra hash, versão, linguagem de origem, modo e semântica. A forma
compilada é regenerável a partir da AST.
