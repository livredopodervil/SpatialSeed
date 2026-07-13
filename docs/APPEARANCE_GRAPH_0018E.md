# Appearance Graph 0018e

```text
Object
  appearanceId

Appearance
  materialId
  shaderId

Material
  textureId
  textureTransform

Texture
  src
  mimeType
  colorSpace
```

Dois objetos visualmente idênticos recebem o mesmo `appearanceId`.

Objetos com a mesma textura e transforms de textura diferentes compartilham
a Texture, mas usam Materials distintos.

Esta etapa adiciona o modelo e a suíte `runtime test assets`.
A próxima etapa integrará o grafo ao formato `.spatialseed`.
