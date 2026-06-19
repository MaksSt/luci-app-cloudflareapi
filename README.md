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

После установки включи сервис:

```sh
/etc/init.d/cloudflareapi enable
/etc/init.d/cloudflareapi start
```

Интерфейс будет доступен в LuCI: `Services -> Cloudflare DNS`.
