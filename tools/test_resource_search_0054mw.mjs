import assert from "node:assert/strict";
import {
  ResourceSearchIndex,
  parseResourceSearchQuery
} from "../packages/resource-tree/src/ResourceSearchIndex.js";
import { AssetStore } from "../packages/asset-store/src/AssetStore.js";

const store = new AssetStore();
const texture = store.intern("texture", {
  src: `data:image/png;base64,${"A".repeat(4096)}`
}, {
  metadata: { name: "Textura da raposa" }
});
store.intern("material", { color: "#ff8800" });

const descriptors = store.listDescriptors();
assert.equal(descriptors.length, 2);
assert.equal("value" in descriptors[0], false);
assert.equal(JSON.stringify(descriptors).includes("AAAA"), false);

const objects = [
  {
    id: "fox-1",
    kind: "mesh",
    name: "Raposa Heroína",
    geometry: { type: "mesh" },
    appearanceId: "appearance-fox"
  },
  {
    id: "camera-map",
    kind: "camera",
    name: "Câmera do mapa"
  },
  {
    id: "path-hidden",
    kind: "stroke-bundle",
    name: "Caminho secreto",
    geometry: { type: "tube" },
    visible: false
  }
];
let revision = 1;
const index = new ResourceSearchIndex({
  getObjects: () => objects,
  getAssets: () => descriptors,
  getRevision: () => revision
});

assert.deepEqual(
  parseResourceSearchQuery('name:"Raposa Heroína" type:object').filters.name,
  ["raposa heroina"]
);
assert.equal(index.search("raposa").items[0].id, "fox-1");
assert.equal(index.search("type:camera").items[0].id, "camera-map");
assert.equal(index.search("type:path hidden:true").items[0].id, "path-hidden");
assert.equal(index.search("type:material").items[0].kind, "material");
assert.equal(index.search(`id:${texture.id}`).items[0].label, "Textura da raposa");
assert.equal(JSON.stringify(index.search("type:texture")).includes("AAAA"), false);
assert.equal(index.status().statistics.rebuilds, 1);
index.search("camera");
assert.equal(index.status().statistics.rebuilds, 1);
revision += 1;
index.search("camera");
assert.equal(index.status().statistics.rebuilds, 2);

console.log("8/8 universal resource search tests passed");
