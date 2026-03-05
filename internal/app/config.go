package app

// Mode represents the app's current state
type Mode int

const (
	ModeBrowser Mode = iota
	ModePreview
)

// Layout controls how panes are arranged
type Layout int

const (
	LayoutSide Layout = iota
	LayoutTop
)

type Config struct {
	FilePath     string
	DirPath      string
	Layout       Layout
	PreviewOnly  bool
	SourceOnly   bool
	NoWatch      bool
	SyncScroll   bool
	GlamourStyle string
}
