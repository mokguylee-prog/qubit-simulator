#!/bin/bash
PORT=${1:-8080}
echo "http://localhost:$PORT 에서 실행 중..."
open "http://localhost:$PORT"
python3 -m http.server "$PORT"
