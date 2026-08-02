#!/data/data/com.termux/files/usr/bin/python
"""Serve the checked-out SpatialSeed worktree over no-cache HTTPS."""

from __future__ import annotations

import argparse
from functools import partial
import ipaddress
import json
import os
from pathlib import Path
import shutil
import socket
import ssl
import subprocess
import tempfile
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_PORT = 8082
DEFAULT_TLS_DIR = Path(
    os.environ.get(
        "SPATIALSEED_TLS_DIR",
        Path.home() / ".local" / "share" / "spatialseed" / "tls",
    )
).expanduser()


class NoCacheHandler(SimpleHTTPRequestHandler):
    """Static handler with deterministic cache and URL behavior."""

    def parse_request(self) -> bool:
        parsed = super().parse_request()
        self._canonical_redirect_target = None
        if not parsed:
            return False
        fields = self.requestline.split()
        if len(fields) >= 2:
            target = canonical_request_target(fields[1])
            if target != fields[1]:
                self._canonical_redirect_target = target
        return True

    def do_GET(self) -> None:  # noqa: N802 - stdlib callback name
        if self._redirect_noncanonical_path():
            return
        super().do_GET()

    def do_HEAD(self) -> None:  # noqa: N802 - stdlib callback name
        if self._redirect_noncanonical_path():
            return
        super().do_HEAD()

    def end_headers(self) -> None:
        self.send_header(
            "Cache-Control",
            "no-store, no-cache, must-revalidate, max-age=0",
        )
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def _redirect_noncanonical_path(self) -> bool:
        target = self._canonical_redirect_target
        if target is None:
            return False
        self.send_response(308)
        self.send_header("Location", target)
        self.send_header("Content-Length", "0")
        self.end_headers()
        return True


class ThreadingIPv6HTTPServer(ThreadingHTTPServer):
    address_family = socket.AF_INET6

    def server_bind(self) -> None:
        try:
            self.socket.setsockopt(
                socket.IPPROTO_IPV6,
                socket.IPV6_V6ONLY,
                0,
            )
        except OSError:
            pass
        super().server_bind()


def canonical_request_target(target: str) -> str:
    """Collapse duplicate leading slashes without changing query parameters."""

    path, separator, query = target.partition("?")
    canonical = "/" + path.lstrip("/")
    return f"{canonical}{separator}{query}" if separator else canonical


def detected_ip_addresses(*, include_network: bool) -> tuple[str, ...]:
    addresses = {"127.0.0.1", "::1"}
    if include_network:
        addresses.update(_addresses_from_ip_command())
        addresses.update(_addresses_from_proc_inet6())
        addresses.update(_addresses_from_route_probe())
        try:
            results = socket.getaddrinfo(
                socket.gethostname(),
                None,
                socket.AF_UNSPEC,
                socket.SOCK_STREAM,
            )
        except OSError:
            results = ()
        for result in results:
            addresses.add(result[4][0].split("%", 1)[0])
    return tuple(sorted(
        (value for value in addresses if _usable_ip_address(value)),
        key=lambda value: (ipaddress.ip_address(value).version, value),
    ))


def _addresses_from_ip_command() -> set[str]:
    if not shutil.which("ip"):
        return set()
    try:
        result = subprocess.run(
            ["ip", "-j", "address", "show", "up"],
            check=True,
            capture_output=True,
            text=True,
        )
        interfaces = json.loads(result.stdout)
    except (OSError, subprocess.CalledProcessError, json.JSONDecodeError):
        return set()
    addresses = set()
    for interface in interfaces:
        for entry in interface.get("addr_info", ()):  # pragma: no branch
            value = str(entry.get("local", "")).split("%", 1)[0]
            if value:
                addresses.add(value)
    return addresses


def _addresses_from_proc_inet6() -> set[str]:
    source = Path("/proc/net/if_inet6")
    try:
        lines = source.read_text(encoding="ascii").splitlines()
    except OSError:
        return set()
    addresses = set()
    for line in lines:
        fields = line.split()
        if not fields:
            continue
        try:
            addresses.add(str(ipaddress.IPv6Address(int(fields[0], 16))))
        except ValueError:
            continue
    return addresses


