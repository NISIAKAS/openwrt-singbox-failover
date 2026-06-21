include $(TOPDIR)/rules.mk

PKG_NAME:=singbox-failover
PKG_VERSION:=0.1.0
PKG_RELEASE:=7
PKG_LICENSE:=MIT
PKG_MAINTAINER:=NISIAKAS
PKGARCH:=all

include $(INCLUDE_DIR)/package.mk

define Package/singbox-failover
  SECTION:=net
  CATEGORY:=Network
  TITLE:=sing-box WAN failover controller
  DEPENDS:=+sing-box +curl +jq +nftables-json +ip-tiny
endef

define Package/singbox-failover/description
Disabled-by-default sing-box failover controller. It routes selected source
interfaces through a separate sing-box instance only after the service is
enabled and started.
endef

define Package/singbox-failover/conffiles
/etc/config/singbox_failover
endef

define Build/Compile
endef

define Package/singbox-failover/install
	$(INSTALL_DIR) $(1)/etc/config
	$(INSTALL_CONF) ./files/etc/config/singbox_failover $(1)/etc/config/singbox_failover
	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_BIN) ./files/etc/init.d/singbox-failover $(1)/etc/init.d/singbox-failover
	$(INSTALL_DIR) $(1)/usr/bin
	$(INSTALL_BIN) ./files/usr/bin/singbox-failover $(1)/usr/bin/singbox-failover
endef

define Package/singbox-failover/postinst
#!/bin/sh
[ -n "$${IPKG_INSTROOT}" ] && exit 0
changed=0
uci -q get singbox_failover.main.health_policy >/dev/null || {
	uci set singbox_failover.main.health_policy='any_ok'
	changed=1
}
uci -q get singbox_failover.main.health_quorum >/dev/null || {
	uci set singbox_failover.main.health_quorum='1'
	changed=1
}
[ "$$changed" = "1" ] && uci commit singbox_failover
/etc/init.d/singbox-failover stop >/dev/null 2>&1 || true
/etc/init.d/singbox-failover disable >/dev/null 2>&1 || true
exit 0
endef

define Package/singbox-failover/prerm
#!/bin/sh
[ -n "$${IPKG_INSTROOT}" ] && exit 0
/etc/init.d/singbox-failover stop >/dev/null 2>&1 || true
exit 0
endef

$(eval $(call BuildPackage,singbox-failover))
