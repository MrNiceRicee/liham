package app

import (
	"context"
	"fmt"
	"os"

	tea "charm.land/bubbletea/v2"
	"charm.land/bubbles/v2/key"
	"charm.land/lipgloss/v2"
	"github.com/joshuasantos/liham/internal/browser"
	"github.com/joshuasantos/liham/internal/preview"
	"github.com/joshuasantos/liham/internal/source"
	"github.com/joshuasantos/liham/internal/watcher"
)

var statusStyle = lipgloss.NewStyle().
	Foreground(lipgloss.Color("240"))

type Model struct {
	config        Config
	mode          Mode
	source        source.Model
	preview       preview.Model
	browser       browser.Model
	focus         FocusTarget
	syncScroll    bool
	keys          keyMap
	width         int
	height        int
	ready         bool
	program       *tea.Program
	watcherCancel context.CancelFunc
	fileDeleted   bool
	largeFile     bool
	currentFile   string
}

func New(cfg Config) Model {
	m := Model{
		config:     cfg,
		source:     source.New(),
		preview:    preview.New(),
		focus:      FocusSource,
		syncScroll: cfg.SyncScroll,
		keys:       defaultKeyMap(),
	}

	// determine initial mode
	if cfg.FilePath != "" {
		m.mode = ModePreview
	} else {
		m.mode = ModeBrowser
		dir := cfg.DirPath
		if dir == "" {
			dir, _ = os.Getwd()
		}
		m.browser = browser.New(dir)
	}

	return m
}

func (m Model) Init() tea.Cmd {
	if m.mode == ModeBrowser {
		return m.browser.ScanDir()
	}
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

	case programMsg:
		m.program = msg.p
		if m.ready && m.mode == ModePreview {
			m.startWatcher()
		}
		return m, nil

	case tea.KeyPressMsg:
		return m.handleKey(msg)

	case tea.MouseWheelMsg:
		if m.mode == ModePreview && m.syncScroll {
			// scroll the focused pane and sync the other
			cmd := m.routeScroll(msg)
			return m, cmd
		}
		// without sync, let both panes handle mouse independently (fall through)

	case watcher.FileChangedMsg:
		m.fileDeleted = false
		content := string(msg.Content)
		m.source.SetContent(content)
		return m, func() tea.Msg {
			return RenderCompleteMsg{Output: content}
		}

	case RenderCompleteMsg:
		m.preview.SetContent(msg.Output)
		return m, nil

	case watcher.FileDeletedMsg:
		m.fileDeleted = true
		m.stopWatcher()
		return m, nil

	case browser.FileSelectedMsg:
		return m.openFile(msg.Path)
	}

	// forward to active components
	if m.mode == ModeBrowser {
		var cmd tea.Cmd
		m.browser, cmd = m.browser.Update(msg)
		if cmd != nil {
			cmds = append(cmds, cmd)
		}
	} else {
		var cmd tea.Cmd
		m.source, cmd = m.source.Update(msg)
		if cmd != nil {
			cmds = append(cmds, cmd)
		}
		m.preview, cmd = m.preview.Update(msg)
		if cmd != nil {
			cmds = append(cmds, cmd)
		}
	}

	return m, tea.Batch(cmds...)
}

func (m Model) handleKey(msg tea.KeyPressMsg) (tea.Model, tea.Cmd) {
	switch {
	case key.Matches(msg, m.keys.Quit):
		// in browser mode, q quits. in preview mode from browser, q also quits.
		m.stopWatcher()
		return m, tea.Quit

	case m.mode == ModePreview && (msg.String() == "esc" || msg.String() == "b"):
		// only return to browser if we came from browser (DirPath set or no FilePath)
		if m.config.FilePath == "" {
			return m.returnToBrowser()
		}
		return m, nil

	case m.mode == ModePreview && key.Matches(msg, m.keys.Tab):
		if !m.config.PreviewOnly && !m.config.SourceOnly {
			m.toggleFocus()
		}
		return m, nil

	case m.mode == ModePreview && key.Matches(msg, m.keys.SyncScroll):
		if !m.config.PreviewOnly && !m.config.SourceOnly {
			m.syncScroll = !m.syncScroll
		}
		return m, nil

	case m.mode == ModePreview && key.Matches(msg, m.keys.Up, m.keys.Down, m.keys.PageUp, m.keys.PageDown, m.keys.HalfUp, m.keys.HalfDown):
		cmd := m.routeScroll(msg)
		return m, cmd
	}

	// in browser mode, forward keys to browser (except q which was caught above)
	if m.mode == ModeBrowser {
		var cmd tea.Cmd
		m.browser, cmd = m.browser.Update(msg)
		return m, cmd
	}

	return m, nil
}

