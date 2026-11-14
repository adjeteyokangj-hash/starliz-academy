#!/bin/sh
set -eu
cd /mnt/c/Users/edwar/Documents/Projects/starliz-academy
export PATH=/usr/bin:/usr/sbin:/bin:/sbin
export DOCKER_HOST=unix:///var/run/docker.sock
export CODING_RUNNER_CONTAINER_TESTS=1
export CODING_RUNNER_CONTAINER_TEST_RUNTIME=runsc
CODING_RUNNER_PYTHON_IMAGE=$(docker image inspect --format '{{index .RepoDigests 0}}' python:3.12-slim)
CODING_RUNNER_JAVASCRIPT_IMAGE=$(docker image inspect --format '{{index .RepoDigests 0}}' node:22-slim)
export CODING_RUNNER_PYTHON_IMAGE CODING_RUNNER_JAVASCRIPT_IMAGE
node --test tests/coding_runner_containers.test.mjs
