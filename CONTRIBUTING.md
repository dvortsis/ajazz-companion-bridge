# Contributing

## Setup

```text
npm install
npm test            # unit and integration tests; no hardware needed (fake USB device, mock Companion server)
npm run lint
npm run format      # Prettier; CI runs `npm run format:check`
```

Node 20+ is required. Tests run on Windows and Ubuntu in CI.

## Commit messages

Commits follow [Conventional Commits](https://www.conventionalcommits.org/): `type(optional scope): summary`, lower case, imperative, no trailing period, 72 characters or fewer on the first line. Explain the why in the body when it is not obvious.

| Type       | Use for                              |
| :--------- | :----------------------------------- |
| `feat`     | New behaviour or setting             |
| `fix`      | Bug fix                              |
| `docs`     | Documentation and code comments only |
| `test`     | Tests only                           |
| `refactor` | Behaviour-preserving restructuring   |
| `build`    | Dependencies, Docker, packaging      |
| `ci`       | Workflows                            |
| `chore`    | Repo housekeeping                    |

## Adding or verifying a device

See [docs/DEVICES.md](docs/DEVICES.md). Please attach `npm run probe` output when reporting a control that does nothing, and say which OS and deck you used.

## Releases

Update `CHANGELOG.md` (Keep a Changelog format) and the version in `package.json`, then tag `vX.Y.Z`. Pushing a `v*` tag builds and publishes the Docker image.
