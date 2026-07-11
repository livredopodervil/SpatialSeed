# Spatial Seed WebGL Core

Descompacte o conteúdo dentro de `~/storage/shared/SpatialSeed`.

Depois:

```bash
cd ~/storage/shared/SpatialSeed
bash install-vendor.sh
python -m http.server 8080 --bind 127.0.0.1
```

Abra `http://127.0.0.1:8080`.

Controles:
- um dedo: orbitar;
- dois dedos: pan e dolly;
- toque numa caixa: selecionar;
- botões Mover, Girar e Escalar: alternam o gizmo;
- Mundo/Local: altera a orientação dos eixos.
