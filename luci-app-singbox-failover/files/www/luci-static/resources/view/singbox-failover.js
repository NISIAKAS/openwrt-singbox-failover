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
		ui.addNotification(title, E('p', {}, output || _('Command completed')));
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

return view.extend({
	load: function() {
		return fs.exec_direct('/usr/bin/singbox-failover', [ 'status' ]).catch(function() {
			return '{}';
		});
	},

	render: function(rawStatus) {
		var status = parseStatus(rawStatus);
		var m = new form.Map('singbox_failover', _('Sing-box Failover'),
			_('Disabled-by-default failover controller for selected source interfaces.'));

		var s = m.section(form.NamedSection, 'main', 'settings');
		s.anonymous = true;

		s.tab('general', _('General'));
		s.tab('outbound', _('Outbound'));
		s.tab('healthchecks', _('Healthchecks'));
		s.tab('status', _('Status'));
		s.tab('actions', _('Actions'));

		var o;

		o = s.taboption('general', form.Flag, 'enabled', _('Enabled'));
		o.default = '0';
		o.rmempty = false;

		o = s.taboption('general', form.ListValue, 'mode', _('Mode'));
		o.value('auto', _('auto'));
		o.value('force_direct', _('force_direct'));
		o.value('force_proxy', _('force_proxy'));
		o.default = 'auto';
		o.rmempty = false;

		o = s.taboption('general', widgets.NetworkSelect, 'wan_interface', _('WAN interface'));
		o.default = 'wan';
		o.rmempty = false;
		o.filter = function(section_id, value) {
			return value !== 'loopback';
		};

		o = s.taboption('general', widgets.NetworkSelect, 'source_interfaces', _('Source interfaces'));
		o.multiple = true;
		o.placeholder = 'miners';
		o.rmempty = false;
		o.filter = function(section_id, value) {
			return value !== 'loopback';
		};

		o = s.taboption('general', form.Value, 'check_interval', _('Check interval'));
		o.datatype = 'uinteger';
		o.default = '10';
		o.rmempty = false;

		o = s.taboption('general', form.Value, 'timeout', _('Timeout'));
		o.datatype = 'uinteger';
		o.default = '2';
		o.rmempty = false;

		o = s.taboption('general', form.Value, 'fail_threshold', _('Fail threshold'));
		o.datatype = 'uinteger';
		o.default = '3';
		o.rmempty = false;

		o = s.taboption('general', form.Value, 'recover_threshold', _('Recover threshold'));
		o.datatype = 'uinteger';
		o.default = '6';
		o.rmempty = false;

		o = s.taboption('outbound', form.TextValue, 'outbound_json', _('Outbound JSON'));
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
				return _('Invalid JSON: %s').format(e.message);
			}

			if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
				return _('Outbound must be a JSON object.');

			if (typeof parsed.type !== 'string' || !parsed.type)
				return _('Outbound must contain a string "type" field.');

			return true;
		};

		o = s.taboption('healthchecks', form.DynamicList, 'health_url', _('Healthcheck URLs'));
		o.datatype = 'url';
		o.placeholder = 'https://www.gstatic.com/generate_204';
		o.rmempty = false;

		o = s.taboption('status', form.DummyValue, '_status', _('Current status'));
		o.rawhtml = true;
		o.cfgvalue = function() {
			return E('div', { 'class': 'cbi-section' }, [
				E('p', {}, _('Current mode') + ': ' + (status.current_mode || 'unknown')),
				E('p', {}, _('Configured mode') + ': ' + (status.configured_mode || 'unknown')),
				E('p', {}, _('Direct check') + ': ' + (status.direct_result || 'unknown')),
				E('p', {}, _('Proxy check') + ': ' + (status.proxy_result || 'unknown')),
				E('p', {}, _('Last transition') + ': ' + (status.last_transition || '-')),
				E('p', {}, _('Fail counter') + ': ' + (status.fail_count || 0)),
				E('p', {}, _('Recover counter') + ': ' + (status.recover_count || 0)),
				E('p', {}, _('Last error') + ': ' + (status.last_error || '-')),
				E('pre', {}, JSON.stringify(status, null, 2))
			]);
		};

		addAction(s, '_start', _('Start'), '/etc/init.d/singbox-failover', [ 'start' ]);
		addAction(s, '_stop', _('Stop'), '/etc/init.d/singbox-failover', [ 'stop' ]);
		addAction(s, '_reload', _('Reload'), '/etc/init.d/singbox-failover', [ 'reload' ]);
		addAction(s, '_test_direct', _('Test direct'), '/usr/bin/singbox-failover', [ 'test_direct' ]);
		addAction(s, '_test_proxy', _('Test proxy'), '/usr/bin/singbox-failover', [ 'test_proxy' ]);

		return m.render();
	}
});
