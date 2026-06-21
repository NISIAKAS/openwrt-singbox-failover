'use strict';
'require view';
'require form';
'require fs';
'require ui';
'require tools.widgets as widgets';

function parseStatus(raw) {
	try {
		return JSON.parse(raw || '{}');
	} catch (e) {
		return { last_error: 'Unable to parse status: ' + e.message };
	}
}

function notifyCommand(title, promise) {
	return promise.then(function(res) {
		var output = (res.stdout || '').trim();
		ui.addNotification(title, E('p', {}, output || _('Команда выполнена')));
		window.setTimeout(function() { window.location.reload(); }, 500);
	}).catch(function(err) {
		ui.addNotification(title, E('pre', {}, err.message || String(err)), 'danger');
	});
}

function addAction(section, name, title, cmd, args) {
	var option = section.taboption('actions', form.Button, name, title);
	option.inputstyle = 'action';
	option.onclick = function() {
		return notifyCommand(title, fs.exec(cmd, args));
	};
	return option;
}

function helpBox(title, body, items) {
	var children = [
		E('div', { 'style': 'font-weight:700;margin-bottom:6px' }, title),
		E('div', { 'style': 'opacity:.86;line-height:1.45' }, body)
	];

	if (Array.isArray(items) && items.length) {
		children.push(E('ul', { 'style': 'margin:8px 0 0 18px;padding:0;line-height:1.45' },
			items.map(function(item) {
				return E('li', {}, item);
			})));
	}

	return E('div', {
		'style': 'border:1px solid var(--border-color-medium);border-radius:6px;padding:12px 14px;margin:0 0 14px 0;background:rgba(127,127,127,.07)'
	}, children);
}

function healthSummary(health) {
	if (!health)
		return '-';

	return '%s: прошло %d из %d, нужно %d, правило %s'.format(
		health.ok ? 'работает' : 'не работает',
		health.passed || 0,
		health.total || 0,
		health.required || 0,
		policyName(health.policy));
}

function healthState(health) {
	if (!health)
		return 'unknown';

	return health.ok ? 'ok' : 'fail';
}

function boolState(value, goodText, badText) {
	return value ? goodText : badText;
}

function modeName(mode) {
	switch (mode) {
	case 'auto':
		return 'авто';
	case 'force_direct':
		return 'только напрямую';
	case 'force_proxy':
		return 'только через proxy';
	case 'direct':
		return 'напрямую';
	case 'proxy':
		return 'через proxy';
	default:
		return mode || 'неизвестно';
	}
}

function policyName(policy) {
	switch (policy) {
	case 'all_ok':
		return 'все URL должны работать';
	case 'quorum':
		return 'минимум N URL';
	case 'any_ok':
		return 'достаточно одного URL';
	default:
		return policy || 'достаточно одного URL';
	}
}

function healthName(state) {
	switch (state) {
	case 'ok':
		return 'работает';
	case 'fail':
		return 'не работает';
	default:
		return 'нет данных';
	}
}

function statusColor(state) {
	switch (state) {
	case 'ok':
	case 'running':
	case 'active':
	case 'direct':
		return '#13a36f';
	case 'proxy':
		return '#2d8cff';
	case 'fail':
	case 'stopped':
	case 'inactive':
		return '#d94f4f';
	default:
		return '#8b949e';
	}
}

function statusCard(title, value, state, detail) {
	return E('div', {
		'style': 'border:1px solid var(--border-color-medium);border-left:4px solid %s;border-radius:6px;padding:10px 12px;background:rgba(127,127,127,.06);min-height:72px'.format(statusColor(state))
	}, [
		E('div', { 'style': 'font-size:12px;opacity:.72;margin-bottom:6px' }, title),
		E('div', { 'style': 'font-size:20px;font-weight:700;line-height:1.2' }, value),
		E('div', { 'style': 'font-size:12px;opacity:.72;margin-top:6px;word-break:break-word' }, detail || '')
	]);
}

function dashboard(status) {
	var directState = healthState(status.direct_health);
	var proxyState = healthState(status.proxy_health);
	var dataplane = status.dataplane || {};
	var rulesState = dataplane.rules_active ? 'active' : 'inactive';
	var serviceState = status.sing_box_running ? 'running' : 'stopped';

	return E('div', {
		'style': 'display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin:0 0 16px 0'
	}, [
		statusCard('Режим', modeName(status.current_mode), status.current_mode || 'unknown',
			'Настроено: ' + modeName(status.configured_mode)),
		statusCard('Прямой доступ', healthName(directState), directState, healthSummary(status.direct_health)),
		statusCard('Проверка proxy', healthName(proxyState), proxyState, healthSummary(status.proxy_health)),
		statusCard('Правила маршрутизации', rulesState == 'active' ? 'активны' : 'не активны', rulesState,
			'nft: ' + boolState(dataplane.nft_table, 'есть', 'нет') + ', ip rule: ' + boolState(dataplane.fwmark_rule, 'есть', 'нет')),
		statusCard('Отдельный sing-box', serviceState == 'running' ? 'запущен' : 'остановлен', serviceState,
			'1702: ' + boolState(dataplane.tproxy_port, 'слушает', 'нет') + ', 1703: ' + boolState(dataplane.mixed_port, 'слушает', 'нет')),
		statusCard('Обновлено', status.updated_at || '-', 'unknown',
			'Последнее переключение: ' + (status.last_transition || '-'))
	]);
}

