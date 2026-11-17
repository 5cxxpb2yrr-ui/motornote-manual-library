# Nomie 6 plugin setup

LifeOS Manual Explorer is a hosted iframe plugin using Nomie's official \`nomie-plugin.js\` bridge. The plugin registers a Capture-menu entry, More-menu entry, and a Dashboard widget.

## Install

1. Wait for the feature branch preview deployment to complete.
2. In Nomie 6, open **More → Plugins → + / Add Custom Plugin**.
3. Paste the stable branch preview URL for this app.
4. Install the plugin.
5. Add **Manual Explorer** from Nomie's Dashboard widget picker.

Use the stable branch alias after it has been verified. Do not use a short-lived deployment hash URL for permanent registration.

## Declared permissions

The plugin declares:
- \`createNote\` to save repair notes in Nomie.
- \`onLaunch\` for launch lifecycle notifications.
- \`selectTrackables\` for the user-initiated tracker picker.
- \`getTrackableInput\` for user-requested tracker values.

It does not request location access. Manual browsing does not require a Nomie or GitHub account.

## Registration and storage

The plugin initializes Nomie storage inside \`onRegistered\`, then registers the widget definition in the \`widgets\` storage key. Widget definitions include Nomie's required \`widgetid\`, \`name\`, and \`emoji\` fields.

Nomie passes a \`widgetindex\` query parameter when it opens the selected widget. The app detects that mode and renders the compact garage view.

## Supported bridge actions

- Open the app or a specific manual page from a plugin action.
- Search the indexed manuals.
- Select a tracker or request tracker input.
- Save a repair note using \`createNote\`.
- Open the full Nomie note editor.
- Export, import, and sync LifeOS plugin data.

GitHub authentication remains optional for local browsing and repair-cart use.