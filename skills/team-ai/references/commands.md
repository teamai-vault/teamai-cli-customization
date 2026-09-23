# Team AI command map

Use this as an intent map, not as a cached CLI manual. Run `team-ai <command> --help` before relying on exact flags.

| Command | Use it for |
| --- | --- |
| `team-ai init` | First-time user setup: configure the team source and role. It never binds Logical Projects. |
| `team-ai sync` | Refresh and converge Team AI-managed state. |
| `team-ai role list` / `role set` | Inspect or change the selected Role. |
| `team-ai projects list` / `projects set` | Discover Logical Projects, or bind the current Physical Project (the only binding command). |
| `team-ai skill list` / `skill show` | Discover Team Skills and inspect their metadata/source. |
| `team-ai skill install` / `skill remove` | Manage personal Team Skills. The CLI decides whether a Plugin-contained Skill can be installed independently. |
| `team-ai skill contribute` | Contribute a Skill through the supported Team AI contribution workflow. |
| `team-ai tags list` | Browse current Skill tags. |
| `team-ai learning share` | Share a Learning through the supported contribution workflow. |
| `team-ai status` | Read the current Team AI state summary. |
| `team-ai doctor` | Diagnose inconsistent, stale, missing, or conflicting Team AI-managed state. |

## Routing examples

- "Bind this repo to payments and risk." -> `team-ai projects set payments risk`
- "Show experimental skills." -> `team-ai skill list --tag experimental`
- "Install the experimental skills." -> use `team-ai skill install` with the current tag-selection syntax reported by `--help`
- "Share this troubleshooting note with the team." -> `team-ai learning share`
- "Bring Team AI up to date." -> `team-ai sync`
- "Why is Team AI inconsistent?" -> `team-ai status`, then `team-ai doctor`

All team-source discovery and mutation stays behind public `team-ai` commands. This Skill does not require or inspect a particular team's repository layout.
