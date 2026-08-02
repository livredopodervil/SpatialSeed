#!/data/data/com.termux/files/usr/bin/bash
set -Eeuo pipefail

script_dir="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
exec python "$script_dir/no_cache_server.py" --network "$@"
