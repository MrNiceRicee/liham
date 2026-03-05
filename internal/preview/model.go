package preview

import (
	"strings"

	tea "charm.land/bubbletea/v2"
	"charm.land/bubbles/v2/viewport"
	"charm.land/lipgloss/v2"
	"github.com/charmbracelet/glamour"
)

var (
	focusedStyle = lipgloss.NewStyle().
			Border(lipgloss.RoundedBorder()).
			BorderForeground(lipgloss.Color("62"))

	blurredStyle = lipgloss.NewStyle().
			Border(lipgloss.RoundedBorder()).
			BorderForeground(lipgloss.Color("240"))
)

type Model struct {
	viewport      viewport.Model
	renderer      *glamour.TermRenderer
	rendered      string
	raw           string
	width         int
	height        int
	rendererWidth int
	ready         bool
	focused       bool
}

func New() Model {
	return Model{}
}

func (m *Model) SetSize(w, h int) {
	m.width = w
	m.height = h

	innerW := w - 2
	innerH := h - 2
	if innerW < 1 {
		innerW = 1
	}
	if innerH < 1 {
		innerH = 1
	}

	if !m.ready {
		m.viewport = viewport.New(
			viewport.WithWidth(innerW),
			viewport.WithHeight(innerH),
		)
		m.viewport.MouseWheelEnabled = true
		m.viewport.SoftWrap = true
		m.ready = true
		m.ensureRenderer(innerW)
		// render any content that was set before the viewport was created
		if m.raw != "" {
			m.render()
		}
	} else {
		m.viewport.SetWidth(innerW)
		m.viewport.SetHeight(innerH)
		if m.rendererWidth != innerW {
			m.ensureRenderer(innerW)
			m.render()
		}
	}
}

func (m *Model) ensureRenderer(width int) {
	m.renderer, _ = glamour.NewTermRenderer(
		glamour.WithAutoStyle(),
		glamour.WithWordWrap(width),
	)
	m.rendererWidth = width
}

func (m *Model) render() {
	if m.renderer == nil || m.raw == "" {
		return
	}
	out, err := m.renderer.Render(m.raw)
	if err != nil {
		m.rendered = m.raw
	} else {
		// glamour adds trailing newlines, trim them
		m.rendered = strings.TrimRight(out, "\n")
	}
	if m.ready {
		m.viewport.SetContent(m.rendered)
	}
}

func (m *Model) SetContent(raw string) {
	m.raw = raw
	m.render()
}

func (m *Model) SetFocused(focused bool) {
	m.focused = focused
}

func (m Model) ScrollPercent() float64 {
	if !m.ready {
		return 0
	}
	return m.viewport.ScrollPercent()
}

func (m *Model) SetScrollPercent(pct float64) {
	if !m.ready {
		return
	}
	totalLines := m.viewport.TotalLineCount()
	height := m.viewport.Height()
	if totalLines <= height {
		m.viewport.SetYOffset(0)
		return
	}
	offset := int(float64(totalLines-height) * pct)
	m.viewport.SetYOffset(offset)
}

func (m Model) Update(msg tea.Msg) (Model, tea.Cmd) {
	var cmd tea.Cmd
	m.viewport, cmd = m.viewport.Update(msg)
	return m, cmd
}

func (m Model) View() string {
	if !m.ready {
		return ""
	}
	style := blurredStyle
	if m.focused {
		style = focusedStyle
	}
	return style.
		Width(m.width - 2).
		Render(m.viewport.View())
}
