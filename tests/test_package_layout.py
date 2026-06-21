import json
import pathlib
import re
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]


def read(relpath: str) -> str:
    return (ROOT / relpath).read_text(encoding="utf-8")


class PackageLayoutTests(unittest.TestCase):
    def test_core_package_files_exist(self):
        required = [
            "singbox-failover/Makefile",
            "singbox-failover/files/etc/config/singbox_failover",
            "singbox-failover/files/etc/init.d/singbox-failover",
            "singbox-failover/files/usr/bin/singbox-failover",
        ]
        for relpath in required:
            self.assertTrue((ROOT / relpath).is_file(), relpath)

    def test_luci_package_files_exist(self):
        required = [
            "luci-app-singbox-failover/Makefile",
            "luci-app-singbox-failover/files/usr/share/luci/menu.d/luci-app-singbox-failover.json",
            "luci-app-singbox-failover/files/usr/share/rpcd/acl.d/luci-app-singbox-failover.json",
            "luci-app-singbox-failover/files/www/luci-static/resources/view/singbox-failover.js",
        ]
        for relpath in required:
            self.assertTrue((ROOT / relpath).is_file(), relpath)

    def test_core_package_is_arch_independent_and_safe_by_default(self):
        makefile = read("singbox-failover/Makefile")
        self.assertIn("PKGARCH:=all", makefile)
        self.assertIn("+sing-box", makefile)
        self.assertIn("+curl", makefile)
        self.assertIn("+jq", makefile)
        self.assertNotIn("/etc/init.d/singbox-failover enable", makefile)
        self.assertNotIn("/etc/init.d/singbox-failover start", makefile)

    def test_default_config_is_disabled_and_non_mutating(self):
        config = read("singbox-failover/files/etc/config/singbox_failover")
        self.assertRegex(config, r"option\s+enabled\s+'0'")
        self.assertRegex(config, r"option\s+mode\s+'auto'")
        self.assertRegex(config, r"option\s+wan_interface\s+'wan'")
        self.assertRegex(config, r"list\s+source_interfaces\s+'miners'")
        self.assertRegex(config, r"option\s+outbound_json\s+''")

    def test_runtime_uses_isolated_ports_marks_and_table(self):
        script = read("singbox-failover/files/usr/bin/singbox-failover")
        self.assertIn("TPROXY_PORT=1702", script)
        self.assertIn("MIXED_PORT=1703", script)
        self.assertIn("MARK=0x00200000", script)
        self.assertIn("ROUTE_TABLE=206", script)
        self.assertIn("TABLE_NAME=singbox_failover", script)
        self.assertNotIn("PodkopTable", script)
        self.assertNotIn("127.0.0.1:1602", script)
        self.assertNotIn("127.0.0.42", script)

    def test_luci_menu_and_acl_are_valid_json(self):
        menu = json.loads(read("luci-app-singbox-failover/files/usr/share/luci/menu.d/luci-app-singbox-failover.json"))
        self.assertIn("admin/services/singbox-failover", menu)

        acl = json.loads(read("luci-app-singbox-failover/files/usr/share/rpcd/acl.d/luci-app-singbox-failover.json"))
        self.assertIn("luci-app-singbox-failover", acl)
        app_acl = acl["luci-app-singbox-failover"]
        self.assertIn("singbox_failover", app_acl["read"]["uci"])
        self.assertIn("singbox_failover", app_acl["write"]["uci"])
        self.assertIn("/usr/bin/singbox-failover", app_acl["read"]["file"])

    def test_luci_view_exposes_required_tabs_and_actions(self):
        view = read("luci-app-singbox-failover/files/www/luci-static/resources/view/singbox-failover.js")
        for label in ["General", "Outbound", "Healthchecks", "Status", "Actions"]:
            self.assertIn(label, view)
        for command in ["test_direct", "test_proxy", "start", "stop", "reload"]:
            self.assertIn(command, view)
        self.assertIn("outbound_json", view)
        self.assertRegex(view, r"JSON\.parse")

    def test_luci_view_uses_network_select_for_interfaces(self):
        view = read("luci-app-singbox-failover/files/www/luci-static/resources/view/singbox-failover.js")
        self.assertIn("require tools.widgets as widgets", view)
        self.assertRegex(view, r"widgets\.NetworkSelect,\s*'wan_interface'")
        self.assertRegex(view, r"widgets\.NetworkSelect,\s*'source_interfaces'")
        self.assertIn("o.multiple = true", view)


if __name__ == "__main__":
    unittest.main()
