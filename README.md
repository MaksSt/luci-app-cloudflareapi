# luci-app-cloudflareapi

LuCI-приложение для OpenWrt, которое обновляет выбранные Cloudflare DNS A-записи публичным IP роутера.

## Возможности

- ввод Cloudflare API Token в интерфейсе LuCI;
- загрузка списка зон и DNS-записей из Cloudflare;
- выбор записей через чекбоксы и сохранение выбора в UCI;
- ежедневная проверка публичного IP;
- опциональная проверка при старте роутера;
- обновление выбранных DNS-записей только при изменении IP.

## Требования

- OpenWrt 25.12.4;
- архитектура `aarch64_cortex-a53`;
- пакеты: `luci-base`, `curl`, `jsonfilter`, `ca-bundle`.

## Cloudflare API Token

Создай token с минимальными правами:

- `Zone:Read`;
- `DNS:Edit`;
- зонами должны быть только домены, которыми будет управлять роутер.

## Установка в OpenWrt buildroot

Скопируй пакет в feeds или отдельную директорию пакетов, затем собери:

```sh
make package/luci-app-cloudflareapi/compile V=s
```

## Установка через вкладку Software

Сначала нужен собранный `.ipk` пакет именно под твою архитектуру `aarch64_cortex-a53`.

1. Открой LuCI: `System -> Software`.
2. Нажми `Update lists`, чтобы OpenWrt обновил список доступных зависимостей.
3. Установи зависимости, если они ещё не установлены: `curl`, `jsonfilter`, `ca-bundle`, `luci-base`.
4. Открой блок `Upload Package`.
5. Выбери файл `luci-app-cloudflareapi_*.ipk`.
6. Нажми `Upload`, затем подтверди установку.
7. После установки обнови страницу LuCI или выйди и войди снова.

## Установка через URL в Software

Через URL нужно указывать прямую ссылку на готовый `.ipk` файл. Ссылка на GitHub-репозиторий или страницу релиза не подходит.

Пример URL:

```text
https://github.com/MaksSt/luci-app-cloudflareapi/releases/download/v1.0.0/luci-app-cloudflareapi_1.0.0-1_all.ipk
```

Порядок установки:

1. Открой LuCI: `System -> Software`.
2. Нажми `Update lists`.
3. Установи зависимости: `curl`, `jsonfilter`, `ca-bundle`, `luci-base`.
4. В поле `Download and install package` вставь прямой URL на `.ipk`.
5. Нажми `OK` и подтверди установку.
6. Если установка ругается на архитектуру или зависимости, значит `.ipk` собран не под твой OpenWrt/target или не хватает пакетов из репозитория OpenWrt.

После установки пакет автоматически включает init-скрипт. Само обновление DNS начнёт работать только после включения в LuCI или через UCI:

```sh
/etc/init.d/cloudflareapi reload
/etc/init.d/cloudflareapi start
```

Интерфейс будет доступен в LuCI: `Services -> Cloudflare DNS`.
