#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

checks = {
    "packages/animation-runtime/src/TemporalAnimationRuntime.js": [
        "this.instances = new Map()",
        "overlayId",
        "sceneChanged(changes = [])",
        "stopAll",
        "instanceCount",
        "Instâncias podem compartilhar alvos",
    ],
    "packages/renderer-three/src/ThreeRegionRenderer.js": [
        "#animationOverlays = new Map()",
        "#animationObjectOverlayIds = new Map()",
        "composeAnimationLayer",
        "animation-frame:",
        "activeOverlays",
    ],
    "packages/local-viewers/src/LocalAnimationCoordinator.js": [
        "adapter.sceneChanged",
        "sharedAffected === false",
    ],
    "packages/animation-runtime/src/AnimationCommandService.js": [
        "animation-command-service-v4-independent-instances",
        "sharedRuntimeInstanceId",
        "sceneChanged(changes = [], session = null)",
    ],
    "packages/animation-panel/src/AnimationPanel.js": [
        "data-animation-instances",
        "animation.instance.pause",
        "animation.instance.stop",
    ],
}

missing = []
for relative, markers in checks.items():
    path = ROOT / relative
    if not path.is_file():
        missing.append(f"arquivo ausente: {relative}")
        continue
    text = path.read_text(encoding="utf-8")
    for marker in markers:
        if marker not in text:
            missing.append(f"{relative}: marcador ausente: {marker}")

if missing:
    raise SystemExit("\n".join(missing))
print("Auditoria de overlays independentes: aprovada.")
