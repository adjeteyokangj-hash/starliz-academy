#!/bin/sh
# Configure only the newly installed Ubuntu test engine, never Docker Desktop.
set -eu
test -x /opt/starliz-coding-test-gvisor/runsc
test -x /usr/bin/dockerd
if test -e /etc/docker/daemon.json; then
  printf 'Existing Docker configuration preserved; inspect it before adding a runtime.\n' >&2
  exit 1
fi
mkdir -p /etc/docker
set -C
cat > /etc/docker/daemon.json <<'JSON'
{"runtimes":{"runsc":{"path":"/opt/starliz-coding-test-gvisor/runsc","runtimeArgs":["--platform=systrap"]}}}
JSON
systemctl restart docker
export DOCKER_HOST=unix:///var/run/docker.sock
/usr/bin/docker info --format '{{json .Runtimes}}'
/usr/bin/docker pull --platform=linux/amd64 python:3.12-slim
/usr/bin/docker pull --platform=linux/amd64 node:22-slim
/usr/bin/docker image inspect --format '{{index .RepoDigests 0}}' python:3.12-slim node:22-slim
