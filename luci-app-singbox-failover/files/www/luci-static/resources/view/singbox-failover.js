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
		return 'все URL';
	case 'quorum':
		return 'кворум';
	case 'any_ok':
		return 'любой URL';
	default:
		return policy || 'любой URL';
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
			E('th', {}, 'Результат'),
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

		o = s.taboption('general', widgets.NetworkSelect, 'source_interfaces', 'Сети для переключения',
			'Только трафик из выбранных сетей будет переведен через proxy при срабатывании failover.');
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

		o = s.taboption('healthchecks', form.DynamicList, 'health_url', 'Healthcheck URL',
			'Адреса, по которым проверяется direct-доступ. После изменения нажми "Проверить direct", чтобы сразу увидеть результат.');
		o.datatype = 'url';
		o.placeholder = 'https://www.gstatic.com/generate_204';
		o.rmempty = false;

		o = s.taboption('healthchecks', form.ListValue, 'health_policy', 'Правило оценки',
			'Как считать итог проверки, если URL несколько.');
		o.value('any_ok', 'любой URL работает');
		o.value('all_ok', 'все URL работают');
		o.value('quorum', 'работает минимум N URL');
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
				dashboard(status),
				E('p', {}, 'Режим сейчас: ' + modeName(status.current_mode)),
				E('p', {}, 'Настроенный режим: ' + modeName(status.configured_mode)),
				E('p', {}, 'Правило оценки healthcheck: ' + policyName(status.health_policy)),
				E('p', {}, 'Direct: ' + healthSummary(status.direct_health)),
				E('p', {}, 'Proxy: ' + healthSummary(status.proxy_health)),
				E('p', {}, 'Счетчик ошибок direct: ' + (status.fail_count || 0)),
				E('p', {}, 'Счетчик восстановления direct: ' + (status.recover_count || 0)),
				E('p', {}, 'Последняя ошибка: ' + (status.last_error || '-')),
				E('h4', {}, 'Правила и порты'),
				dataplaneRows(status.dataplane),
				E('h4', {}, 'Direct-проверки'),
				healthRows(status.direct_health),
				E('h4', {}, 'Proxy-проверки'),
				healthRows(status.proxy_health),
				E('h4', {}, 'Технический статус JSON'),
				E('pre', {}, JSON.stringify(status, null, 2))
			]);
		};

		addAction(s, '_refresh_status', 'Обновить статус', '/usr/bin/singbox-failover', [ 'status' ]);
		addAction(s, '_start', _('Start'), '/etc/init.d/singbox-failover', [ 'start' ]);
		addAction(s, '_stop', _('Stop'), '/etc/init.d/singbox-failover', [ 'stop' ]);
		addAction(s, '_reload', _('Reload'), '/etc/init.d/singbox-failover', [ 'reload' ]);
		addAction(s, '_test_direct', 'Проверить direct', '/usr/bin/singbox-failover', [ 'test_direct' ]);
		addAction(s, '_test_proxy', 'Проверить proxy', '/usr/bin/singbox-failover', [ 'test_proxy' ]);

		return m.render();
	}
});
