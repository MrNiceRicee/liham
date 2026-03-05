package app

import "charm.land/lipgloss/v2"

func joinPanes(layout Layout, previewOnly, sourceOnly bool, sourceView, previewView string) string {
	if previewOnly {
		return previewView
	}
	if sourceOnly {
		return sourceView
	}
	if layout == LayoutTop {
		return lipgloss.JoinVertical(lipgloss.Left, sourceView, previewView)
	}
	return lipgloss.JoinHorizontal(lipgloss.Top, sourceView, previewView)
}

func paneDimensions(layout Layout, previewOnly, sourceOnly bool, totalW, totalH int) (paneW, paneH int) {
	// reserve 1 row for status bar
	h := totalH - 1

	if previewOnly || sourceOnly {
		return totalW, h
	}
	if layout == LayoutTop {
		return totalW, h / 2
	}
	return totalW / 2, h
}
