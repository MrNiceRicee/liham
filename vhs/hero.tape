Require liham

Source vhs/config.tape
Output assets/hero.gif

Hide
Type "export PS1='$ '"
Enter
Type "clear"
Enter
Show

# launch browser
Type "liham examples/"
Sleep 250ms
Enter
Sleep 1s

# --- ube-halaya: scroll showcase ---
# browser order (alpha): adobo, filipino-drinks, kamayan, ube-halaya
Down
Sleep 1500ms
Down
Sleep 150ms
Down
Sleep 250ms
Enter
Sleep 1s

# focus preview pane and scroll
Tab
Sleep 300ms
Down Down Down Down Down
Sleep 200ms
Down Down Down Down Down
Sleep 200ms
Down Down Down Down Down
Sleep 400ms

# back to browser
Escape
Sleep 500ms

# --- filipino-drinks: search showcase ---
Up
Sleep 200ms
Up
Sleep 300ms
Enter
Sleep 1s

# search for calamansi
Type "/"
Sleep 300ms
Type "calamansi"
Sleep 300ms
Enter
Sleep 1s

# navigate matches
Type "n"
Sleep 800ms
Type "n"
Sleep 800ms
Type "N"
Sleep 2s

# close search, back to browser
Escape
Sleep 300ms
Escape
Sleep 500ms

# --- kamayan-feast: TOC showcase ---
Down
Sleep 300ms
Enter
Sleep 1s

# open TOC
Type "t"
Sleep 2s

# navigate headings
Down
Sleep 300ms
Down
Sleep 300ms
Down
Sleep 300ms

# jump to heading
Enter
Sleep 2s

# back to browser
Escape
Sleep 500ms

# --- adobo-journal: layout showcase ---
Up
Sleep 200ms
Up
Sleep 300ms
Enter
Sleep 1s

# cycle layouts
Type "l"
Sleep 2s
Type "l"
Sleep 2s
Type "l"
Sleep 2s

# quit
Type "q"
Sleep 1s
