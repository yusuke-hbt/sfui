#!/usr/bin/env python3
# 開発用の静的サーバー。ES Module は更新したファイルだけ新しく、残りは古いキャッシュ、という組み合わせになると
# 動作が食い違うので、常にキャッシュを使わせない。
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCache(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    ThreadingHTTPServer(('', port), NoCache).serve_forever()
