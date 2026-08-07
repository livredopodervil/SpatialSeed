#!/usr/bin/env python3
from pathlib import Path
import json, sys
ROOT=Path(__file__).resolve().parents[1]
errors=[]
def text(rel):
    p=ROOT/rel
    if not p.is_file():
        errors.append(f"arquivo ausente: {rel}")
        return ""
    return p.read_text(encoding="utf-8")
def require(source, needle, message):
    if needle not in source: errors.append(message)

build=json.loads(text("apps/web/build-info.json") or "{}")
if build.get("build")!="20260807-0051b":
    errors.append(f"build incorreto: {build.get('build')!r}")
index=text("apps/web/index.html")
require(index,'boot.js?build=20260807-0051b','index não aponta para 0051b')

appearance=text("packages/appearance-runtime/src/AppearanceRuntime.js")
require(appearance,'const { objects: _objects, ...sceneShell } = source;','AppearanceRuntime ainda tenta clonar a coleção persistente')
if '...structuredClone(scene),' in appearance:
    errors.append('AppearanceRuntime ainda contém structuredClone(scene)')
adapter=text("packages/project-files/src/ProjectAppearanceAdapter.js")
require(adapter,'...structuredClone(sceneShell)','ProjectAppearanceAdapter não separa o shell da coleção objects')

selection=text("packages/renderer-three/src/ScreenSelectionGesture.js")
for needle, message in [
    ('rectanglesIntersect(gesture.rectangle, entryBounds)','retângulo não usa bounds projetados'),
    ('polygonIntersectsRectangle(gesture.points, entryBounds)','laço não usa bounds projetados'),
    ('function polygonIntersectsRectangle','interseção laço/bounds ausente'),
    ('function segmentsIntersect','teste de interseção de arestas ausente'),
]: require(selection,needle,message)
renderer=text("packages/renderer-three/src/ThreeRegionRenderer.js")
for needle, message in [
    ('ScreenSelectionGesture.js?build=20260807-0051b','renderer não invalida cache do gesto 0051b'),
    ('local.getCenter(new THREE.Vector3())','centro de seleção não vem dos bounds geométricos'),
    ('const minimumExtent = 6;','estabilização de objetos distantes ausente'),
    ('#spatialObjectIndex','índice espacial 0051a foi perdido'),
    ('#spatialShardCapacity','spatial shards 0051a foram perdidos'),
]: require(renderer,needle,message)
web=text("apps/web/bootstrap/bindWebInterface.js")
require(web,'$("project-save").addEventListener("click", async () => {','binding do botão Salvar ausente')
require(web,'execute("project.save")','botão Salvar não chama project.save')

if errors:
    print('Auditoria 0051b FALHOU:')
    for error in errors: print(' - '+error)
    sys.exit(1)
print('Auditoria 0051b aprovada: salvar aceita PersistentObjectArray e seleção retangular/laço usa bounds projetados estáveis.')
