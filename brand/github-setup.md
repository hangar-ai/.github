# GitHub setup

Text and commands for what only a person with access to the organization can set. Nothing here has been run.

## Organization

- Display name: Hangar.AI
- Description: Kits for Hangar.AI: tabs, skills and hooks for your coding agents.
- Website: https://hangar.simnjs.fr
- Avatar: `.github/brand/avatar.png` (500x500)
- Social preview of each repository (Settings › General, no API): `.github/brand/social.png` (1280x640)

## Pinned repositories

1. kit-template
2. catalog
3. kit-guard
4. kit-editor
5. kit-ci
6. kit-tests

## Repositories

```sh
gh repo edit hangar-ai/kit-annotate --homepage https://hangar.simnjs.fr --description "Circle what is wrong on a capture, write a word beside it, and the agent that asked receives the annotated image and your notes." --add-topic hangar-kit --add-topic hangar --add-topic claude-code --add-topic screenshot --add-topic feedback
gh repo edit hangar-ai/kit-checklist --homepage https://hangar.simnjs.fr --description "A tab where a person works through a list of manual checks an agent wrote, and the agent gets the result back to fix what failed." --add-topic hangar-kit --add-topic hangar --add-topic claude-code --add-topic testing --add-topic review
gh repo edit hangar-ai/kit-ci --homepage https://hangar.simnjs.fr --description "A tab that follows a GitHub Actions run, opened by itself after a git push." --add-topic hangar-kit --add-topic hangar --add-topic claude-code --add-topic ci --add-topic github
gh repo edit hangar-ai/kit-deps --homepage https://hangar.simnjs.fr --description "Lists the vulnerable and out-of-date packages of the project from its lockfile, when you ask, and hands any of them to an agent. Agents read the last audit instead of running it again." --add-topic hangar-kit --add-topic hangar --add-topic claude-code --add-topic dependencies --add-topic security
gh repo edit hangar-ai/kit-editor --homepage https://hangar.simnjs.fr --description "Opens a .env or a config file in a tab for you to fill in or check, so that an agent that needs a secret goes on without ever seeing it." --add-topic hangar-kit --add-topic hangar --add-topic claude-code --add-topic env --add-topic secrets --add-topic config
gh repo edit hangar-ai/kit-github --homepage https://hangar.simnjs.fr --description "The open pull requests and issues of the repository, with their checks and reviews, each handed to an agent in one click." --add-topic hangar-kit --add-topic hangar --add-topic claude-code --add-topic github --add-topic pull-requests --add-topic issues
gh repo edit hangar-ai/kit-guard --homepage https://hangar.simnjs.fr --description "Refuses dangerous commands and the reading of secrets before they run. You let one through once, in a click, from its tab." --add-topic hangar-kit --add-topic hangar --add-topic claude-code --add-topic safety --add-topic hooks
gh repo edit hangar-ai/kit-services --homepage https://hangar.simnjs.fr --description "What is running on this computer, on which port, and whose it is: listening ports and Docker containers, tied to the worker whose port block they sit in, without a terminal." --add-topic hangar-kit --add-topic hangar --add-topic claude-code --add-topic ports --add-topic docker --add-topic workers
gh repo edit hangar-ai/kit-template --homepage https://hangar.simnjs.fr --description "The smallest honest kit for Hangar.AI: a tab on Hangar UI, a skill, tests and a capture bench." --add-topic hangar-kit --add-topic hangar --add-topic claude-code --add-topic template
gh repo edit hangar-ai/kit-tests --homepage https://hangar.simnjs.fr --description "Shows whether the tests pass without reading a terminal, and hands a failure to an agent in one click. Agents read the last result instead of running everything again." --add-topic hangar-kit --add-topic hangar --add-topic claude-code --add-topic testing --add-topic hooks
gh repo edit hangar-ai/kit-todo --homepage https://hangar.simnjs.fr --description "Lists the TODO, FIXME, HACK and XXX comments of the project, grouped by file or by tag, and hands any of them to an agent in one click." --add-topic hangar-kit --add-topic hangar --add-topic claude-code --add-topic tasks --add-topic code
gh repo edit hangar-ai/kit-template --template
gh repo edit hangar-ai/catalog --homepage https://hangar.simnjs.fr --description "The list of kits Hangar.AI's gallery shows: a static file, each kit pinned to a reviewed tag." --add-topic hangar --add-topic hangar-kit
gh repo edit hangar-ai/.github --homepage https://hangar.simnjs.fr --description "The hangar-ai organization's profile, its kit-check workflow, and its defaults."
```
