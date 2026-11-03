#!/usr/bin/env bash
# Instala las herramientas en las versiones fijadas de versiones.json (Codespaces o devcontainer local).
set -euo pipefail
cd "$(dirname "$0")/.."

TOFU=$(node -p "require('./versiones.json').opentofu")
OPA=$(node -p "require('./versiones.json').opa")
TMP=$(mktemp -d)

echo "Instalando OpenTofu ${TOFU}..."
curl -fsSL -o "$TMP/tofu.zip" "https://github.com/opentofu/opentofu/releases/download/v${TOFU}/tofu_${TOFU}_linux_amd64.zip"
curl -fsSL -o "$TMP/sumas" "https://github.com/opentofu/opentofu/releases/download/v${TOFU}/tofu_${TOFU}_SHA256SUMS"
(cd "$TMP" && grep "tofu_${TOFU}_linux_amd64.zip" sumas | sed "s|tofu_${TOFU}_linux_amd64.zip|tofu.zip|" | sha256sum -c -)
sudo unzip -o -q "$TMP/tofu.zip" tofu -d /usr/local/bin

echo "Instalando OPA ${OPA}..."
curl -fsSL -o "$TMP/opa" "https://github.com/open-policy-agent/opa/releases/download/v${OPA}/opa_linux_amd64_static"
curl -fsSL -o "$TMP/opa.sha256" "https://github.com/open-policy-agent/opa/releases/download/v${OPA}/opa_linux_amd64_static.sha256"
(cd "$TMP" && echo "$(cut -d' ' -f1 opa.sha256)  opa" | sha256sum -c -)
sudo install -m 755 "$TMP/opa" /usr/local/bin/opa

rm -rf "$TMP"
[ -f .env ] || cp .env.example .env
npm ci
npm run esquema-proveedor
echo "Listo. Ejecuta: npm run doctor"
