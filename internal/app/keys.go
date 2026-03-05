package app

import "charm.land/bubbles/v2/key"

type keyMap struct {
	Quit       key.Binding
	Tab        key.Binding
	SyncScroll key.Binding
	Up         key.Binding
	Down       key.Binding
	PageUp     key.Binding
	PageDown   key.Binding
	HalfUp     key.Binding
	HalfDown   key.Binding
}

func defaultKeyMap() keyMap {
	return keyMap{
		Quit: key.NewBinding(
			key.WithKeys("q", "ctrl+c"),
		),
		Tab: key.NewBinding(
			key.WithKeys("tab"),
			key.WithHelp("tab", "focus"),
		),
		SyncScroll: key.NewBinding(
			key.WithKeys("s"),
			key.WithHelp("s", "sync"),
		),
		Up: key.NewBinding(
			key.WithKeys("k", "up"),
		),
		Down: key.NewBinding(
			key.WithKeys("j", "down"),
		),
		PageUp: key.NewBinding(
			key.WithKeys("pgup"),
		),
		PageDown: key.NewBinding(
			key.WithKeys("pgdown"),
		),
		HalfUp: key.NewBinding(
			key.WithKeys("ctrl+u"),
		),
		HalfDown: key.NewBinding(
			key.WithKeys("ctrl+d"),
		),
	}
}
