#!/usr/bin/env python3
"""Regression tests for the canonical SpatialSeed development server."""

from __future__ import annotations

import importlib.util
from pathlib import Path
import socket
import ssl
import subprocess
import tempfile
import threading
import unittest
from urllib.request import urlopen


ROOT = Path(__file__).resolve().parents[1]
SERVER_PATH = ROOT / "tools" / "no_cache_server.py"
SPEC = importlib.util.spec_from_file_location("spatialseed_no_cache_server", SERVER_PATH)
assert SPEC and SPEC.loader
SERVER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SERVER)


class NoCacheServerTests(unittest.TestCase):
    def test_server_root_is_the_worktree_that_contains_the_script(self) -> None:
        self.assertEqual(SERVER.PROJECT_ROOT, ROOT)

    def test_duplicate_leading_slashes_are_redirected_to_the_canonical_path(self) -> None:
        self.assertEqual(
            SERVER.canonical_request_target(
                "//apps/web/?application=diagnostics"
            ),
            "/apps/web/?application=diagnostics",
        )
        self.assertEqual(
            SERVER.canonical_request_target(
                "/apps/web/?application=diagnostics"
            ),
            "/apps/web/?application=diagnostics",
        )

    def test_https_server_uses_a_reusable_ca_and_serves_the_current_worktree(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            tls_dir = Path(temporary) / "tls"
            certificate, private_key, ca_cert, created = SERVER.ensure_tls_material(
                tls_dir,
                ("127.0.0.1", "::1"),
            )
            self.assertTrue(created)
            repeated = SERVER.ensure_tls_material(
                tls_dir,
                ("127.0.0.1", "::1"),
            )
            self.assertFalse(repeated[3])
            certificate_text = subprocess.run(
                [
                    "openssl",
                    "x509",
                    "-in",
                    str(certificate),
                    "-noout",
                    "-ext",
                    "subjectAltName",
                ],
                check=True,
                capture_output=True,
                text=True,
            ).stdout
            self.assertIn("IP Address:127.0.0.1", certificate_text)
            self.assertIn("IP Address:0:0:0:0:0:0:0:1", certificate_text)

            server = SERVER.create_server(
                project_root=ROOT,
                bind="127.0.0.1",
                port=0,
                certificate=certificate,
                private_key=private_key,
            )
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                context = ssl.create_default_context(cafile=str(ca_cert))
                url = (
                    f"https://127.0.0.1:{server.server_address[1]}"
                    "/apps/web/build-info.json"
                )
                with urlopen(url, context=context, timeout=5) as response:
                    self.assertEqual(response.status, 200)
                    self.assertIn(
                        "no-store",
                        response.headers["Cache-Control"],
                    )
                    self.assertIn(b'"build"', response.read())

                with socket.create_connection(
                    ("127.0.0.1", server.server_address[1]),
                    timeout=5,
                ) as connection:
                    with context.wrap_socket(
                        connection,
                        server_hostname="127.0.0.1",
                    ) as secured:
                        secured.sendall(
                            b"HEAD //apps/web/?application=diagnostics HTTP/1.1\r\n"
                            b"Host: 127.0.0.1\r\n"
                            b"Connection: close\r\n\r\n"
                        )
                        response = bytearray()
                        while chunk := secured.recv(4096):
                            response.extend(chunk)
                headers = response.decode("iso-8859-1")
                self.assertIn("HTTP/1.0 308 Permanent Redirect", headers)
                self.assertIn(
                    "Location: /apps/web/?application=diagnostics",
                    headers,
                )
            finally:
                server.shutdown()
                server.server_close()
                thread.join(timeout=5)

    def test_network_mode_accepts_ipv6_loopback_when_available(self) -> None:
        if not socket.has_ipv6:
            self.skipTest("IPv6 indisponível neste ambiente")
        with tempfile.TemporaryDirectory() as temporary:
            certificate, private_key, ca_cert, _ = SERVER.ensure_tls_material(
                Path(temporary) / "tls",
                ("127.0.0.1", "::1"),
            )
            try:
                server = SERVER.create_server(
                    project_root=ROOT,
                    bind="::",
                    port=0,
                    certificate=certificate,
                    private_key=private_key,
                )
            except OSError as error:
                self.skipTest(f"bind IPv6 indisponível: {error}")
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                context = ssl.create_default_context(cafile=str(ca_cert))
                with socket.create_connection(
                    ("::1", server.server_address[1]),
                    timeout=5,
                ) as connection:
                    with context.wrap_socket(
                        connection,
                        server_hostname="::1",
                    ) as secured:
                        secured.sendall(
                            b"HEAD /apps/web/ HTTP/1.1\r\n"
                            b"Host: [::1]\r\n"
                            b"Connection: close\r\n\r\n"
                        )
                        response = secured.recv(4096).decode("iso-8859-1")
                self.assertIn("HTTP/1.0 200 OK", response)
            finally:
                server.shutdown()
                server.server_close()
                thread.join(timeout=5)


if __name__ == "__main__":
    unittest.main()
