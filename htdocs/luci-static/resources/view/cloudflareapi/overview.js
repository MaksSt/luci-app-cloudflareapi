'use strict';
'require view';
'require uci';
'require fs';
'require ui';

function sectionIdByRecordId(recordId) {
    var sections = uci.sections('cloudflareapi', 'record');

    for (var i = 0; i < sections.length; i++) {
        if (sections[i].record_id === recordId) {
            return sections[i]['.name'];
        }
    }

    return null;
}

function readSelectedRecords() {
    var selected = {};
    var sections = uci.sections('cloudflareapi', 'record');

    for (var i = 0; i < sections.length; i++) {
        selected[sections[i].record_id] = sections[i];
    }

    return selected;
}

function parseApiPage(raw) {
    var response = JSON.parse(raw || '{}');

    if (!response.success) {
        throw new Error(response.errors && response.errors.length
            ? response.errors[0].message
            : _('Cloudflare API вернул ошибку'));
    }

    return {
        result: response.result || [],
        page: Number(response.result_info && response.result_info.page) || 1,
        totalPages: Number(response.result_info && response.result_info.total_pages) || 1
    };
}

function fetchAllPages(args, page, items) {
    page = page || 1;
    items = items || [];

    return fs.exec_direct('/usr/libexec/cloudflareapi', args.concat([ String(page) ]))
        .then(function(raw) {
            var response = parseApiPage(raw);
            var combined;

            if (response.page !== page || response.totalPages < response.page) {
                throw new Error(_('Cloudflare API вернул некорректные данные пагинации'));
            }

            combined = items.concat(response.result);

            if (page < response.totalPages) {
                return fetchAllPages(args, page + 1, combined);
            }

            return combined;
        });
}

function notifyError(error) {
    ui.addNotification(null, E('p', {}, error.message || String(error)), 'danger');
}

function createCheckbox(checked, onChange) {
    var checkbox = E('input', {
        'type': 'checkbox',
        'change': onChange
    });

    checkbox.checked = !!checked;

    return checkbox;
}

function readSettings() {
    var options = [
        'enabled',
        'token',
        'ip_url',
        'check_hour',
        'check_on_boot',
        'last_ip',
        'last_check',
        'last_error'
    ];
    var settings = {};

    for (var i = 0; i < options.length; i++) {
        settings[options[i]] = uci.get('cloudflareapi', 'settings', options[i]);
    }

    return settings;
}

// Keep layout and accessibility helpers independent of DNS/UCI operations.
function field(id, title, control, hint) {
    control.id = id;
    if (hint) control.setAttribute('aria-describedby', id + '-hint');
    return E('div', { 'class': 'cf-field' }, [
        E('label', { 'for': id, 'class': 'cf-label' }, title),
        E('div', { 'class': 'cf-control' }, [
            control,
            hint ? E('p', { 'id': id + '-hint', 'class': 'cf-help' }, hint) : ''
        ])
    ]);
}

function cell(label, content, className) {
    return E('td', { 'data-label': label, 'class': className || '', 'role': 'cell' }, content);
}

function recordTable(labels, body, caption) {
    return E('table', { 'class': 'table cbi-section-table cf-table', 'role': 'table' }, [
        E('caption', { 'class': 'cf-sr-only' }, caption),
        E('thead', {}, E('tr', { 'class': 'tr table-titles', 'role': 'row' }, labels.map(function(label) {
            return E('th', { 'class': 'th', 'scope': 'col', 'role': 'columnheader' }, label);
        }))),
        body
    ]);
}

function message(text, error) {
    return E('p', { 'class': 'cf-message' + (error ? ' cf-error' : ''), 'role': error ? 'alert' : 'status' }, text);
}

