#!/bin/sh
# Local test tooling only. Invoke as a file to avoid Windows/WSL nested quoting.
set -eu
task_dir=$(mktemp -d /tmp/starliz-coding-gvisor.XXXXXX)
cd "$task_dir"
release=https://storage.googleapis.com/gvisor/releases/release/latest/x86_64
curl -fL --connect-timeout 15 --max-time 240 -O "$release/gvisor.tar.bz2"
curl -fL --connect-timeout 15 --max-time 30 -O "$release/gvisor.tar.bz2.sha512"
sha512sum -c gvisor.tar.bz2.sha512
test ! -e /opt/starliz-coding-test-gvisor
mkdir /opt/starliz-coding-test-gvisor
tar -xjf gvisor.tar.bz2 -C /opt/starliz-coding-test-gvisor
/opt/starliz-coding-test-gvisor/runsc --version
printf 'Verified local gVisor tooling. Download evidence: %s\n' "$task_dir"
