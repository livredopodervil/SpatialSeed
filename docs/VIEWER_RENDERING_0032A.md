# Renderização local do viewer — build 0032a

O build 0032a acrescenta um perfil de renderização configurável que pertence somente ao viewer atual. As opções não alteram o estado do mundo, o arquivo `.spatialseed`, o catálogo de procedures nem outros viewers conectados ao mesmo sandbox.

## Painel

Abra **Painéis → Render**. O painel controla:

- limite de resolução e resolução interna da transmissão;
- tone mapping e exposição;
- fundo e ambiente procedural PMREM;
- luz hemisférica e luz direcional;
- sombras, filtro, resolução, câmera e plano receptor local;
- substituição ou complementação local dos materiais do projeto;
- rugosidade, metallicidade, transmissão, índice de refração, espessura óptica, atenuação, dispersão, iridescência e verniz.

As preferências são salvas em `localStorage["spatialseed.viewer.render.v1"]`. HTTP e HTTPS possuem armazenamentos distintos por serem origens diferentes.

## Presets

- **Original 0029f1**: restaura iluminação e materiais visuais equivalentes ao viewer anterior, sem sombras ou ambiente.
- **Estúdio com sombras**: configuração padrão equilibrada para edição.
- **Cristal azul**: transmissão alta, dispersão cromática e reflexo ambiental.
- **Vidro**: transmissão quase total e baixa rugosidade.
- **Aço polido**: alta metallicidade e ambiente neutro.
- **Concreto**: alta rugosidade e reflexo reduzido.

## API de comandos

As interfaces usam os mesmos comandos públicos:

```js
runtime.execute("viewer.render.settings.set", {
  shadows: { enabled: true, mapSize: 1024 },
  environment: { enabled: true, preset: "studio-blue" }
});

runtime.execute("viewer.render.preset.apply", {
  id: "crystal-blue"
});

runtime.execute("viewer.render.settings.reset");
```

Consultas:

```js
runtime.query("viewer.render.settings");
runtime.query("viewer.render.presets");
```

## Escopo arquitetural

O `ThreeRegionRenderer` mantém as luzes, o ambiente PMREM, o plano receptor e as opções de qualidade. O `BatchMaterialCache` projeta os materiais persistentes em `THREE.MeshStandardMaterial` ou `THREE.MeshPhysicalMaterial` conforme o perfil local.

O modo de material possui três políticas:

- `project`: respeita integralmente os parâmetros do projeto;
- `enhance`: usa valores locais apenas quando o projeto não definiu o parâmetro;
- `override`: força um material visual uniforme no viewer, sem modificar o documento.

A cor possui política independente: `project` ou `override`.

## Limitações

O ambiente PMREM fornece reflexão ambiental, não reflexos dinâmicos dos próprios objetos. Espelhos planos, sondas por `CubeCamera` ou reflexos em espaço de tela continuam fora deste build.

Transmissão e dispersão usam `THREE.MeshPhysicalMaterial`. Muitos objetos transparentes dentro de um único `InstancedMesh` podem revelar limitações de ordenação. O perfil padrão reduz o buffer de transmissão a metade da resolução e limita o pixel ratio a `1.5`, visando dispositivos móveis.

A chamada “difração” visual deste build corresponde a aproximações por dispersão e iridescência. Difração ondulatória fisicamente explícita exigiria shader espectral próprio.
