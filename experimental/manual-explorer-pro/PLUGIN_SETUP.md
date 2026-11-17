# Nomie 6 plugin setup

The app is a hosted iframe plugin, not a native Nomie bundle. It loads the official \`nomie-plugin.js\` bridge and registers a capture-menu entry, More-menu entry, and dashboard widget.

## Install

1. Deploy a stable HTTPS preview URL for this branch.
2. In Nomie 6, open **More → Plugins → + / Add Custom Plugin**.
3. Paste the stable branch preview URL for this app.
4. Install the plugin.
5. Add the Manual Explorer widget from Nomie's dashboard widget picker.

Do not use an ephemeral deployment URL for the permanent plugin registration; use the stable branch alias or the final production domain after release.

## Permissions

The plugin declares:
- \`createNote\` for recording repair notes in Nomie.
- \`onLaunch\` for launch lifecycle notifications.
- \`selectTrackables\` for the user-initiated trackable picker.

It does not request location access. Browsing manuals does not require a Nomie or GitHub account.

## Widget

The plugin registers a \`lifeos-manual-explorer\` widget in Nomie plugin storage. Nomie passes the selected widget identifier through \`widgetindex\`; the app renders a compact garage view in that mode.
