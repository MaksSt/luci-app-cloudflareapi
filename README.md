# luci-app-cloudflareapi

LuCI-приложение для OpenWrt, которое обновляет выбранные Cloudflare DNS A-записи публичным IP роутера.

## Возможности

- ввод Cloudflare API Token в интерфейсе LuCI;
- загрузка списка зон и DNS-записей из Cloudflare;
- выбор A-записей через чекбоксы и сохранение выбора в UCI;
- ежедневная проверка публичного IP;
- опциональная проверка при старте роутера;
- обновление выбранных DNS-записей только при изменении IP.

## Требования

- OpenWrt 25.12.4;
- пакетный менеджер `apk`;
- пакеты: `luci-base`, `curl`, `jsonfilter`, `ca-bundle`.

## Cloudflare API Token

Создай token с минимальными правами:

- `Zone:Read`;
- `DNS:Edit`;
- зонами должны быть только домены, которыми будет управлять роутер.

## Установка через LuCI Software

В OpenWrt 25.x поле `Download and install package` вызывает `apk add <ввод>`. Прямой URL на GitHub Release там не устанавливается как файл и может завершиться ошибкой `no such package`.

Рабочий вариант через LuCI:

1. Скачай `.apk` из релиза на компьютер:
   `https://github.com/MaksSt/luci-app-cloudflareapi/releases/download/v1.0.0/luci-app-cloudflareapi-1.0.0-r6.apk`
2. Открой LuCI: `System -> Software`.
3. Нажми `Update lists`.
4. Установи зависимости, если их нет: `curl`, `jsonfilter`, `ca-bundle`, `luci-base`.
5. В блоке `Upload Package` выбери скачанный `luci-app-cloudflareapi-1.0.0-r6.apk`.
6. Нажми `Upload`, затем подтверди установку.
7. После установки обнови страницу LuCI или выйди и войди снова.

## Установка через SSH

```sh
wget -O /tmp/luci-app-cloudflareapi.apk https://github.com/MaksSt/luci-app-cloudflareapi/releases/download/v1.0.0/luci-app-cloudflareapi-1.0.0-r6.apk
apk add --allow-untrusted /tmp/luci-app-cloudflareapi.apk
/etc/init.d/cloudflareapi reload
/etc/init.d/cloudflareapi start
```

После установки интерфейс доступен в LuCI: `Services -> Cloudflare DNS`.

## Сборка через OpenWrt SDK

Пакет собирается GitHub Actions workflow `.github/workflows/build-openwrt-apk.yml` через официальный OpenWrt SDK 25.12.4.

Локально пакет можно собрать в OpenWrt SDK:

```sh
make package/luci-app-cloudflareapi/compile V=s
```

## Адаптивный интерфейс

- На широком экране настройки и состояние размещены рядом; на планшете — друг под другом.
- На экранах до 600 px таблицы DNS-записей превращаются в карточки с подписями полей.
- Длинные домены и сообщения об ошибках переносятся, кнопки имеют высоту не менее 44 px.
- Стили ограничены контейнером приложения и наследуют цвета активной темы LuCI.
- Поля связаны с подписями, предусмотрены клавиатурный фокус и сообщения загрузки/ошибок.

Состояние отображается на момент открытия страницы. После ручной проверки обновите страницу.
Загрузка зон, как и прежде, сначала сохраняет настройки и выбранные записи.

### Проверки интерфейса

```sh
sh tests/run.sh
npm ci --prefix tests/browser
cd tests/browser
npx playwright install --with-deps chromium
npm test
```

GitHub Actions запускает браузерные проверки перед сборкой APK через OpenWrt SDK.
Тесты выполняют настоящий `overview.js` с in-memory заменами LuCI/UCI/RPC и проверяют
ширины 320, 390, 600, 768, 1024 и 1440 px в светлом и тёмном тестовом окружении:
переполнение, размеры кнопок, подписи полей, клавиатуру, сохранение, выбор/удаление
записей, загрузку, пустой результат и ошибку API. Скриншоты доступны в артефакте
`responsive-ui-screenshots`. Node.js и Playwright нужны только для тестов, не на роутере.

Это не полноценный запуск LuCI: совместимость с конкретной темой, rpcd/UCI и работа
с реальным Cloudflare требуют отдельной проверки на OpenWrt. Тесты не используют
настоящие токены и не отправляют сетевые запросы. Для локального системного Chromium
можно задать `CHROMIUM_EXECUTABLE`.
