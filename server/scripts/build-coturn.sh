#!/bin/bash
# Builds coturn from the upstream release tarball into /usr/local/bin: the apt package stops at 4.6.1, which has open CVEs
# (HANDOFF.md, the US relay). The apt package is still installed first and kept: it creates the turnserver user, ships
# turnutils_*, and its dependencies keep the libevent/libssl runtime libraries from leaving with the build tools at the end.
# Run with sudo. Idempotent: a box already holding VERSION stops after the version line. On an upstream security release:
# bump VERSION, download the tarball, hash it, compare with an independent copy (Debian's orig tarball unpacks to the same
# tree), set SHA256, rerun on each relay, restart hush-turn.
set -euo pipefail
VERSION=4.18.0
SHA256=28d55294ac596fbd129b293a85e7bb1c5dc4bd15b7fb55c500f355149e5f4e28
URL="https://github.com/coturn/coturn/archive/refs/tags/$VERSION.tar.gz"
BUILD_DEPS="build-essential libssl-dev libevent-dev pkg-config"
BIN=/usr/local/bin/turnserver
die() { echo "build-coturn: $*" >&2; exit 1; }
# 4.18 has no working --version (it prints the usage), so the version is read from the binary's own banner string
version() { grep -ao "Coturn-[0-9.]* '[A-Za-z]*'" "$BIN" | head -1; }

[ "$(id -u)" = 0 ] || die "run with sudo"
grep -q '^ID=ubuntu' /etc/os-release || die "not Ubuntu"
export DEBIAN_FRONTEND=noninteractive

# masked before it is installed, or the package starts coturn.service with its default config, open on 3478
systemctl mask coturn.service >/dev/null
apt-get install -y --no-install-recommends coturn curl
id turnserver >/dev/null 2>&1 || die "the coturn package did not create the turnserver user"
[ "$(systemctl is-enabled coturn.service)" = masked ] || die "coturn.service is not masked"

if [ -x "$BIN" ] && grep -aq "Coturn-$VERSION '" "$BIN"; then echo "already built: $(version)"; exit 0; fi

apt-get install -y --no-install-recommends $BUILD_DEPS
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
curl -fsSL --retry 3 -o "$tmp/coturn.tar.gz" "$URL"
echo "$SHA256  $tmp/coturn.tar.gz" | sha256sum -c --status - || die "the tarball's sha256 is not the pinned one; nothing installed"
tar -xzf "$tmp/coturn.tar.gz" -C "$tmp"
(cd "$tmp/coturn-$VERSION" && ./configure --prefix=/usr/local && make -j"$(nproc)" && make install)
apt-get purge -y $BUILD_DEPS
apt-get autoremove --purge -y
grep -aq "Coturn-$VERSION '" "$BIN" || die "$BIN does not carry version $VERSION"
echo "built: $(version)"
