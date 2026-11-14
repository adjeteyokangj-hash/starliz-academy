#!/bin/sh
set -eu
cd /mnt/c/Users/edwar/Documents/Projects/starliz-academy
export PATH=/usr/bin:/usr/sbin:/bin:/sbin
export DOCKER_HOST=unix:///var/run/docker.sock
export CODING_RUNNER_CONTAINER_TESTS=1
export CODING_RUNNER_CONTAINER_TEST_RUNTIME=runsc
export CODING_RUNNER_PYTHON_IMAGE=python@sha256:b18b261e1b4974b4f321451ad5251ded85abb22c2b8b262da527dda1d031ab30
export CODING_RUNNER_JAVASCRIPT_IMAGE=sha256:4dda2383bfc88c245be66c59a6f7cebbdd593111c349d1f34c3e43ae179e3457
node --test tests/coding_runner_containers.test.mjs
