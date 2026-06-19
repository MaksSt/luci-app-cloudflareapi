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

function parseApiResponse(raw) {
    var response = JSON.parse(raw || '{}');

    if (!response.success) {
        throw new Error(response.errors && response.errors.length
            ? response.errors[0].message
            : _('Cloudflare API вернул ошибку'));
    }

    return response.result || [];
}

function notifyError(error) {
    ui.addNotification(null, E('p', {}, error.message || String(error)), 'danger');
}

return view.extend({
    load: function() {
        return uci.load('cloudflareapi');
    },

    render: function() {
        var settings = uci.get_all('cloudflareapi', 'settings') || {};
        var selectedRecords = readSelectedRecords();
        var tokenInput = E('input', {
            'class': 'cbi-input-password',
            'type': 'password',
            'value': settings.token || '',
            'autocomplete': 'off'
        });
        var enabledInput = E('input', {
            'type': 'checkbox',
            'checked': settings.enabled === '1'
        });
        var bootInput = E('input', {
            'type': 'checkbox',
            'checked': settings.check_on_boot !== '0'
        });
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
        var zonesContainer = E('div', { 'class': 'cbi-section' });
        var selectedContainer = E('tbody');

        function renderSelectedRecords() {
            var sections = uci.sections('cloudflareapi', 'record');

            selectedContainer.innerHTML = '';

            if (!sections.length) {
                selectedContainer.appendChild(E('tr', {}, [
                    E('td', { 'colspan': '5', 'class': 'center' }, _('DNS-записи пока не выбраны'))
                ]));
                return;
            }

            sections.forEach(function(record) {
                selectedContainer.appendChild(E('tr', {}, [
                    E('td', {}, record.name || '-'),
                    E('td', {}, record.type || '-'),
                    E('td', {}, record.zone_name || '-'),
                    E('td', {}, record.enabled === '0' ? _('Выключена') : _('Включена')),
                    E('td', { 'class': 'right' }, E('button', {
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
                .then(function() { return uci.apply(); })
                .then(function() {
                    return fs.exec('/etc/init.d/cloudflareapi', [ 'reload' ]).catch(function() {});
                });
        }

        function saveRecord(record, zone) {
            var sectionId = sectionIdByRecordId(record.id) || uci.add('cloudflareapi', 'record');

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
                body.appendChild(E('tr', {}, [
                    E('td', { 'colspan': '4', 'class': 'center' }, _('A-записи в этой зоне не найдены'))
                ]));
            }

            filtered.forEach(function(record) {
                var checkbox = E('input', {
                    'type': 'checkbox',
                    'checked': !!selectedRecords[record.id],
                    'change': function() {
                        if (checkbox.checked) {
                            saveRecord(record, zone);
                        } else {
                            removeRecord(record);
                        }

                        selectedRecords = readSelectedRecords();
                        renderSelectedRecords();
                    }
                });

                body.appendChild(E('tr', {}, [
                    E('td', {}, checkbox),
                    E('td', {}, record.name),
                    E('td', {}, record.type),
                    E('td', {}, record.content || '-')
                ]));
            });

            return E('table', { 'class': 'table cbi-section-table' }, [
                E('tr', { 'class': 'tr table-titles' }, [
                    E('th', { 'class': 'th' }, ''),
                    E('th', { 'class': 'th' }, _('Имя')),
                    E('th', { 'class': 'th' }, _('Тип')),
                    E('th', { 'class': 'th' }, _('Текущее значение'))
                ]),
                body
            ]);
        }

        function loadRecords(zone, target) {
            target.innerHTML = '';
            target.appendChild(E('em', {}, _('Загрузка DNS-записей...')));

            fs.exec_direct('/usr/libexec/cloudflareapi', [ 'records', zone.id ])
                .then(function(raw) {
                    target.innerHTML = '';
                    target.appendChild(renderRecords(zone, parseApiResponse(raw)));
                })
                .catch(function(error) {
                    target.innerHTML = '';
                    notifyError(error);
                });
        }

        function renderZones(zones) {
            zonesContainer.innerHTML = '';

            if (!zones.length) {
                zonesContainer.appendChild(E('p', {}, _('Cloudflare зоны не найдены')));
                return;
            }

            zones.forEach(function(zone) {
                var recordsTarget = E('div', { 'class': 'cbi-value-description' });

                zonesContainer.appendChild(E('div', { 'class': 'cbi-section' }, [
                    E('h3', {}, zone.name),
                    E('button', {
                        'class': 'btn cbi-button cbi-button-apply',
                        'click': function() { loadRecords(zone, recordsTarget); }
                    }, _('Показать A-записи')),
                    recordsTarget
                ]));
            });
        }

        function loadZones() {
            zonesContainer.innerHTML = '';
            zonesContainer.appendChild(E('em', {}, _('Загрузка зон Cloudflare...')));

            return saveSettings()
                .then(function() {
                    return fs.exec_direct('/usr/libexec/cloudflareapi', [ 'zones' ]);
                })
                .then(function(raw) {
                    renderZones(parseApiResponse(raw));
                })
                .catch(function(error) {
                    zonesContainer.innerHTML = '';
                    notifyError(error);
                });
        }

        function runCheckNow() {
            return saveSettings()
                .then(function() {
                    return fs.exec('/usr/bin/cloudflareapi-check', [ 'manual' ]);
                })
                .then(function() {
                    ui.addNotification(null, E('p', {}, _('Проверка запущена')), 'info');
                    return uci.load('cloudflareapi');
                })
                .catch(notifyError);
        }

        renderSelectedRecords();

        return E('div', { 'class': 'cbi-map' }, [
            E('h2', {}, _('Cloudflare DNS')),
            E('div', { 'class': 'cbi-section' }, [
                E('div', { 'class': 'cbi-value' }, [
                    E('label', { 'class': 'cbi-value-title' }, _('Включить обновление')),
                    E('div', { 'class': 'cbi-value-field' }, enabledInput)
                ]),
                E('div', { 'class': 'cbi-value' }, [
                    E('label', { 'class': 'cbi-value-title' }, _('Cloudflare API Token')),
                    E('div', { 'class': 'cbi-value-field' }, tokenInput)
                ]),
                E('div', { 'class': 'cbi-value' }, [
                    E('label', { 'class': 'cbi-value-title' }, _('URL проверки IP')),
                    E('div', { 'class': 'cbi-value-field' }, ipUrlInput)
                ]),
                E('div', { 'class': 'cbi-value' }, [
                    E('label', { 'class': 'cbi-value-title' }, _('Ежедневная проверка, час')),
                    E('div', { 'class': 'cbi-value-field' }, hourInput)
                ]),
                E('div', { 'class': 'cbi-value' }, [
                    E('label', { 'class': 'cbi-value-title' }, _('Проверять при старте роутера')),
                    E('div', { 'class': 'cbi-value-field' }, bootInput)
                ]),
                E('div', { 'class': 'cbi-value' }, [
                    E('label', { 'class': 'cbi-value-title' }, _('Последний IP')),
                    E('div', { 'class': 'cbi-value-field' }, settings.last_ip || '-')
                ]),
                E('div', { 'class': 'cbi-value' }, [
                    E('label', { 'class': 'cbi-value-title' }, _('Последняя проверка')),
                    E('div', { 'class': 'cbi-value-field' }, settings.last_check || '-')
                ]),
                E('div', { 'class': 'cbi-value' }, [
                    E('label', { 'class': 'cbi-value-title' }, _('Последняя ошибка')),
                    E('div', { 'class': 'cbi-value-field' }, settings.last_error || '-')
                ]),
                E('div', { 'class': 'right' }, [
                    E('button', {
                        'class': 'btn cbi-button cbi-button-save',
                        'click': saveSettings
                    }, _('Сохранить')),
                    ' ',
                    E('button', {
                        'class': 'btn cbi-button cbi-button-apply',
                        'click': runCheckNow
                    }, _('Проверить сейчас'))
                ])
            ]),
            E('div', { 'class': 'cbi-section' }, [
                E('h3', {}, _('Выбранные DNS-записи')),
                E('table', { 'class': 'table cbi-section-table' }, [
                    E('tr', { 'class': 'tr table-titles' }, [
                        E('th', { 'class': 'th' }, _('Имя')),
                        E('th', { 'class': 'th' }, _('Тип')),
                        E('th', { 'class': 'th' }, _('Зона')),
                        E('th', { 'class': 'th' }, _('Статус')),
                        E('th', { 'class': 'th' }, '')
                    ]),
                    selectedContainer
                ])
            ]),
            E('div', { 'class': 'cbi-section' }, [
                E('h3', {}, _('Cloudflare зоны')),
                E('button', {
                    'class': 'btn cbi-button cbi-button-apply',
                    'click': loadZones
                }, _('Загрузить зоны')),
                zonesContainer
            ])
        ]);
    },

    handleSaveApply: null,
    handleSave: null,
    handleReset: null
});
