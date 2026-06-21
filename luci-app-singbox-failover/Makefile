include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-singbox-failover
PKG_VERSION:=0.1.0
PKG_RELEASE:=1
PKG_LICENSE:=MIT
PKG_MAINTAINER:=NISIAKAS
PKGARCH:=all

include $(INCLUDE_DIR)/package.mk

define Package/luci-app-singbox-failover
  SECTION:=luci
  CATEGORY:=LuCI
  SUBMENU:=3. Applications
  TITLE:=LuCI support for sing-box failover
  DEPENDS:=+luci-base +rpcd +singbox-failover
endef

define Package/luci-app-singbox-failover/description
LuCI interface for singbox-failover.
endef

define Build/Compile
endef

define Package/luci-app-singbox-failover/install
	$(INSTALL_DIR) $(1)/usr/share/luci/menu.d
	$(INSTALL_DATA) ./files/usr/share/luci/menu.d/luci-app-singbox-failover.json $(1)/usr/share/luci/menu.d/luci-app-singbox-failover.json
	$(INSTALL_DIR) $(1)/usr/share/rpcd/acl.d
	$(INSTALL_DATA) ./files/usr/share/rpcd/acl.d/luci-app-singbox-failover.json $(1)/usr/share/rpcd/acl.d/luci-app-singbox-failover.json
	$(INSTALL_DIR) $(1)/www/luci-static/resources/view
	$(INSTALL_DATA) ./files/www/luci-static/resources/view/singbox-failover.js $(1)/www/luci-static/resources/view/singbox-failover.js
endef

$(eval $(call BuildPackage,luci-app-singbox-failover))