function currentExplanation(status) {
	var dataplane = status.dataplane || {};

	if (!status.enabled)
		return 'Сервис выключен. Правила маршрутизации не создаются, отдельный sing-box не запускается, интернет остается как был.';

	if (status.current_mode == 'proxy')
		return 'Сейчас выбранные сети должны идти через отдельный sing-box. Это видно по активным nft/ip rule и открытым портам 1702/1703.';

	if (status.current_mode == 'direct')
		return 'Сейчас выбранные сети идут напрямую через обычный WAN. В proxy сервис переключится только по выбранному режиму и порогам.';

	if (dataplane.rules_active)
		return 'Правила активны, но режим не определен. Проверь последний статус и ошибки ниже.';

	return 'Сервис включен, но пока нет активного перенаправления. Нажми "Проверить direct" или "Запустить".';
}

function dataplaneRows(dataplane) {
	dataplane = dataplane || {};

	return E('table', { 'class': 'table' }, [
		E('tr', {}, [ E('th', {}, 'Элемент'), E('th', {}, 'Состояние'), E('th', {}, 'Детали') ]),
		E('tr', {}, [
			E('td', {}, 'nft table'),
			E('td', {}, boolState(dataplane.nft_table, 'есть', 'нет')),
			E('td', {}, dataplane.table_name || 'singbox_failover')
		]),
		E('tr', {}, [
			E('td', {}, 'ip rule / fwmark'),
			E('td', {}, boolState(dataplane.fwmark_rule, 'есть', 'нет')),
			E('td', {}, (dataplane.fwmark || '0x00200000') + ' -> table ' + (dataplane.route_table || '206'))
		]),
		E('tr', {}, [
			E('td', {}, 'route table'),
			E('td', {}, boolState(dataplane.route_table_active, 'есть маршрут', 'пусто')),
			E('td', {}, dataplane.route_table || '206')
		]),
		E('tr', {}, [
			E('td', {}, 'локальные порты'),
			E('td', {}, boolState(dataplane.tproxy_port && dataplane.mixed_port, 'слушают', 'не полностью')),
			E('td', {}, 'tproxy ' + (dataplane.tproxy_port_number || 1702) + ', mixed ' + (dataplane.mixed_port_number || 1703))
		])
	]);
}

function healthRows(health) {
	var rows = [];

	if (!health || !Array.isArray(health.checks) || !health.checks.length)
		return E('em', {}, 'Пока нет данных. Нажми "Проверить direct" или дождись следующего цикла.');

	for (var i = 0; i < health.checks.length; i++) {
		var check = health.checks[i];
		rows.push(E('tr', {}, [
			E('td', {}, check.ok ? 'работает' : 'не работает'),
			E('td', {}, check.http_code || '-'),
			E('td', {}, check.url || '-')
		]));
	}

	return E('table', { 'class': 'table' }, [
		E('tr', {}, [
			E('th', {}, 'Статус'),
			E('th', {}, _('HTTP')),
			E('th', {}, _('URL'))
		]),
		rows
	]);
}

