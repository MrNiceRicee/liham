Require liham

Source config.tape
Output assets/hero.gif

Hide
Type "export PS1='$ '"
Enter
Type "clear"
Enter
Show

Type@100ms "liham examples/"
Sleep 500ms
Enter
Sleep 3s

# navigate and open ube halaya
Down
Sleep 500ms
Enter
Sleep 3s

# cycle layout
Type "l"
Sleep 2s

# open search
Type "/"
Sleep 500ms
Type@120ms "ube"
Sleep 1s
Enter
Sleep 2s

# close search, open TOC
Escape
Sleep 500ms
Type "t"
Sleep 3s

# close and quit
Escape
Sleep 1s
Type "q"
Sleep 2s
