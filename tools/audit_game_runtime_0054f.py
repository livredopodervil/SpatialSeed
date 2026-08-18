from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
checks = {
    "events": (ROOT / "packages/game-runtime/src/GameEventRuntime.js", "class GameEventRuntime"),
    "audio": (ROOT / "packages/game-runtime/src/GameAudioRuntime.js", "class GameAudioRuntime"),
    "wall-jump": (ROOT / "packages/game-runtime/src/CharacterPhysics.js", "supportProbeBody"),
    "pagehide": (ROOT / "apps/web/bootstrap/bindWebInterface.js", "prepareGamePageExit"),
    "event-command": (ROOT / "apps/web/bootstrap/createWebRuntime.js", '"game.events.configure"'),
}
failed=[]
for name,(path,needle) in checks.items():
    if needle not in path.read_text(): failed.append(name)
if failed:
    raise SystemExit("0054f audit failed: " + ", ".join(failed))
print("0054f game runtime audit: ok")
