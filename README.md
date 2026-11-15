# Gladiators Mini App

Telegram Mini App: короткие дуэли 1 на 1, блок/контра, прокачка, локальный прогресс.

## Android APK

**Не качай** артефакт у **Deploy GitHub Pages** — там `artifact.tar` (это сайт, не APK).

Нужно так:

1. https://github.com/Ualadislav/gladiatorial/actions → только **Build Android APK** (зелёный).
2. Внизу **Artifacts** → **Gladiators-debug-apk** → скачается ZIP.
3. Внутри файл **`Gladiators-debug.apk`** — его и ставь на телефон.

Ещё проще: вкладка **Releases** в репо — там же `Gladiators-debug.apk` после каждого успешного билда.

Локально (нужны JDK 17+ и Android SDK):

```powershell
npm run build:apk-assets
cd apps/web/android
.\gradlew.bat assembleDebug
```

APK: `apps/web/android/app/build/outputs/apk/debug/app-debug.apk`.

## Android / Telegram через GitHub Pages

После пуша в `main` GitHub Actions также собирает сайт:

**https://ualadislav.github.io/gladiatorial/**

1. Repo → **Settings → Pages** → Source: **GitHub Actions** (один раз).
2. Дождись зелёного workflow **Deploy GitHub Pages**.
3. На Android открой ссылку в Chrome **или** в [@BotFather](https://t.me/BotFather) укажи этот URL как Mini App / Web App бота и открой бота в Telegram.

Локально `npm run dev` по-прежнему на `/` без префикса репозитория.

## Запуск на этом компьютере (Windows 10)

На этом компьютере проект первоначально находился в `H:\#Prpjects\gladiators`. **Перед запуском переместите только папку `gladiators` в путь без символа `#`**, например `H:\Projects\gladiators`. Vite некорректно разрешает файлы проекта, если `#` есть в пути. Не переименовывайте родительскую папку `#Prpjects`, если в ней лежат другие проекты.

Создайте `H:\Projects`, если этой папки ещё нет, и перенесите в неё папку `gladiators` через Проводник Windows. После переноса все команды ниже запускайте из нового расположения:

```powershell
Set-Location -LiteralPath 'H:\Projects\gladiators'
```

На компьютере уже установлены Node.js 26.13.0, npm 11.20.0 и Docker Desktop. Для первого запуска достаточно Node.js и npm; Docker, бот Telegram и домен не нужны.

### 1. Откройте PowerShell и перейдите в проект

```powershell
Set-Location -LiteralPath 'H:\Projects\gladiators'
```

### 2. Проверьте доступ к официальному реестру npm

Ранее на этом компьютере запрос к `registry.npmjs.org` завершался по тайм-ауту. Если у вас включён VPN, проверьте соединение и настройки npm:

```powershell
npm config get registry
npm config get proxy
npm config get https-proxy
Test-NetConnection registry.npmjs.org -Port 443
npm ping
```

Для `npm config get registry` ожидается `https://registry.npmjs.org/`. Если доступ не работает, попробуйте повторить проверки после изменения VPN или подключения к другой сети. Не нужно отключать рабочий VPN или менять настройки сети, если это запрещено вашей организацией.

### 3. Скачайте зависимости и запустите игру

```powershell
npm install --registry=https://registry.npmjs.org/
npm run dev
```

Если npm предупредит, что скрипт установки `esbuild` ещё не разрешён, сначала проверьте пакет и разрешите этот скрипт, затем завершите установку:

```powershell
npm install-scripts ls
npm install-scripts approve esbuild
npm install
```

Не закрывая окно PowerShell, откройте напечатанный Vite адрес — обычно [http://localhost:5173](http://localhost:5173) — в браузере. В обычном браузере игра запускается автономно: прогресс хранится в локальном хранилище этого браузера. Telegram-бот и токен для этого не нужны.

### 4. Проверьте типы и production-сборку

Остановите сервер разработки сочетанием `Ctrl+C`, затем выполните:

```powershell
npm run typecheck
npm run build
```

Чтобы снова открыть игру в режиме разработки, выполните `npm run dev`. Чтобы очистить сохранённый локальный прогресс, откройте инструменты разработчика браузера, перейдите в Application → Local Storage, выберите адрес `localhost:5173` и удалите ключ `gladiators.profile.v1`.

### Если `npm install` всё ещё не работает

Скопируйте текст ошибки npm для диагностики и проверьте DNS и доступ по HTTPS:

```powershell
Resolve-DnsName registry.npmjs.org
Test-NetConnection registry.npmjs.org -Port 443
npm ping --registry=https://registry.npmjs.org/
```

Если установку прервали, после восстановления доступа повторите `npm install --registry=https://registry.npmjs.org/`. Удалять `package-lock.json` или очищать весь npm-кэш без конкретной ошибки не требуется.

## Локальный API и PostgreSQL (необязательно)

Для обычного запуска игры этот раздел пропустите. Для локальной проверки API нужны Docker Desktop и отдельное окно PowerShell.

Запустите локальную базу данных:

```powershell
docker run --name gladiators-db `
  -e POSTGRES_USER=gladiators `
  -e POSTGRES_PASSWORD=gladiators-local `
  -e POSTGRES_DB=gladiators `
  -p 5432:5432 `
  -d postgres:17-alpine
```

В новом окне PowerShell задайте переменные и запустите API:

```powershell
Set-Location -LiteralPath 'H:\Projects\gladiators'
$env:ALLOW_DEV_AUTH = 'true'
$env:DATABASE_URL = 'postgres://gladiators:gladiators-local@localhost:5432/gladiators'
$env:WEB_ORIGIN = 'http://localhost:5173'
npm run dev:server
```

Проверка API в другом окне:

```powershell
Invoke-RestMethod http://localhost:3000/api/health
```

Для остановки API нажмите `Ctrl+C`. Остановить базу данных, сохранив её данные:

```powershell
docker stop gladiators-db
```

При следующем запуске базы используйте `docker start gladiators-db`. Удалять контейнер командой `docker rm` стоит только если локальную базу больше не нужно сохранять.

## Развёртывание на Ubuntu VPS

На сервере нужен домен с A-записью на белый IP VPS. Откройте входящие TCP-порты **80 и 443** в firewall сервера и провайдера; оставьте доступным SSH.

Скопируйте проект на VPS. Из корня проекта запустите:

```bash
sudo bash scripts/install-ubuntu.sh
```

Скрипт установит Docker Engine и Docker Compose Plugin, спросит домен и токен бота, сгенерирует пароль PostgreSQL и запустит приложение. Создайте бота через [@BotFather](https://t.me/BotFather). Caddy автоматически получит и будет продлевать HTTPS-сертификат; настройте URL Mini App у бота на HTTPS-адрес игры.

Файл `.env` содержит секреты — не отправляйте его посторонним и не добавляйте в Git. PostgreSQL не публикуется во внешний интернет.

Основные команды на VPS:

```bash
docker compose ps
docker compose logs -f server
docker compose --profile public up -d --build
```

## Стек и ограничения MVP

- **Игра:** Phaser 3, TypeScript, Vite.
- **API:** Node.js, Fastify, PostgreSQL.
- **Развёртывание:** Docker Compose и Caddy с HTTPS.
- **Авторизация:** API проверяет подпись Telegram `initData`; локальная разработка поддерживает тестовый режим.
- Бой с ботом и награды пока рассчитываются на клиенте. Это прототип механики, а не защищённый PvP: до подключения платных покупок или ценных наград расчёт боя необходимо перенести на сервер.
- Графика бойцов рисуется программно, отдельных игровых изображений проект не требует.
