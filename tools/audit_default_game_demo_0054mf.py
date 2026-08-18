#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "apps/web/assets/demo/default-game.manifest.json"
CREATE = ROOT / "apps/web/bootstrap/createWebRuntime.js"
MAIN = ROOT / "apps/web/main.js"
BIND = ROOT / "apps/web/bootstrap/bindWebInterface.js"
INDEX = ROOT / "apps/web/index.html"
errors: list[str] = []


def require(condition: bool, message: str) -> None:
    if not condition:
        errors.append(message)


def read(path: Path) -> str:
    if not path.is_file():
        errors.append(f"arquivo ausente: {path.relative_to(ROOT)}")
        return ""
    return path.read_text(encoding="utf-8")


manifest_text = read(MANIFEST)
try:
    manifest = json.loads(manifest_text or "{}")
except json.JSONDecodeError as error:
    errors.append(f"manifesto demo inválido: {error}")
    manifest = {}

require(manifest.get("version") == "spatialseed-default-demo-v1", "versão do manifesto demo inválida")
project_name = str(manifest.get("project") or "")
launch = manifest.get("launch") if isinstance(manifest.get("launch"), dict) else {}
character_id = str(launch.get("characterId") or "")
require(bool(project_name), "manifesto demo sem projeto")
require(launch.get("mode") == "game", "demo não inicia em modo jogo")
require(bool(character_id), "demo sem characterId")
require(launch.get("controls", {}).get("movementReference") == "camera", "demo não usa câmera como referência")

project_path = MANIFEST.parent / project_name
project_text = read(project_path)
try:
    project = json.loads(project_text or "{}")
except json.JSONDecodeError as error:
    errors.append(f"projeto demo inválido: {error}")
    project = {}
objects = project.get("scene", {}).get("objects", []) if isinstance(project, dict) else []
character = next((item for item in objects if item.get("id") == character_id), None)
require(character is not None, "characterId do manifesto não existe no projeto demo")
if character is not None:
    require(character.get("rotation") == [0, 0, 0, 1], "personagem demo não está com rotação identidade")

create = read(CREATE)
for token in [
    "DEFAULT_DEMO_MANIFEST_URL",
    "shouldOpenDefaultDemo(locationParameters)",
    "loadDefaultDemoProject()",
    "defaultDemoLaunch",
    "editor.selection.replace({",
]:
    require(token in create, f"bootstrap demo sem marcador: {token}")
main = read(MAIN)
for token in [
    "const recoveryStatus = await interfaceBinding.ready",
    "shouldStartDefaultDemoAfterRecovery(",
    'await application.runtime.execute("game.start"',
]:
    require(token in main, f"lançamento demo sem marcador: {token}")
require(
    'await commands.execute("game.start"' not in create,
    "bootstrap inicia jogo antes da recuperação",
)
require("Esfera 46" not in create, "bootstrap está acoplado ao nome atual do personagem demo")
require(character_id not in create, "bootstrap está acoplado ao ID atual do personagem demo")

index = read(INDEX)
bind = read(BIND)
require('id="game-character-visual-details"' in index, "HUD sem details nativo do visual do personagem")
require("<summary>Visual do personagem</summary>" in index, "HUD sem summary do visual do personagem")
for token in [
    'const characterVisualDetails = $("game-character-visual-details")',
    "characterVisualDetails.open = false",
    "characterVisualDetails.append(characterVisualPanel)",
    "unlockGameAudioFromGesture",
    'execute("game.audio.music.play", {})',
]:
    require(token in bind, f"polimento do demo ausente: {token}")

if errors:
    print("0054mf falhou:")
    for error in errors:
        print("-", error)
    raise SystemExit(1)

print(
    "Auditoria 0054mf aprovada: demo é dirigido por manifesto, personagem tem "
    "rotação identidade, inicia selecionado em jogo e painel visual é recolhível."
)
