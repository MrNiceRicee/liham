package app

import (
	"fmt"
	"os"

	tea "charm.land/bubbletea/v2"
	"charm.land/bubbles/v2/key"
	"charm.land/lipgloss/v2"
	"github.com/joshuasantos/liham/internal/preview"
	"github.com/joshuasantos/liham/internal/source"
)

var statusStyle = lipgloss.NewStyle().
	Foreground(lipgloss.Color("240"))

type Model struct {
	config     Config
	source     source.Model
	preview    preview.Model
	focus      FocusTarget
	syncScroll bool
	keys       keyMap
	width      int
	height     int
	ready      bool
}

func New(cfg Config) Model {
	return Model{
		config:     cfg,
		source:     source.New(),
		preview:    preview.New(),
		focus:      FocusSource,
		syncScroll: cfg.SyncScroll,
		keys:       defaultKeyMap(),
	}
}

func (m Model) Init() tea.Cmd {
	return nil
}

func (m Model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	var cmds []tea.Cmd

	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
		m.resize()
		return m, nil

	case tea.KeyPressMsg:
		switch {
		case key.Matches(msg, m.keys.Quit):
			return m, tea.Quit

		case key.Matches(msg, m.keys.Tab):
			if !m.config.PreviewOnly && !m.config.SourceOnly {
				m.toggleFocus()
			}
			return m, nil

		case key.Matches(msg, m.keys.SyncScroll):
			if !m.config.PreviewOnly && !m.config.SourceOnly {
				m.syncScroll = !m.syncScroll
			}
			return m, nil

		case key.Matches(msg, m.keys.Up, m.keys.Down, m.keys.PageUp, m.keys.PageDown, m.keys.HalfUp, m.keys.HalfDown):
			cmd := m.routeScroll(msg)
			return m, cmd
		}
	}

	// forward to both panes
	var cmd tea.Cmd
	m.source, cmd = m.source.Update(msg)
	if cmd != nil {
		cmds = append(cmds, cmd)
	}
	m.preview, cmd = m.preview.Update(msg)
	if cmd != nil {
		cmds = append(cmds, cmd)
	}

	return m, tea.Batch(cmds...)
}

func (m Model) View() tea.View {
	v := tea.NewView("")
	v.AltScreen = true
	v.MouseMode = tea.MouseModeCellMotion

	if !m.ready {
		v.Content = "loading..."
		return v
	}

	panes := joinPanes(
		m.config.Layout,
		m.config.PreviewOnly,
		m.config.SourceOnly,
		m.source.View(),
		m.preview.View(),
	)
	v.Content = panes + "\n" + m.statusBar()
	return v
}

func (m *Model) resize() {
	paneW, paneH := paneDimensions(
		m.config.Layout,
		m.config.PreviewOnly,
		m.config.SourceOnly,
		m.width,
		m.height,
	)

	// preserve scroll positions
	sourcePct := m.source.ScrollPercent()
	previewPct := m.preview.ScrollPercent()

	m.source.SetSize(paneW, paneH)
	m.preview.SetSize(paneW, paneH)

	// load file content on first ready
	if !m.ready {
		m.ready = true
		m.source.SetFocused(m.focus == FocusSource)
		m.preview.SetFocused(m.focus == FocusPreview)
		if m.config.FilePath != "" {
			m.loadFile(m.config.FilePath)
		}
	} else {
		m.source.SetScrollPercent(sourcePct)
		m.preview.SetScrollPercent(previewPct)
	}
}

func (m *Model) loadFile(path string) {
	data, err := os.ReadFile(path)
	if err != nil {
		m.source.SetContent(fmt.Sprintf("error reading file: %v", err))
		return
	}
	content := string(data)
	m.source.SetContent(content)
	m.preview.SetContent(content)
}

func (m *Model) toggleFocus() {
	if m.focus == FocusSource {
		m.focus = FocusPreview
	} else {
		m.focus = FocusSource
	}
	m.source.SetFocused(m.focus == FocusSource)
	m.preview.SetFocused(m.focus == FocusPreview)
}

func (m *Model) routeScroll(msg tea.Msg) tea.Cmd {
	var cmd tea.Cmd
	if m.focus == FocusSource {
		m.source, cmd = m.source.Update(msg)
		if m.syncScroll {
			m.preview.SetScrollPercent(m.source.ScrollPercent())
		}
	} else {
		m.preview, cmd = m.preview.Update(msg)
		if m.syncScroll {
			m.source.SetScrollPercent(m.preview.ScrollPercent())
		}
	}
	return cmd
}

func (m Model) statusBar() string {
	sync := "off"
	if m.syncScroll {
		sync = "on"
	}

	var hints string
	if m.config.PreviewOnly || m.config.SourceOnly {
		hints = fmt.Sprintf("scroll: j/k • sync: %s • q: quit", sync)
	} else {
		focus := "source"
		if m.focus == FocusPreview {
			focus = "preview"
		}
		hints = fmt.Sprintf("tab: focus [%s] • s: sync [%s] • j/k: scroll • q: quit", focus, sync)
	}

	return statusStyle.Width(m.width).Render(hints)
}

// Run starts the TUI program
func Run(cfg Config) error {
	m := New(cfg)
	p := tea.NewProgram(m)
	_, err := p.Run()
	return err
}
