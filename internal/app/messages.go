package app

// RenderCompleteMsg is sent when async glamour rendering finishes
type RenderCompleteMsg struct{ Output string }

// FileSelectedMsg is sent when a file is picked in browser mode
type FileSelectedMsg struct{ Path string }

// DirScanCompleteMsg is sent when async directory scanning finishes
type DirScanCompleteMsg struct{ Files []string }
