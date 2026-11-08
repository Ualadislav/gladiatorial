#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Запустите скрипт от root: sudo bash scripts/install-ubuntu.sh" >&2
  exit 1
fi

if [[ ! -f "compose.yaml" || ! -f "apps/server/Dockerfile" ]]; then
  echo "Скрипт нужно запускать из корня проекта Gladiators." >&2
  exit 1
fi

if [[ ! -x "$(command -v docker || true)" ]] || ! docker compose version >/dev/null 2>&1; then
  echo "Устанавливаю Docker Engine и Docker Compose из официального репозитория..."
  apt-get update
  apt-get install -y ca-certificates curl
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  . /etc/os-release
  architecture="$(dpkg --print-architecture)"
  printf 'Types: deb\nURIs: https://download.docker.com/linux/ubuntu\nSuites: %s\nComponents: stable\nArchitectures: %s\nSigned-By: /etc/apt/keyrings/docker.asc\n' \
    "${UBUNTU_CODENAME:-$VERSION_CODENAME}" "${architecture}" \
    > /etc/apt/sources.list.d/docker.sources
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
systemctl enable --now docker

if [[ ! -f .env ]]; then
  read -r -p "Домен игры (A-запись уже должна указывать на этот сервер; оставьте пустым для локальной проверки): " app_domain
  if [[ -z "${app_domain}" ]]; then
    echo "Для Telegram Mini App потребуется домен с HTTPS. Сейчас будет запущен локальный предпросмотр."
    read -r -s -p "Токен Telegram-бота от @BotFather: " bot_token
    printf '\n'
  else
    read -r -s -p "Токен Telegram-бота от @BotFather: " bot_token
    printf '\n'
  fi
  if [[ -z "${bot_token}" ]]; then
    echo "Для production API необходим токен Telegram-бота." >&2
    exit 1
  fi
  if ! command -v openssl >/dev/null 2>&1; then
    apt-get install -y openssl
  fi
  postgres_password="$(openssl rand -hex 32)"
  if [[ -n "${app_domain}" ]]; then
    web_origin="https://${app_domain}"
  else
    web_origin="http://localhost:8080"
  fi
  umask 077
  cat > .env <<EOF
POSTGRES_DB=gladiators
POSTGRES_USER=gladiators
POSTGRES_PASSWORD=${postgres_password}
TELEGRAM_BOT_TOKEN=${bot_token}
APP_DOMAIN=${app_domain}
WEB_ORIGIN=${web_origin}
EOF
  chmod 600 .env
  unset bot_token postgres_password
fi

echo "Проверяю конфигурацию Docker Compose..."
docker compose config -q

if grep -Eq '^APP_DOMAIN=.+\..+' .env; then
  echo "Запускаю приложение с HTTPS через Caddy..."
  docker compose --profile public up -d --build
else
  echo "Запускаю локальный предпросмотр на порту 8080..."
  docker compose up -d --build
fi

echo
docker compose ps
echo
echo "Логи сервера: docker compose logs -f server"
if grep -Eq '^APP_DOMAIN=.+\..+' .env; then
  echo "После выпуска HTTPS-сертификата откройте домен из .env в Telegram."
else
  echo "Предпросмотр: http://localhost:8080 — доступен только на этом сервере."
  echo "Добавьте домен в .env и запустите: docker compose --profile public up -d"
fi
