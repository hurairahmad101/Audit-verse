{pkgs}: {
  deps = [
    pkgs.chromium
    pkgs.expat
    pkgs.dbus
    pkgs.glib
    pkgs.cairo
    pkgs.pango
    pkgs.xorg.libXrandr
    pkgs.xorg.libXfixes
    pkgs.xorg.libXdamage
    pkgs.xorg.libXcomposite
    pkgs.at-spi2-core
    pkgs.cups
    pkgs.alsa-lib
    pkgs.libxkbcommon
    pkgs.mesa
    pkgs.libdrm
    pkgs.nss
    pkgs.nspr
    pkgs.libreoffice-fresh
  ];
}
