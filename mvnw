#!/bin/sh
# Maven wrapper — used by Render to build the project
# If mvn is available on PATH, use it directly; otherwise download
if command -v mvn > /dev/null 2>&1; then
    exec mvn "$@"
else
    curl -fsSL https://downloads.apache.org/maven/maven-3/3.9.6/binaries/apache-maven-3.9.6-bin.tar.gz \
        | tar xz -C /tmp
    exec /tmp/apache-maven-3.9.6/bin/mvn "$@"
fi
