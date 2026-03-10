// shell completion scripts for zsh and bash.
// usage: eval "$(liham --completions zsh)" in .zshrc
//        eval "$(liham --completions bash)" in .bashrc

export function generateZshCompletion(): string {
	return `#compdef liham

_liham() {
  local -a options
  options=(
    '-h[show help]::'
    '--help[show help]::'
    '-i[show theme and terminal info]::'
    '--info[show theme and terminal info]::'
    '-t[color theme]:theme:(auto dark light)'
    '--theme[color theme]:theme:(auto dark light)'
    '-l[pane layout]:layout:(preview-only side top source-only)'
    '--layout[pane layout]:layout:(preview-only side top source-only)'
    '-r[TUI renderer]:renderer:(opentui)'
    '--renderer[TUI renderer]:renderer:(opentui)'
    '--no-images[disable image rendering]::'
    '--no-watch[disable file watching]::'
    '--completions[output shell completion script]:shell:(zsh bash)'
  )

  _arguments -s $options '*:file:_files -g "*.md(N) *(N-/)"'
}

compdef _liham liham`
}

export function generateBashCompletion(): string {
	return `_liham_completions() {
  local cur prev
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"

  case "$prev" in
    -t|--theme)
      COMPREPLY=($(compgen -W "auto dark light" -- "$cur"))
      return
      ;;
    -l|--layout)
      COMPREPLY=($(compgen -W "preview-only side top source-only" -- "$cur"))
      return
      ;;
    -r|--renderer)
      COMPREPLY=($(compgen -W "opentui" -- "$cur"))
      return
      ;;
    --completions)
      COMPREPLY=($(compgen -W "zsh bash" -- "$cur"))
      return
      ;;
  esac

  if [[ "$cur" == -* ]]; then
    COMPREPLY=($(compgen -W "-h --help -i --info -t --theme -l --layout -r --renderer --no-images --no-watch --completions" -- "$cur"))
    return
  fi

  # complete .md files and directories
  COMPREPLY=($(compgen -f -X '!*.md' -- "$cur") $(compgen -d -- "$cur"))
}

complete -o filenames -F _liham_completions liham`
}