def _addresses_from_route_probe() -> set[str]:
    addresses = set()
    probes = (
        (socket.AF_INET, ("192.0.2.1", 9)),
        (socket.AF_INET6, ("2001:db8::1", 9)),
    )
    for family, target in probes:
        try:
            with socket.socket(family, socket.SOCK_DGRAM) as probe:
                probe.connect(target)
                addresses.add(probe.getsockname()[0].split("%", 1)[0])
        except OSError:
            continue
    return addresses


def _usable_ip_address(value: str) -> bool:
    try:
        address = ipaddress.ip_address(value)
    except ValueError:
        return False
    return not (address.is_unspecified or address.is_multicast or address.is_link_local)


def ensure_tls_material(
    tls_dir: Path,
    addresses: tuple[str, ...],
) -> tuple[Path, Path, Path, bool]:
    """Create or refresh a local CA and a server certificate for the SAN set."""

    openssl = shutil.which("openssl")
    if not openssl:
        raise RuntimeError(
            "OpenSSL não foi encontrado; instale-o ou use --http explicitamente."
        )

    tls_dir.mkdir(parents=True, exist_ok=True)
    try:
        tls_dir.chmod(0o700)
    except OSError:
        pass

    ca_key = tls_dir / "SpatialSeed-local-CA.key"
    ca_cert = tls_dir / "SpatialSeed-local-CA.crt"
    server_key = tls_dir / "SpatialSeed-local-server.key"
    server_cert = tls_dir / "SpatialSeed-local-server.crt"
    san_state = tls_dir / "SpatialSeed-local-server.san"
    expected_sans = "\n".join(addresses) + "\n"
    created_ca = False

    if not ca_key.is_file() or not ca_cert.is_file():
        for path in (ca_key, ca_cert, server_key, server_cert, san_state):
            path.unlink(missing_ok=True)
        _run(
            openssl,
            "req",
            "-x509",
            "-newkey",
            "rsa:3072",
            "-sha256",
            "-days",
            "3650",
            "-nodes",
            "-subj",
            "/CN=SpatialSeed Local Development CA",
            "-addext",
            "basicConstraints=critical,CA:TRUE",
            "-addext",
            "keyUsage=critical,keyCertSign,cRLSign",
            "-keyout",
            str(ca_key),
            "-out",
            str(ca_cert),
        )
        created_ca = True

    certificate_current = (
        server_key.is_file()
        and server_cert.is_file()
        and san_state.is_file()
        and san_state.read_text(encoding="utf-8") == expected_sans
        and subprocess.run(
            [openssl, "x509", "-checkend", "604800", "-noout", "-in", str(server_cert)],
            capture_output=True,
        ).returncode == 0
    )
    if not certificate_current:
        _issue_server_certificate(
            openssl=openssl,
            ca_key=ca_key,
            ca_cert=ca_cert,
            server_key=server_key,
            server_cert=server_cert,
            addresses=addresses,
            tls_dir=tls_dir,
        )
        san_state.write_text(expected_sans, encoding="utf-8")

    for path in (ca_key, server_key):
        try:
            path.chmod(0o600)
        except OSError:
            pass
    return server_cert, server_key, ca_cert, created_ca


