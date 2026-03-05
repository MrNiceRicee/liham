package cmd

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/joshuasantos/liham/internal/app"
	"github.com/spf13/cobra"
)

var (
	layout      string
	previewOnly bool
	sourceOnly  bool
	noWatch     bool
	syncScroll  bool
)

var rootCmd = &cobra.Command{
	Use:   "liham [file|directory]",
	Short: "terminal markdown previewer",
	Long:  "a split-pane markdown previewer with live reload, scroll sync, and file browsing",
	Args:  cobra.MaximumNArgs(1),
	PreRunE: func(cmd *cobra.Command, args []string) error {
		if previewOnly && sourceOnly {
			return fmt.Errorf("--preview-only and --source-only are mutually exclusive")
		}
		if layout != "side" && layout != "top" {
			return fmt.Errorf("--layout must be 'side' or 'top', got %q", layout)
		}
		return nil
	},
	RunE: func(cmd *cobra.Command, args []string) error {
		cfg := app.Config{
			PreviewOnly: previewOnly,
			SourceOnly:  sourceOnly,
			NoWatch:     noWatch,
			SyncScroll:  syncScroll,
		}

		if layout == "top" {
			cfg.Layout = app.LayoutTop
		}

		if len(args) == 0 {
			// browser mode — use current directory
			cwd, err := os.Getwd()
			if err != nil {
				return fmt.Errorf("cannot determine working directory: %w", err)
			}
			cfg.DirPath = cwd
			return app.Run(cfg)
		}

		// resolve the argument
		resolved, err := resolvePath(args[0])
		if err != nil {
			return err
		}

		info, err := os.Stat(resolved)
		if err != nil {
			return fmt.Errorf("cannot access %q: %w", args[0], err)
		}

		if info.IsDir() {
			cfg.DirPath = resolved
		} else {
			cfg.FilePath = resolved
		}

		return app.Run(cfg)
	},
}

func init() {
	rootCmd.Flags().StringVar(&layout, "layout", "side", "pane layout: side, top")
	rootCmd.Flags().BoolVar(&previewOnly, "preview-only", false, "show only rendered preview")
	rootCmd.Flags().BoolVar(&sourceOnly, "source-only", false, "show only raw source")
	rootCmd.Flags().BoolVar(&noWatch, "no-watch", false, "disable file watching")
	rootCmd.Flags().BoolVar(&syncScroll, "sync-scroll", false, "start with scroll sync enabled")

	rootCmd.CompletionOptions.HiddenDefaultCmd = true
	rootCmd.AddCommand(completionCmd)
}

var completionCmd = &cobra.Command{
	Use:   "completion [bash|zsh|fish|powershell]",
	Short: "generate shell completion script",
	Args:  cobra.ExactArgs(1),
	ValidArgs: []string{"bash", "zsh", "fish", "powershell"},
	RunE: func(cmd *cobra.Command, args []string) error {
		switch args[0] {
		case "bash":
			return rootCmd.GenBashCompletion(os.Stdout)
		case "zsh":
			return rootCmd.GenZshCompletion(os.Stdout)
		case "fish":
			return rootCmd.GenFishCompletion(os.Stdout, true)
		case "powershell":
			return rootCmd.GenPowerShellCompletionWithDesc(os.Stdout)
		default:
			return fmt.Errorf("unsupported shell: %s", args[0])
		}
	},
}

func Execute() error {
	return rootCmd.Execute()
}

func resolvePath(arg string) (string, error) {
	abs, err := filepath.Abs(arg)
	if err != nil {
		return "", fmt.Errorf("invalid path %q: %w", arg, err)
	}
	resolved, err := filepath.EvalSymlinks(abs)
	if err != nil {
		return "", fmt.Errorf("cannot resolve path %q: %w", arg, err)
	}
	return resolved, nil
}
