dev:
    wails3 dev

# Bindings must land in frontend/bindings — the live tree wired into vite via
# the wails('./bindings') plugin and the "~" alias.
generate:
    wails3 generate bindings -clean -ts -i -d ./frontend/bindings
