# openwrt-singbox-failover

Two OpenWrt packages for a disabled-by-default sing-box failover controller:

- `singbox-failover`: shell runtime, UCI config, procd init script.
- `luci-app-singbox-failover`: LuCI page under `Services -> Sing-box Failover`.

The package is intentionally inert after installation. It does not enable init,
start a daemon, create nftables rules, or change existing routing until the user
enables and starts it.

## Router Target

Initial target:

- OpenWrt `25.12.2`
- target `mediatek/filogic`
- arch `aarch64_cortex-a53`

The package payload is architecture-independent (`PKGARCH:=all`) because it is
shell, UCI, and LuCI JavaScript only.

## Safety Model

- Separate sing-box runtime config: `/tmp/singbox-failover/config.json`
- Separate tproxy inbound: `127.0.0.1:1702`
- Separate mixed inbound for proxy checks: `127.0.0.1:1703`
- Separate nft table: `inet singbox_failover`
- Separate mark: `0x00200000`
- Separate route table: `206 singbox_failover`

When disabled, the service exits after cleanup and leaves traffic direct.

## Build

The GitHub workflow downloads the OpenWrt SDK for the target release and builds
both APK packages.

Local SDK build outline:

```sh
mkdir -p sdk/package/openwrt-singbox-failover
cp -a singbox-failover luci-app-singbox-failover sdk/package/openwrt-singbox-failover/
cd sdk
make defconfig
make package/singbox-failover/compile V=s
make package/luci-app-singbox-failover/compile V=s
```

## First Router Deployment

Install only:

```sh
apk add --allow-untrusted /tmp/singbox-failover-*.apk /tmp/luci-app-singbox-failover-*.apk
```

Then verify:

```sh
/etc/init.d/singbox-failover enabled; echo $?
nft list tables | grep singbox_failover
uci show singbox_failover
```

Expected after install: init disabled, no `singbox_failover` nft table, internet unchanged.

