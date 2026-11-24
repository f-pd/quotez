# quotez development guidelines

## Stack

- Zig 0.17.0 (mandatory) for the QOTD service in `src/`, tests in `tests/`
- Bun + React + Vite for the website in `website/`
- Config: `quotez.toml` for local runs, `quotez.docker.toml` baked into the image;
  production differences go in environment variables, never in a third file

## Commands

```text
zig build            # build
zig build run        # build and run with ./quotez.toml
zig build test       # unit tests
zig build test-all   # unit + integration + e2e + perf + reload + backoffice + selector
```

## Git rules (hard)

- Commit as the repository owner; never change git config or add `--author` overrides.
- No AI attribution anywhere: no Co-authored-by trailers, no tool or agent names, no
  links to agent sessions in commits, PRs, issues or code.
- No scratch files, test binaries or temporary files in the repository root.
