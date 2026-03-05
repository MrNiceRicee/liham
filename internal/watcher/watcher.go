package watcher

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"time"

	tea "charm.land/bubbletea/v2"
	"github.com/fsnotify/fsnotify"
)

// FileChangedMsg is sent when the watched file is modified
type FileChangedMsg struct{ Content []byte }

// FileDeletedMsg is sent when the watched file is removed or renamed away
type FileDeletedMsg struct{}

// Watch starts watching a file for changes by monitoring its parent directory.
// sends FileChangedMsg/FileDeletedMsg via p.Send(). respects context for clean shutdown.
func Watch(ctx context.Context, path string, p *tea.Program) error {
	w, err := fsnotify.NewWatcher()
	if err != nil {
		return err
	}

	dir := filepath.Dir(path)
	base := filepath.Base(path)

	if err := w.Add(dir); err != nil {
		w.Close()
		return err
	}

	go func() {
		defer w.Close()

		var debounce *time.Timer

		for {
			select {
			case <-ctx.Done():
				if debounce != nil {
					debounce.Stop()
				}
				return

			case event, ok := <-w.Events:
				if !ok {
					return
				}
				if filepath.Base(event.Name) != base {
					continue
				}
				if isVimTemp(event.Name) {
					continue
				}

				if event.Has(fsnotify.Write) || event.Has(fsnotify.Create) {
					if debounce != nil {
						debounce.Stop()
					}
					debounce = time.AfterFunc(80*time.Millisecond, func() {
						content, err := os.ReadFile(path)
						if err == nil {
							p.Send(FileChangedMsg{Content: content})
						}
					})
				}

				if event.Has(fsnotify.Remove) || event.Has(fsnotify.Rename) {
					if debounce != nil {
						debounce.Stop()
					}
					p.Send(FileDeletedMsg{})
				}

			case _, ok := <-w.Errors:
				if !ok {
					return
				}
			}
		}
	}()

	return nil
}

func isVimTemp(name string) bool {
	base := filepath.Base(name)
	return base == "4913" ||
		strings.HasSuffix(base, "~") ||
		strings.HasSuffix(base, ".swp") ||
		strings.HasSuffix(base, ".swx")
}
