#!/data/data/com.termux/files/usr/bin/bash
set -e

VERSION="0.185.0"
BASE="https://unpkg.com/three@${VERSION}"

mkdir -p vendor/addons/controls vendor/addons/loaders

curl -fL "${BASE}/build/three.module.js" \
  -o vendor/three.module.js

curl -fL "${BASE}/build/three.core.js" \
  -o vendor/three.core.js

curl -fL "${BASE}/examples/jsm/controls/OrbitControls.js" \
  -o vendor/addons/controls/OrbitControls.js

curl -fL "${BASE}/examples/jsm/controls/TransformControls.js" \
  -o vendor/addons/controls/TransformControls.js

curl -fL "${BASE}/examples/jsm/loaders/GLTFLoader.js" \
  -o vendor/addons/loaders/GLTFLoader.js

echo "Three.js instalado."
