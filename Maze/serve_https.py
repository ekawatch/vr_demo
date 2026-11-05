# Serve this folder over https so a phone can actually use WebXR
# (WebXR needs a secure context: https or localhost — plain http on a LAN is not enough).
#
#   1) make a self-signed certificate once:
#      openssl req -x509 -newkey rsa:2048 -nodes -keyout key.pem -out cert.pem -days 30 -subj "/CN=maze.local"
#   2) run the server from this folder:
#      python3 serve_https.py 8443 key.pem cert.pem
#   3) on the phone open:  https://<computer-ip>:8443/
#      Chrome warns about the self-signed certificate -> Advanced -> Proceed.
import functools
import http.server
import ssl
import sys

port = int(sys.argv[1]) if len(sys.argv) > 1 else 8443
cert = sys.argv[2] if len(sys.argv) > 2 else "cert.pem"
key = sys.argv[3] if len(sys.argv) > 3 else "key.pem"

handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=sys.path[0])
srv = http.server.ThreadingHTTPServer(("0.0.0.0", port), handler)
ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
ctx.load_cert_chain(cert, key)
srv.socket = ctx.wrap_socket(srv.socket, server_side=True)
print("HTTPS on 0.0.0.0:%d — on the phone open https://<computer-ip>:%d/" % (port, port))
srv.serve_forever()
