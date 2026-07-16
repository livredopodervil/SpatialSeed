# Interoperabilidade de arquivos 0025b

Esta etapa separa o documento de projeto do mecanismo usado para transportá-lo.
O `ProjectService` não conhece mais DOM, links ou downloads: `project.save`
prepara texto, nome, tipo de mídia e tamanho. A interface entrega esse documento
ao `BrowserProjectFileGateway`.

Quando o navegador oferece a File System Access API, **Abrir** usa o seletor
nativo e **Salvar** pode gravar novamente no mesmo arquivo. Em navegadores que
não oferecem a API — inclusive algumas versões móveis — continuam disponíveis
o `input type=file` e o download com extensão `.spatialseed`.

Algumas versões do Chrome Android expõem as funções nativas, mas respondem com
`NotAllowedError` quando são chamadas no aplicativo instalado. Esse bloqueio de
plataforma desativa a via nativa durante a sessão e aciona automaticamente o
fluxo de fallback. Antes do primeiro download, a interface explica a limitação
e solicita confirmação explícita. Cancelamento pelo usuário (`AbortError`)
continua sendo um no-op.

Cancelar um seletor não altera o projeto. Criar um projeto novo descarta a
referência ao arquivo anterior, evitando sobrescrita acidental. A escrita
nativa envia o texto diretamente, sem criar uma segunda cópia em `Blob`, e só
é confirmada ao fechar o fluxo gravável.

As capacidades detectadas ficam disponíveis para diagnóstico em:

```js
window.__SPATIAL_SEED_FILE_INTEROP__
```
