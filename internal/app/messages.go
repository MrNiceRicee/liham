package app

type FileChangedMsg struct{ Content []byte }
type FileDeletedMsg struct{}
type FileSelectedMsg struct{ Path string }
type RenderCompleteMsg struct{ Output string }
type DirScanCompleteMsg struct{ Files []string }