return view.extend({
    load: function() {
        return uci.load('cloudflareapi');
    },

    render: function() {
        var settings = readSettings();
        var selectedRecords = readSelectedRecords();
        var tokenInput = E('input', {
            'class': 'cbi-input-password',
            'type': 'password',
            'value': settings.token || '',
            'autocomplete': 'off'
        });
        var enabledInput = createCheckbox(settings.enabled === '1');
        var bootInput = createCheckbox(settings.check_on_boot !== '0');
        var ipUrlInput = E('input', {
            'class': 'cbi-input-text',
            'type': 'url',
            'value': settings.ip_url || 'https://api.ipify.org'
        });
        var hourInput = E('input', {
            'class': 'cbi-input-text',
            'type': 'number',
            'min': '0',
            'max': '23',
            'value': settings.check_hour || '3'
        });
        var zonesContainer = E('div', { 'class': 'cf-zones' },
            message(_('Загрузите зоны, чтобы выбрать A-записи для обновления.')));
        var selectedContainer = E('tbody');

        function renderSelectedRecords() {
            var sections = uci.sections('cloudflareapi', 'record');

            selectedContainer.innerHTML = '';

            if (!sections.length) {
                selectedContainer.appendChild(E('tr', { 'role': 'row' }, [
                    E('td', { 'colspan': '5', 'class': 'cf-empty' }, _('DNS-записи пока не выбраны. Загрузите зоны ниже и отметьте нужные A-записи.'))
                ]));
                return;
            }

            sections.forEach(function(record) {
                selectedContainer.appendChild(E('tr', { 'role': 'row' }, [
                    cell(_('Имя'), record.name || '-', 'cf-record-name'),
                    cell(_('Тип'), record.type || '-'),
                    cell(_('Зона'), record.zone_name || '-'),
                    cell(_('Статус'), record.enabled === '0' ? _('Выключена') : _('Включена')),
                    cell(_('Действие'), E('button', {
                        'type': 'button',
                        'aria-label': _('Удалить запись') + ' ' + (record.name || ''),
                        'class': 'btn cbi-button cbi-button-remove',
                        'click': function() {
                            uci.remove('cloudflareapi', record['.name']);
                            selectedRecords = readSelectedRecords();
                            renderSelectedRecords();
                        }
                    }, _('Удалить')))
                ]));
            });
        }

        function saveSettings() {
            var checkHour = parseInt(hourInput.value, 10);

            if (isNaN(checkHour) || checkHour < 0 || checkHour > 23) {
                ui.addNotification(null, E('p', {}, _('Час проверки должен быть от 0 до 23')), 'danger');
                return Promise.reject(new Error('invalid hour'));
            }

            uci.set('cloudflareapi', 'settings', 'enabled', enabledInput.checked ? '1' : '0');
            uci.set('cloudflareapi', 'settings', 'token', tokenInput.value.trim());
            uci.set('cloudflareapi', 'settings', 'ip_url', ipUrlInput.value.trim() || 'https://api.ipify.org');
            uci.set('cloudflareapi', 'settings', 'check_hour', String(checkHour));
            uci.set('cloudflareapi', 'settings', 'check_on_boot', bootInput.checked ? '1' : '0');

            return uci.save()
                .then(function() {
                    return fs.exec('/usr/libexec/cloudflareapi', [ 'save' ]);
                });
        }

        function saveRecord(record, zone) {
            var sectionId = sectionIdByRecordId(record.id);

            if (!sectionId) {
                sectionId = uci.add('cloudflareapi', 'record');
                uci.set('cloudflareapi', 'settings', 'last_ip', '');
            }

            uci.set('cloudflareapi', sectionId, 'enabled', '1');
            uci.set('cloudflareapi', sectionId, 'zone_id', zone.id);
            uci.set('cloudflareapi', sectionId, 'zone_name', zone.name);
            uci.set('cloudflareapi', sectionId, 'record_id', record.id);
            uci.set('cloudflareapi', sectionId, 'name', record.name);
            uci.set('cloudflareapi', sectionId, 'type', record.type);
        }

        function removeRecord(record) {
            var sectionId = sectionIdByRecordId(record.id);

            if (sectionId) {
                uci.remove('cloudflareapi', sectionId);
            }
        }

        function renderRecords(zone, records) {
            var body = E('tbody');
            var filtered = records.filter(function(record) {
                return record.type === 'A';
            });

            if (!filtered.length) {
                body.appendChild(E('tr', { 'role': 'row' }, [
                    E('td', { 'colspan': '4', 'class': 'cf-empty' }, _('A-записи в этой зоне не найдены'))
                ]));
            }

            filtered.forEach(function(record) {
                var checkbox = createCheckbox(!!selectedRecords[record.id], function() {
                        if (checkbox.checked) {
                            saveRecord(record, zone);
                        } else {
                            removeRecord(record);
                        }

                        selectedRecords = readSelectedRecords();
                        renderSelectedRecords();
                });

                body.appendChild(E('tr', { 'role': 'row' }, [
                    cell(_('Обновлять'), E('label', { 'class': 'cf-check-target' }, [
                        checkbox, E('span', { 'class': 'cf-sr-only' }, _('Обновлять запись') + ' ' + record.name)
                    ])),
                    cell(_('Имя'), record.name, 'cf-record-name'),
                    cell(_('Тип'), record.type),
                    cell(_('Текущее значение'), record.content || '-')
                ]));
            });

            return recordTable([ _('Обновлять'), _('Имя'), _('Тип'), _('Текущее значение') ], body,
                _('A-записи зоны') + ' ' + zone.name);
        }

        function loadRecords(zone, target) {
            target.innerHTML = '';
            target.appendChild(message(_('Загрузка DNS-записей...')));

            fetchAllPages([ 'records', zone.id ])
                .then(function(records) {
                    target.innerHTML = '';
                    target.appendChild(renderRecords(zone, records));
                })
                .catch(function(error) {
                    target.innerHTML = '';
                    target.appendChild(message(_('Не удалось загрузить записи. Попробуйте ещё раз.'), true));
                    notifyError(error);
                });
        }

        function renderZones(zones) {
            zonesContainer.innerHTML = '';

            if (!zones.length) {
                zonesContainer.appendChild(message(_('Cloudflare зоны не найдены')));
                return;
            }

            zones.forEach(function(zone) {
                var recordsTarget = E('div', { 'class': 'cf-records' });

                zonesContainer.appendChild(E('section', { 'class': 'cf-zone' }, [
                    E('div', { 'class': 'cf-section-heading' }, [
                        E('h4', {}, zone.name),
                        E('button', {
                            'type': 'button',
                            'class': 'btn cbi-button cbi-button-apply',
                            'click': function() { loadRecords(zone, recordsTarget); }
                        }, _('Показать A-записи'))
                    ]),
                    recordsTarget
                ]));
            });
        }

        function loadZones() {
            zonesContainer.innerHTML = '';
            zonesContainer.appendChild(message(_('Загрузка зон Cloudflare...')));

            return saveSettings()
                .then(function() {
                    return fetchAllPages([ 'zones' ]);
                })
                .then(function(zones) {
                    renderZones(zones);
                })
                .catch(function(error) {
                    zonesContainer.innerHTML = '';
                    zonesContainer.appendChild(message(_('Не удалось загрузить зоны. Проверьте настройки и повторите загрузку.'), true));
                    notifyError(error);
                });
        }

        function runCheckNow() {
            return saveSettings()
                .then(function() {
                    return fs.exec('/usr/bin/cloudflareapi-check', [ 'manual' ]);
                })
                .then(function() {
                    ui.addNotification(null, E('p', {}, _('Проверка завершена')), 'info');
                    return uci.load('cloudflareapi');
                })
                .catch(notifyError);
        }

        renderSelectedRecords();

        return E('div', { 'class': 'cbi-map cf-app' }, [
            E('link', { 'rel': 'stylesheet', 'href': L.resource('view/cloudflareapi/overview.css') }),
            E('div', { 'class': 'cf-header' }, [
                E('h2', {}, _('Cloudflare DNS')),
                E('p', { 'class': 'cf-help' }, _('Автоматическое обновление A-записей при изменении публичного IP роутера.'))
            ]),
            E('div', { 'class': 'cf-layout' }, [
                E('section', { 'class': 'cf-panel', 'aria-labelledby': 'cf-settings-title' }, [
                    E('h3', { 'id': 'cf-settings-title' }, _('Настройки обновления')),
                    field('cf-enabled', _('Включить обновление'), enabledInput),
                    field('cf-token', _('Cloudflare API Token'), tokenInput,
                        _('Права Zone:Read и DNS:Edit только для нужных зон.')),
                    field('cf-ip-url', _('URL проверки IP'), ipUrlInput),
                    field('cf-hour', _('Ежедневная проверка, час'), hourInput,
                        _('От 0 до 23, по времени роутера.')),
                    field('cf-boot', _('Проверять при старте роутера'), bootInput),
                    E('div', { 'class': 'cf-actions' }, [
                        E('button', {
                            'type': 'button',
                            'class': 'btn cbi-button cbi-button-save',
                            'click': function() { return saveSettings().catch(notifyError); }
                        }, _('Сохранить')),
                        E('button', {
                            'type': 'button',
                            'class': 'btn cbi-button cbi-button-apply',
                            'click': runCheckNow
                        }, _('Проверить сейчас'))
                    ])
                ]),
                E('section', { 'class': 'cf-panel cf-status', 'aria-labelledby': 'cf-status-title' }, [
                    E('h3', { 'id': 'cf-status-title' }, _('Состояние')),
                    E('p', { 'class': 'cf-service-state' }, settings.enabled === '1' ? _('Обновление включено') : _('Обновление выключено')),
                    E('dl', {}, [
                        E('dt', {}, _('Последний IP')),
                        E('dd', { 'class': 'cf-ip' }, settings.last_ip || '—'),
                        E('dt', {}, _('Последняя проверка')),
                        E('dd', {}, settings.last_check || _('Пока не выполнялась')),
                        E('dt', {}, _('Последняя ошибка')),
                        E('dd', {}, settings.last_error || _('Нет сохранённых ошибок'))
                    ]),
                    E('p', { 'class': 'cf-help' }, _('Состояние на момент открытия страницы. После проверки обновите страницу, чтобы увидеть новые данные.'))
                ])
            ]),
            E('section', { 'class': 'cf-panel', 'aria-labelledby': 'cf-selected-title' }, [
                E('h3', { 'id': 'cf-selected-title' }, _('Выбранные DNS-записи')),
                E('p', { 'class': 'cf-help' }, _('Изменения списка применяются кнопкой «Сохранить».')),
                recordTable([ _('Имя'), _('Тип'), _('Зона'), _('Статус'), _('Действие') ],
                    selectedContainer, _('Выбранные DNS-записи'))
            ]),
            E('section', { 'class': 'cf-panel', 'aria-labelledby': 'cf-zones-title' }, [
                E('div', { 'class': 'cf-section-heading' }, [
                    E('h3', { 'id': 'cf-zones-title' }, _('Cloudflare зоны')),
                    E('button', {
                        'type': 'button',
                        'class': 'btn cbi-button cbi-button-apply',
                        'click': loadZones
                    }, _('Загрузить зоны'))
                ]),
                E('p', { 'class': 'cf-help' }, _('Загрузка зон сначала сохраняет текущие настройки и выбранные записи.')),
                zonesContainer
            ])
        ]);
    },

    handleSaveApply: null,
    handleSave: null,
    handleReset: null
});
