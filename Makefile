include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-cloudflareapi
PKG_VERSION:=1.0.0
PKG_RELEASE:=5
PKG_MAINTAINER:=Code
PKG_LICENSE:=MIT

LUCI_TITLE:=LuCI support for Cloudflare DNS public IP updater
LUCI_DEPENDS:=+luci-base +curl +jsonfilter +ca-bundle
LUCI_PKGARCH:=all

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