def _issue_server_certificate(
    *,
    openssl: str,
    ca_key: Path,
    ca_cert: Path,
    server_key: Path,
    server_cert: Path,
    addresses: tuple[str, ...],
    tls_dir: Path,
) -> None:
    alt_names = ["DNS.1 = localhost"]
    alt_names.extend(
        f"IP.{index} = {address}"
        for index, address in enumerate(addresses, start=1)
    )
    config = "\n".join((
        "[req]",
        "distinguished_name = subject",
        "prompt = no",
        "req_extensions = server_extensions",
        "[subject]",
        "CN = SpatialSeed local development server",
        "[server_extensions]",
        "basicConstraints = critical,CA:FALSE",
        "keyUsage = critical,digitalSignature,keyEncipherment",
        "extendedKeyUsage = serverAuth",
        "subjectAltName = @alt_names",
        "[alt_names]",
        *alt_names,
        "",
    ))

    with tempfile.TemporaryDirectory(dir=tls_dir) as temporary:
        temporary_dir = Path(temporary)
        config_path = temporary_dir / "server.cnf"
        request_path = temporary_dir / "server.csr"
        next_key = temporary_dir / "server.key"
        next_cert = temporary_dir / "server.crt"
        config_path.write_text(config, encoding="utf-8")
        _run(
            openssl,
            "req",
            "-new",
            "-newkey",
            "rsa:2048",
            "-nodes",
            "-config",
            str(config_path),
            "-keyout",
            str(next_key),
            "-out",
            str(request_path),
        )
        _run(
            openssl,
            "x509",
            "-req",
            "-in",
            str(request_path),
            "-CA",
            str(ca_cert),
            "-CAkey",
            str(ca_key),
            "-set_serial",
            str(int.from_bytes(os.urandom(16), "big")),
            "-days",
            "825",
            "-sha256",
            "-extfile",
            str(config_path),
            "-extensions",
            "server_extensions",
            "-out",
            str(next_cert),
        )
        os.replace(next_key, server_key)
        os.replace(next_cert, server_cert)


def _run(executable: str, *arguments: str) -> None:
    subprocess.run(
        [executable, *arguments],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        text=True,
    )


def export_ca_certificate(ca_cert: Path) -> Path | None:
    downloads = Path.home() / "storage" / "downloads"
    if not downloads.is_dir():
        return None
    destination = downloads / "SpatialSeed-local-CA.crt"
    if not destination.exists() or destination.read_bytes() != ca_cert.read_bytes():
        shutil.copyfile(ca_cert, destination)
    return destination


def create_server(
    *,
    project_root: Path,
    bind: str,
    port: int,
    certificate: Path | None,
    private_key: Path | None,
) -> ThreadingHTTPServer:
    server_class = ThreadingIPv6HTTPServer if ":" in bind else ThreadingHTTPServer
    handler = partial(NoCacheHandler, directory=str(project_root))
    server = server_class((bind, port), handler)
    if certificate and private_key:
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        context.minimum_version = ssl.TLSVersion.TLSv1_2
        context.load_cert_chain(certificate, private_key)
        server.socket = context.wrap_socket(server.socket, server_side=True)
    return server


def format_url(host: str, port: int, *, secure: bool) -> str:
    display_host = f"[{host}]" if ":" in host else host
    scheme = "https" if secure else "http"
    return f"{scheme}://{display_host}:{port}/apps/web/"


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Serve o worktree SpatialSeed atual sem cache.",
    )
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    parser.add_argument(
        "--network",
        action="store_true",
        help="expõe também interfaces IPv4/IPv6 para teste em outro aparelho",
    )
    parser.add_argument(
        "--http",
        action="store_true",
        help="desativa TLS explicitamente; o padrão é HTTPS",
    )
    parser.add_argument("--tls-dir", type=Path, default=DEFAULT_TLS_DIR)
    return parser.parse_args()


def main() -> int:
    args = parse_arguments()
    bind = "::" if args.network else "127.0.0.1"
    addresses = detected_ip_addresses(include_network=args.network)
    certificate = private_key = ca_cert = None
    created_ca = False
    if not args.http:
        certificate, private_key, ca_cert, created_ca = ensure_tls_material(
            args.tls_dir.expanduser(),
            addresses,
        )

    server = create_server(
        project_root=PROJECT_ROOT,
        bind=bind,
        port=args.port,
        certificate=certificate,
        private_key=private_key,
    )
    actual_port = server.server_address[1]
    secure = certificate is not None

    print(f"SpatialSeed servido de: {PROJECT_ROOT}")
    print(f"Aplicação: {format_url('127.0.0.1', actual_port, secure=secure)}")
    if args.network:
        for address in addresses:
            if address not in {"127.0.0.1", "::1"}:
                print(f"Rede:      {format_url(address, actual_port, secure=secure)}")
    if ca_cert:
        exported = export_ca_certificate(ca_cert)
        print(f"CA local:  {exported or ca_cert}")
        if created_ca:
            print("Instale essa CA no Android antes do primeiro acesso HTTPS.")
    print("Perfil diagnóstico: acrescente ?application=diagnostics")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor encerrado.")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
