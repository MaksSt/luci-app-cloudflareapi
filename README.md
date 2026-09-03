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
