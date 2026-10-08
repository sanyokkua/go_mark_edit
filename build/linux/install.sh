#!/bin/sh
# Per-user install of GoMarkEdit's Open With registration on Linux.
# Never sets a default application and never touches mimeapps.list.
set -eu

usage() {
    echo "Usage: $0 [--uninstall]" >&2
}

mode=install
case "${1:-}" in
    "") ;;
    --uninstall) mode=uninstall ;;
    -h | --help)
        usage
        exit 0
        ;;
    *)
        usage
        exit 2
        ;;
esac
if [ "$#" -gt 1 ]; then
    usage
    exit 2
fi

here=$(cd "$(dirname "$0")" && pwd)
data_home=${XDG_DATA_HOME:-$HOME/.local/share}
bin_file=$HOME/.local/bin/GoMarkEdit
icon_file=$data_home/gomarkedit/gomarkedit.png
apps_dir=$data_home/applications
desktop_file=$apps_dir/gomarkedit.desktop
mime_dir=$data_home/mime
mime_file=$mime_dir/packages/gomarkedit.xml

refresh() {
    if command -v update-desktop-database >/dev/null 2>&1; then
        update-desktop-database "$apps_dir" || true
    else
        echo "notice: update-desktop-database not found; the menu may need a re-login to list GoMarkEdit" >&2
    fi
    if command -v update-mime-database >/dev/null 2>&1; then
        update-mime-database "$mime_dir" || true
    else
        echo "notice: update-mime-database not found; the Markdown glob may need a re-login to apply" >&2
    fi
}

if [ "$mode" = uninstall ]; then
    rm -f "$bin_file" "$icon_file" "$desktop_file" "$mime_file"
    rmdir "$(dirname "$icon_file")" 2>/dev/null || true
    refresh
    echo "GoMarkEdit uninstalled"
    exit 0
fi

for source in GoMarkEdit appicon.png gomarkedit.desktop gomarkedit-mime.xml; do
    [ -f "$here/$source" ] || {
        echo "error: $here/$source not found" >&2
        exit 1
    }
done

# The Desktop Entry format cannot carry these characters in a path without a second level of escaping.
case "$bin_file$icon_file" in
    *\"* | *\$* | *\`* | *\\*)
        echo "error: the install paths must not contain \", \$, \` or \\" >&2
        exit 1
        ;;
esac
exec_path=$(printf '%s' "$bin_file" | sed 's/%/%%/g')

mkdir -p "$(dirname "$bin_file")" "$(dirname "$icon_file")" "$apps_dir" "$(dirname "$mime_file")"
# Replace the binary atomically: copying over a running executable fails with "Text file busy".
cp "$here/GoMarkEdit" "$bin_file.new"
chmod 755 "$bin_file.new"
mv -f "$bin_file.new" "$bin_file"
cp "$here/appicon.png" "$icon_file"
while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
        Exec=*) printf 'Exec="%s" %%f\n' "$exec_path" ;;
        Icon=*) printf 'Icon=%s\n' "$icon_file" ;;
        *) printf '%s\n' "$line" ;;
    esac
done <"$here/gomarkedit.desktop" >"$desktop_file"
cp "$here/gomarkedit-mime.xml" "$mime_file"
refresh
echo "GoMarkEdit installed to $bin_file"