return view.extend({
	load: function() {
		return fs.exec_direct('/usr/bin/singbox-failover', [ 'status' ]).catch(function() {
			return '{}';
		});
	},

	render: function(rawStatus) {
		var status = parseStatus(rawStatus);
		var m = new form.Map('singbox_failover', _('Sing-box Failover'),
			_('Failover-контроллер для выбранных сетей: держит трафик напрямую, а при проблемах с direct-доступом переключает его через отдельный sing-box.'));

		var s = m.section(form.NamedSection, 'main', 'settings');
		s.anonymous = true;

		s.tab('general', 'Основное');
		s.tab('outbound', 'Исходящее соединение');
		s.tab('healthchecks', 'Проверки доступности');
		s.tab('status', 'Статус');
		s.tab('actions', 'Действия');

		var o;

		o = s.taboption('general', form.DummyValue, '_general_help', 'Схема работы');
		o.rawhtml = true;
		o.cfgvalue = function() {
			return helpBox('Что делает этот сервис',
				'Он не заменяет Podkop и не трогает его правила. Это отдельный failover: проверяет доступность direct через WAN и при сбое переводит только выбранные сети через отдельный sing-box.',
				[
					'Если "Включено" выключено, сервис ничего не меняет в маршрутизации.',
					'В режиме "авто" переключение зависит от healthcheck URL и порогов ошибок.',
					'ICMP/ping в MVP не проксируется, проверяется HTTP/HTTPS доступность.'
				]);
		};

		o = s.taboption('general', form.Flag, 'enabled', 'Включено',
			'Разрешает сервису работать. Если выключено, правила маршрутизации не создаются, отдельный sing-box не запускается.');
		o.default = '0';
		o.rmempty = false;

		o = s.taboption('general', form.ListValue, 'mode', 'Режим работы',
			'В авто-режиме direct проверяется по healthcheck URL. При серии ошибок выбранные сети переключаются через proxy.');
		o.value('auto', 'авто');
		o.value('force_direct', 'только напрямую');
		o.value('force_proxy', 'только через proxy');
		o.default = 'auto';
		o.rmempty = false;

		o = s.taboption('general', widgets.NetworkSelect, 'wan_interface', 'WAN-интерфейс',
			'Через этот интерфейс выполняется direct-проверка. Обычно это wan.');
		o.default = 'wan';
		o.rmempty = false;
		o.filter = function(section_id, value) {
			return value !== 'loopback';
		};

		o = s.taboption('general', widgets.NetworkSelect, 'source_interfaces', 'Сети-источники',
			'Выбери OpenWrt-интерфейсы, откуда брать клиентский трафик: например miners, guest или lan. Только эти сети будут переключаться через proxy.');
		o.multiple = true;
		o.placeholder = 'miners';
		o.rmempty = false;
		o.filter = function(section_id, value) {
			return value !== 'loopback';
		};

		o = s.taboption('general', form.Value, 'check_interval', 'Интервал проверки',
			'Как часто выполнять healthcheck, в секундах.');
		o.datatype = 'uinteger';
		o.default = '10';
		o.rmempty = false;

		o = s.taboption('general', form.Value, 'timeout', 'Тайм-аут',
			'Сколько секунд ждать ответа от каждого healthcheck URL.');
		o.datatype = 'uinteger';
		o.default = '2';
		o.rmempty = false;

		o = s.taboption('general', form.Value, 'fail_threshold', 'Порог переключения в proxy',
			'Сколько подряд неудачных direct-проверок нужно для перехода в proxy.');
		o.datatype = 'uinteger';
		o.default = '3';
		o.rmempty = false;

		o = s.taboption('general', form.Value, 'recover_threshold', 'Порог возврата напрямую',
			'Сколько подряд успешных direct-проверок нужно для возврата из proxy в direct.');
		o.datatype = 'uinteger';
		o.default = '6';
		o.rmempty = false;

		o = s.taboption('outbound', form.DummyValue, '_outbound_help', 'Что вставлять');
		o.rawhtml = true;
		o.cfgvalue = function() {
			return helpBox('Outbound - это один выход sing-box',
				'Сюда вставляется не весь купленный V2Ray/Xray JSON, а один sing-box outbound object с полем "type": например vless, hysteria2, socks или shadowsocks.',
				[
					'Если outbound пустой или невалидный, proxy-режим не будет включен и трафик останется напрямую.',
					'Этот экземпляр sing-box отдельный от Podkop и использует порты 1702/1703.',
					'Позже можно добавить импорт полных конфигов, но сейчас MVP принимает raw outbound.'
				]);
		};

		o = s.taboption('outbound', form.TextValue, 'outbound_json', 'Outbound JSON',
			'Один sing-box outbound object: например VLESS Reality или Hysteria2. Не вставляй полный Xray/V2Ray config.');
		o.rows = 18;
		o.monospace = true;
		o.rmempty = true;
		o.validate = function(section_id, value) {
			var trimmed = (value || '').trim();
			var parsed;

			if (!trimmed)
				return true;

			try {
				parsed = JSON.parse(trimmed);
			} catch (e) {
				return _('Невалидный JSON: %s').format(e.message);
			}

			if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
				return 'Outbound должен быть одним JSON-объектом, не массивом.';

			if (typeof parsed.type !== 'string' || !parsed.type)
				return 'Outbound должен содержать строковое поле "type".';

			return true;
		};

		o = s.taboption('healthchecks', form.DummyValue, '_health_help', 'Как читать проверку');
		o.rawhtml = true;
		o.cfgvalue = function() {
			return helpBox('Healthcheck решает, доступен ли direct',
				'Каждый URL проверяется принудительно через WAN-интерфейс. Если direct считается плохим несколько циклов подряд, авто-режим переключит выбранные сети в proxy.',
				[
					'После изменения списка нажми "Сохранить и применить", затем "Проверить direct".',
					'Если один URL иногда блокируется, используй правило "достаточно одного URL".',
					'Если нужно строго понимать, что вся группа доступна, используй "все URL должны работать" или "минимум N URL".'
				]);
		};

		o = s.taboption('healthchecks', form.DynamicList, 'health_url', 'Healthcheck URL',
			'Адреса, по которым проверяется direct-доступ через WAN. Для белых списков выбирай URL, которые должны быть недоступны без proxy.');
		o.datatype = 'url';
		o.placeholder = 'https://www.gstatic.com/generate_204';
		o.rmempty = false;

		o = s.taboption('healthchecks', form.ListValue, 'health_policy', 'Правило оценки',
			'Как считать итог проверки, если URL несколько.');
		o.value('any_ok', 'достаточно одного URL');
		o.value('all_ok', 'все URL должны работать');
		o.value('quorum', 'минимум N URL');
		o.default = 'any_ok';
		o.rmempty = false;

		o = s.taboption('healthchecks', form.Value, 'health_quorum', 'Кворум N',
			'Сколько URL должны успешно ответить при правиле "работает минимум N URL".');
		o.datatype = 'uinteger';
		o.default = '1';
		o.depends('health_policy', 'quorum');
		o.validate = function(section_id, value) {
			var n = Number(value);
			if (!Number.isInteger(n) || n < 1)
				return 'Кворум должен быть целым числом больше 0.';
			return true;
		};

		o = s.taboption('status', form.DummyValue, '_status', 'Текущее состояние');
		o.rawhtml = true;
		o.cfgvalue = function() {
			return E('div', { 'class': 'cbi-section' }, [
				helpBox('Понятное состояние', currentExplanation(status), [
					'Direct - обычный интернет через WAN.',
					'Proxy - выбранные сети отправляются в отдельный sing-box failover.',
					'Правила маршрутизации активны только когда сервис реально перевел трафик в proxy.'
				]),
				dashboard(status),
				E('table', { 'class': 'table' }, [
					E('tr', {}, [ E('th', {}, 'Параметр'), E('th', {}, 'Значение') ]),
					E('tr', {}, [ E('td', {}, 'Режим сейчас'), E('td', {}, modeName(status.current_mode)) ]),
					E('tr', {}, [ E('td', {}, 'Настроенный режим'), E('td', {}, modeName(status.configured_mode)) ]),
					E('tr', {}, [ E('td', {}, 'Правило healthcheck'), E('td', {}, policyName(status.health_policy)) ]),
					E('tr', {}, [ E('td', {}, 'Ошибок direct подряд'), E('td', {}, String(status.fail_count || 0)) ]),
					E('tr', {}, [ E('td', {}, 'Успешных direct подряд'), E('td', {}, String(status.recover_count || 0)) ]),
					E('tr', {}, [ E('td', {}, 'Последняя ошибка'), E('td', {}, status.last_error || '-') ])
				]),
				E('h4', {}, 'Правила и порты'),
				dataplaneRows(status.dataplane),
				E('h4', {}, 'Direct-проверки'),
				healthRows(status.direct_health),
				E('h4', {}, 'Proxy-проверки'),
				healthRows(status.proxy_health),
				E('details', { 'style': 'margin-top:14px' }, [
					E('summary', { 'style': 'cursor:pointer;font-weight:700' }, 'Технический JSON для диагностики'),
					E('pre', { 'style': 'margin-top:10px;white-space:pre-wrap' }, JSON.stringify(status, null, 2))
				])
			]);
		};

		o = s.taboption('actions', form.DummyValue, '_actions_help', 'Что делают кнопки');
		o.rawhtml = true;
		o.cfgvalue = function() {
			return helpBox('Действия применяются сразу',
				'Сначала нажми "Сохранить и применить", если менял настройки. Потом используй кнопки ниже.',
				[
					'Запустить - стартует failover-демон. Если "Включено" выключено, демон выйдет без правил.',
					'Проверить direct - сразу проверяет URL через WAN и обновляет статус.',
					'Проверить proxy - проверяет доступность через локальный mixed proxy 127.0.0.1:1703, когда sing-box запущен.'
				]);
		};

		addAction(s, '_refresh_status', 'Обновить статус', '/usr/bin/singbox-failover', [ 'status' ]);
		addAction(s, '_start', 'Запустить', '/etc/init.d/singbox-failover', [ 'start' ]);
		addAction(s, '_stop', 'Остановить', '/etc/init.d/singbox-failover', [ 'stop' ]);
		addAction(s, '_reload', 'Перезапустить', '/etc/init.d/singbox-failover', [ 'reload' ]);
		addAction(s, '_test_direct', 'Проверить direct', '/usr/bin/singbox-failover', [ 'test_direct' ]);
		addAction(s, '_test_proxy', 'Проверить proxy', '/usr/bin/singbox-failover', [ 'test_proxy' ]);

		return m.render();
	}
});
