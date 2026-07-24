# Objetos câmera persistentes

> Contrato técnico implementado no marco `0029f`.

## Fronteira

Um objeto câmera é uma entidade persistente da cena. Ele possui identidade,
transform local, parentesco e parâmetros de projeção, passa pelos comandos do
sandbox e entra em undo, recuperação e arquivo `.spatialseed`.

Isso não transforma a câmera de navegação em estado compartilhado. Cada viewer
continua com sua própria câmera concreta e guarda localmente apenas
`activeCameraId`. Ativar um objeto copia sua pose mundial e projeção para a
câmera de navegação; enquanto ativo, mudanças confirmadas no objeto atualizam
essa vista. Navegação manual desativa o vínculo sem alterar o documento.

## Modelo

```js
{
  id: "camera-1",
  kind: "camera",
  name: "Câmera principal",
  parentId: null,
  position: [0, 4, 8],
  rotation: [0, 0, 0, 1],
  scale: [1, 1, 1],
  camera: {
    projection: "perspective",
    fov: 50,
    near: 0.1,
    far: 2000,
    focusDistance: 10
  }
}
```

Objetos câmera podem ser agrupados, reparentados, duplicados, transformados,
selecionados e excluídos pelas operações genéricas. A pose usada pelo viewer é
mundial e deriva da cadeia hierárquica. Escala não participa da orientação da
câmera.

`scene.defaultCameraId` é opcional. Quando válido, um viewer recém-inicializado
pode adotá-lo; escolher **Câmera livre** é uma decisão local e não remove o
padrão do documento.

## Comandos e consultas

Persistentes:

- `camera.object.create`;
- `camera.object.projection.set`;
- `camera.object.capture-viewer`;
- `camera.object.default.set`.

Locais ao viewer:

- `viewer.camera.object.activate`;
- `viewer.camera.object.deactivate`.

A consulta `camera.objects.list` informa objetos, câmera ativa local e câmera
padrão. No console, use `camera objects`, `camera create`, `camera activate`,
`camera free`, `camera capture`, `camera default` e
`camera object-projection`.

## Renderer e animação

O renderer projeta corpo, lente e frustum selecionáveis, mas esses helpers não
são geometria autoritativa nem assets do documento. Objetos câmera ficam fora
dos lotes renderizáveis e da animação efêmera de objetos do `0029f`.

O `0029g` poderá adaptar o runtime temporal para câmera de navegação e objetos
câmera sem tornar a projeção Three.js uma fonte de verdade.

## Persistência e compatibilidade

O serializer escreve schema 3. O leitor continua aceitando schemas 1 e 2; esses
documentos simplesmente não possuem objetos câmera nem `defaultCameraId`.
Schema 3 valida a hierarquia completa, parâmetros de projeção e a referência da
câmera padrão.

## Testes

`runtime test viewer` cobre criação, ativação local, câmera padrão, undo e pose
mundial hierárquica. `runtime test project-files` cobre roundtrip do schema 3 e
rejeição de referência padrão inválida.