func (m Model) View() tea.View {
	v := tea.NewView("")
	v.AltScreen = true
	v.MouseMode = tea.MouseModeCellMotion

	if !m.ready {
		v.Content = "loading..."
		return v
	}

	if m.mode == ModeBrowser {
		v.Content = m.browser.View()
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
	if m.mode == ModeBrowser {
		m.browser.SetSize(m.width, m.height)
		if !m.ready {
			m.ready = true
		}
		return
	}

	paneW, paneH := paneDimensions(
		m.config.Layout,
		m.config.PreviewOnly,
		m.config.SourceOnly,
		m.width,
		m.height,
	)

	sourcePct := m.source.ScrollPercent()
	previewPct := m.preview.ScrollPercent()

	m.source.SetSize(paneW, paneH)
	m.preview.SetSize(paneW, paneH)

	if !m.ready {
		m.ready = true
		m.source.SetFocused(m.focus == FocusSource)
		m.preview.SetFocused(m.focus == FocusPreview)
		if m.config.FilePath != "" {
			m.loadFile(m.config.FilePath)
			m.startWatcher()
		}
	} else {
		m.source.SetScrollPercent(sourcePct)
		m.preview.SetScrollPercent(previewPct)
	}
}

func (m *Model) openFile(path string) (tea.Model, tea.Cmd) {
	m.mode = ModePreview
	m.currentFile = path
	m.fileDeleted = false

	// size panes if we have dimensions
	if m.width > 0 {
		paneW, paneH := paneDimensions(
			m.config.Layout,
			m.config.PreviewOnly,
			m.config.SourceOnly,
			m.width,
			m.height,
		)
		m.source.SetSize(paneW, paneH)
		m.preview.SetSize(paneW, paneH)
	}

	m.source.SetFocused(m.focus == FocusSource)
	m.preview.SetFocused(m.focus == FocusPreview)
	m.loadFile(path)

	// start watching the opened file
	m.config.FilePath = ""
	m.currentFile = path
	m.startWatcherForFile(path)

	return m, nil
}

func (m *Model) returnToBrowser() (tea.Model, tea.Cmd) {
	m.stopWatcher()
	m.mode = ModeBrowser
	m.currentFile = ""
	m.fileDeleted = false

	// resize browser to current dimensions
	if m.width > 0 {
		m.browser.SetSize(m.width, m.height)
	}

	return m, nil
}

func (m *Model) loadFile(path string) {
	data, err := os.ReadFile(path)
	if err != nil {
		m.source.SetContent(fmt.Sprintf("error reading file: %v", err))
		return
	}
	m.largeFile = len(data) > 1024*1024 // >1MB
	content := string(data)
	m.source.SetContent(content)
	m.preview.SetContent(content)
}

func (m *Model) startWatcher() {
	if m.config.NoWatch || m.config.FilePath == "" || m.program == nil {
		return
	}
	m.stopWatcher()
	ctx, cancel := context.WithCancel(context.Background())
	m.watcherCancel = cancel
	_ = watcher.Watch(ctx, m.config.FilePath, m.program)
}

func (m *Model) startWatcherForFile(path string) {
	if m.config.NoWatch || m.program == nil {
		return
	}
	m.stopWatcher()
	ctx, cancel := context.WithCancel(context.Background())
	m.watcherCancel = cancel
	_ = watcher.Watch(ctx, path, m.program)
}

func (m *Model) stopWatcher() {
	if m.watcherCancel != nil {
		m.watcherCancel()
		m.watcherCancel = nil
	}
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
	if m.fileDeleted {
		return statusStyle.Width(m.width).
			Foreground(lipgloss.Color("196")).
			Render("⚠ file deleted — source shows last known content")
	}

	sync := "off"
	if m.syncScroll {
		sync = "on"
	}

	var hints string
	if m.largeFile {
		hints = "⚠ large file • "
	}
	if m.config.PreviewOnly || m.config.SourceOnly {
		hints += fmt.Sprintf("scroll: j/k • sync: %s • q: quit", sync)
	} else {
		focus := "source"
		if m.focus == FocusPreview {
			focus = "preview"
		}
		if m.currentFile != "" && m.config.FilePath == "" {
			hints += "esc: back • "
		}
		hints += fmt.Sprintf("tab: focus [%s] • s: sync [%s] • j/k: scroll • q: quit", focus, sync)
	}

	return statusStyle.Width(m.width).Render(hints)
}

// programMsg is sent internally to give the model access to the program for p.Send()
type programMsg struct{ p *tea.Program }

// Run starts the TUI program
func Run(cfg Config) error {
	m := New(cfg)
	p := tea.NewProgram(m)
	go func() {
		p.Send(programMsg{p: p})
	}()
	_, err := p.Run()
	return err
}
