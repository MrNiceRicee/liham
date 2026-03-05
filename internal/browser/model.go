package browser

import (
	"io/fs"
	"os"
	"path/filepath"
	"strings"

	tea "charm.land/bubbletea/v2"
	"charm.land/bubbles/v2/list"
)

const (
	maxDepth = 3
	maxFiles = 1000
)

// fileItem implements list.DefaultItem
type fileItem struct {
	path string
	name string
	dir  string
}

func (i fileItem) Title() string       { return i.name }
func (i fileItem) Description() string { return i.dir }
func (i fileItem) FilterValue() string { return i.name }

// FileSelectedMsg is sent when the user picks a file
type FileSelectedMsg struct{ Path string }

type Model struct {
	list    list.Model
	dir     string
	width   int
	height  int
	ready   bool
	scanned bool
}

func New(dir string) Model {
	delegate := list.NewDefaultDelegate()
	l := list.New([]list.Item{}, delegate, 0, 0)
	l.Title = "markdown files"
	l.SetShowStatusBar(true)
	l.SetFilteringEnabled(true)

	return Model{
		list: l,
		dir:  dir,
	}
}

func (m *Model) SetSize(w, h int) {
	m.width = w
	m.height = h
	m.list.SetSize(w, h)
	m.ready = true
}

func (m Model) Update(msg tea.Msg) (Model, tea.Cmd) {
	switch msg := msg.(type) {
	case scanCompleteMsg:
		items := make([]list.Item, len(msg.files))
		for i, path := range msg.files {
			rel, err := filepath.Rel(m.dir, path)
			if err != nil {
				rel = path
			}
			items[i] = fileItem{
				path: path,
				name: filepath.Base(path),
				dir:  filepath.Dir(rel),
			}
		}
		cmd := m.list.SetItems(items)
		m.scanned = true
		return m, cmd

	case tea.KeyPressMsg:
		if msg.String() == "enter" {
			item := m.list.SelectedItem()
			if item != nil {
				if fi, ok := item.(fileItem); ok {
					return m, func() tea.Msg {
						return FileSelectedMsg{Path: fi.path}
					}
				}
			}
			return m, nil
		}
	}

	var cmd tea.Cmd
	m.list, cmd = m.list.Update(msg)
	return m, cmd
}

func (m Model) View() string {
	if !m.ready {
		return ""
	}
	return m.list.View()
}

// ScanDir returns a tea.Cmd that walks the directory and sends results
func (m Model) ScanDir() tea.Cmd {
	dir := m.dir
	return func() tea.Msg {
		var files []string
		count := 0
		filepath.WalkDir(dir, func(path string, d fs.DirEntry, err error) error {
			if err != nil {
				return fs.SkipDir
			}
			depth := strings.Count(strings.TrimPrefix(path, dir), string(os.PathSeparator))
			if depth > maxDepth {
				return fs.SkipDir
			}
			if !d.IsDir() && strings.HasSuffix(strings.ToLower(d.Name()), ".md") {
				// basic sanitization — skip files with control characters
				if !hasControlChars(d.Name()) {
					files = append(files, path)
					count++
					if count >= maxFiles {
						return fs.SkipAll
					}
				}
			}
			return nil
		})
		return scanCompleteMsg{files: files}
	}
}

type scanCompleteMsg struct{ files []string }

func hasControlChars(s string) bool {
	for _, r := range s {
		if r < 32 && r != '\t' {
			return true
		}
	}
	return false
}
