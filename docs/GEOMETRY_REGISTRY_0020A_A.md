# Geometry Registry 0020a-a

Esta etapa adiciona uma abstração geométrica sem integrar o renderer.

## Objetivo

Permitir que novas geometrias sejam registradas por providers, sem adicionar
condicionais ao renderer central.

## Providers iniciais

- box;
- sphere;
- cylinder;
- plane.

## Compatibilidade

`describeLegacyObject()` converte objetos antigos:

```js
{ kind: "box", size: [2, 2, 2] }
```

para:

```js
{ type: "box", size: [2, 2, 2] }
```

## Limite desta etapa

Nenhum objeto novo aparece ainda na interface. O renderer continua usando
`acquireBox()`. A integração visual será feita somente depois de os testes do
registro passarem.
