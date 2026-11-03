// The cases of the #[test] functions of src-tauri/src/kits/manifest.rs in hangar-ai/hangar, and
// of crates/hangar-core/src/kits/manifest.rs of the native Hangar for schema 2 and native tabs,
// written out as data, in that file's order, translated by hand. Nothing has run them through
// the real Rust yet: that comparison is future work.
//
//   name      where it comes from: the Rust test's name
//   files     the kit folder: path -> text, bytes (a Buffer), or { size } for a file of that many
//             bytes that holds nothing (a module over the limit, without writing 64 MB)
//   manifest  what hangar-kit.json holds, or `raw` for text that is not even JSON
//   expect    "ok", or { exact }, { contains: [...] }, { excludes: [...] }, { startsWith } on the
//             problems joined by "; ", as Rust joins them

const minimal = () => ({ schema: 1, id: "roblox", name: "Roblox", version: "1.0.0", description: "Roblox Studio in Hangar." });
const withFields = (patch) => ({ ...minimal(), ...patch });
const tabWith = (patch) => withFields({ tabs: [{ id: "run", title: "CI run", entry: "tab.html", permissions: [], ...patch }] });
const permissionsTab = (permissions) => withFields({ tabs: [{ id: "t", title: "T", entry: "tab.html", permissions }] });
const withCommands = (commands) => withFields({ commands });
const commandKit = (permissions) =>
  withFields({
    commands: {
      "ci-status": {
        description: "The state of a CI run.",
        run: ["gh", "run", "view", "{run}", "--repo={repo}", "--json", "status"],
        args: { run: { pattern: "[0-9]+", description: "The run's number" }, repo: { pattern: "[\\w.-]+/[\\w.-]+" } },
        timeoutSeconds: 60,
      },
    },
    tabs: [{ id: "t", title: "T", entry: "tab.html", permissions }],
  });

const tabHtml = { "tab.html": "<!doctype html>" };
const cases = [];
const add = (name, manifest, expect, files = {}) => cases.push({ name, manifest, expect, files });
const refused = (exact) => ({ exact });

// a_tab_declares_its_params_and_whether_it_is_one_tab
add("tab params", tabWith({ singleton: true, params: { run: { description: "The run's number", pattern: "[0-9]+" }, repo: { description: "owner/name" } } }), "ok", tabHtml);
add("tab bare", tabWith({}), "ok", tabHtml);

// a_tab_s_params_are_checked_with_the_rest_of_the_manifest
for (const [patch, exact] of [
  [{ params: ["run"] }, "tabs[0].params: must be an object of params by name"],
  [{ params: { "1run": { description: "x" } } }, "tabs[0].params.1run: must be named with a letter or _ first, then letters, digits, _ and -"],
  [{ params: { run: "x" } }, "tabs[0].params.run: must be an object with a description"],
  [{ params: { run: { pattern: "[0-9]+" } } }, "tabs[0].params.run.description: is missing"],
  [{ params: { run: { description: "  " } } }, "tabs[0].params.run.description: is empty"],
  [{ params: { run: { description: "x", pattern: "[" } } }, "tabs[0].params.run.pattern: is not a valid regular expression"],
  [{ params: { run: { description: "x", pattern: " " } } }, "tabs[0].params.run.pattern: is empty"],
  [{ singleton: "yes" }, "tabs[0].singleton: must be true or false"],
]) {
  add(`tab params refused: ${JSON.stringify(patch)}`, tabWith(patch), refused(exact), tabHtml);
}

// a_param_is_held_to_its_rule_whole, a_rule_that_would_backtrack_for_ever_answers_at_once
add("param rules read", tabWith({ params: { run: { description: "x", pattern: "[0-9]+" }, note: { description: "x" } } }), "ok", tabHtml);
add("a backtracking rule is valid", tabWith({ params: { x: { description: "x", pattern: "(a+)+b" } } }), "ok", tabHtml);

// a_complete_manifest_reads_whole
add(
  "a complete manifest",
  withFields({
    author: "A person",
    homepage: "https://example.com/kit",
    icon: "./icon.svg",
    hangar: ">=1.6.0",
    tabs: [{ id: "explorer", title: "Explorer", entry: "tabs\\explorer\\index.html", icon: "tabs/explorer/icon.png", permissions: ["workspace.read", "panes.send", "panes.send"] }],
    setup: [{ id: "plugin", title: "Install the Studio plugin", description: "Copies the bridge plugin into Studio.", run: { windows: "npx rbx-bridge install", macos: "npx rbx-bridge install" } }],
    somethingNew: { ignored: true },
  }),
  "ok",
  { ".claude-plugin/plugin.json": '{"name":"roblox","version":"0.1.0"}', "icon.svg": "<svg/>", "tabs/explorer/index.html": "<!doctype html>", "tabs/explorer/icon.png": "png" },
);

// The native tests. Rust's `native_kit(schema, tab)`: a tab with an id, a title and two
// permissions, which the fields of `tab` complete or replace, under the given schema.
const nativeKit = (schema, tab) => ({ ...minimal(), schema, tabs: [{ id: "t", title: "T", permissions: ["panes.read", "data.write"], ...tab }] });
const stub = "\0asm";
const MEGABYTE = 1024 * 1024;

// a_html_tab_is_a_page_under_either_schema
for (const schema of [1, 2]) add(`an HTML tab under schema ${schema}`, nativeKit(schema, { entry: "tab.html" }), "ok", tabHtml);

// a_wasm_entry_is_a_native_tab_under_schema_2
add("a module that is not there, whatever its case", nativeKit(2, { entry: "tabs\\.\\Absent.WASM" }), { startsWith: "tabs[0].entry: not found" }, { "tabs/hello.wasm": stub });
add("a module entry, with its path folded", nativeKit(2, { entry: "./tabs//hello.wasm" }), "ok", { "tabs/hello.wasm": stub });

// a_schema_1_tab_may_bring_a_module_beside_its_page
for (const schema of [1, 2]) {
  add(`a module beside its page under schema ${schema}`, nativeKit(schema, { entry: "tabs/ci/index.html", native: "tabs\\ci.wasm" }), "ok", { "tabs/ci/index.html": "", "tabs/ci.wasm": stub });
}

// a_wasm_entry_under_schema_1_is_refused_and_says_why
add("a module entry under schema 1", nativeKit(1, { entry: "tabs/hello.wasm" }), refused('tabs[0].entry: a native tab needs "schema": 2'), { "tabs/hello.wasm": stub });
add("a module entry without a schema", { ...nativeKit(1, { entry: "tabs/hello.wasm" }), schema: undefined }, refused("schema: is missing"), { "tabs/hello.wasm": stub });

// a_native_field_is_checked_like_an_entry
const nativeFiles = { "tab.html": "", "tab.wasm": stub, "notes.txt": "" };
for (const [tab, exact] of [
  [{ entry: "tab.html", native: "tab.html" }, "tabs[0].native: must be a .wasm file"],
  [{ entry: "tab.html", native: "missing.wasm" }, "tabs[0].native: not found in the kit folder"],
  [{ entry: "tab.html", native: 3 }, "tabs[0].native: must be a string"],
  [{ entry: "tab.html", native: "../tab.wasm" }, "tabs[0].native: must not climb out with `..`"],
]) {
  add(`native refused: ${JSON.stringify(tab.native)}`, nativeKit(1, tab), refused(exact), nativeFiles);
}
add("a module as the entry is already the module", nativeKit(2, { entry: "tab.wasm", native: "tab.wasm" }), { startsWith: "tabs[0].native: is for a tab with an HTML entry" }, nativeFiles);
add("a null native is as absent as elsewhere", nativeKit(1, { entry: "tab.html", native: null }), "ok", nativeFiles);

// a_module_that_leaves_the_kit_is_refused
for (const entry of ["../x.wasm", "tabs/../../x.wasm", "/etc/x.wasm", "C:\\x.wasm"]) {
  add(`a module entry ${entry}`, nativeKit(2, { entry }), { startsWith: "tabs[0].entry: ", excludes: ["not found"] }, { "t.html": "" });
  add(`a native ${entry}`, nativeKit(2, { entry: "t.html", native: entry }), { startsWith: "tabs[0].native: ", excludes: ["not found"] }, { "t.html": "" });
}

// a_module_is_held_to_the_size_of_a_kit_file
add("a module over 64 MB as the entry", nativeKit(2, { entry: "big.wasm" }), refused("tabs[0].entry: is larger than 64 MB"), { "t.html": "", "big.wasm": { size: 64 * MEGABYTE + 1 } });
add("a module over 64 MB beside the page", nativeKit(2, { entry: "t.html", native: "big.wasm" }), refused("tabs[0].native: is larger than 64 MB"), { "t.html": "", "big.wasm": { size: 64 * MEGABYTE + 1 } });
add("a module of 64 MB is not over", nativeKit(2, { entry: "big.wasm" }), "ok", { "big.wasm": { size: 64 * MEGABYTE } });

// a_page_is_not_a_module_and_the_other_way_round
add("neither a page nor a module", nativeKit(2, { entry: "notes.txt" }), refused("tabs[0].entry: must be a .html or .wasm file"), nativeFiles);
add("a page is no native module", nativeKit(2, { entry: "tab.html", native: "tab.html" }), refused("tabs[0].native: must be a .wasm file"), nativeFiles);

// the_hello_native_example_s_manifest_reads: examples/kits/hello-native/hangar-kit.json
const helloNative = {
  schema: 2,
  id: "hello-native",
  name: "Hello native",
  version: "0.1.0",
  description: "A native tab written in Rust: a form, a table of the workspace's panes, a note kept in the kit's data.",
  author: "Hangar",
  hangar: ">=1.12.1",
  tabs: [{ id: "hello", title: "Hello", entry: "tabs/hello.wasm", permissions: ["panes.read", "panes.send", "data.read", "data.write"] }],
};
add("the hello-native example", helloNative, "ok", { "tabs/hello.wasm": stub });
add("the hello-native example, unbuilt", helloNative, { startsWith: "tabs[0].entry: not found" });

// Not in the Rust tests: what its code says, added so the comparison with the real Rust covers it too.
// The schema is reported once, and a module entry adds nothing to a schema that is not read.
for (const schema of [3, 0, "2", null]) {
  add(`a module entry, schema ${JSON.stringify(schema)}`, nativeKit(schema, { entry: "tabs/hello.wasm" }), schema === 3 ? refused("schema: 3 needs a newer Hangar (this one reads 2)") : refused("schema: must be 1 or 2"), { "tabs/hello.wasm": stub });
}
add("a module entry that is not there, under schema 1", nativeKit(1, { entry: "tabs/hello.wasm" }), refused("tabs[0].entry: not found in the kit folder"));
add("a module entry is a file", nativeKit(2, { entry: "tabs/hello.wasm" }), refused("tabs[0].entry: is not a file"), { "tabs/hello.wasm/x": "" });
add("an empty native", nativeKit(1, { entry: "tab.html", native: "" }), refused("tabs[0].native: is empty"), nativeFiles);
add("a module and a page both wrong are both told", nativeKit(2, { entry: "missing.html", native: "missing.wasm" }), refused("tabs[0].entry: not found in the kit folder; tabs[0].native: not found in the kit folder"));
add("a module after the page's icon is told in the order of Rust", nativeKit(2, { entry: "tab.html", native: "missing.wasm", icon: "missing.svg" }), refused("tabs[0].native: not found in the kit folder; tabs[0].icon: not found in the kit folder"), nativeFiles);
add("native on a tab without an entry", nativeKit(2, { entry: undefined, native: "tab.wasm" }), refused("tabs[0].entry: is missing"), nativeFiles);
add("an upper-case extension is a module", nativeKit(2, { entry: "Tab.WASM" }), "ok", { "Tab.WASM": stub });
add("a module and a page, one tab each", { ...minimal(), schema: 2, tabs: [{ id: "a", title: "A", entry: "a.html", permissions: [] }, { id: "b", title: "B", entry: "b.wasm", permissions: [] }] }, "ok", { "a.html": "", "b.wasm": stub });
add("a schema-1 kit with a module and a page, one tab each", { ...minimal(), schema: 1, tabs: [{ id: "a", title: "A", entry: "a.html", native: "a.wasm", permissions: [] }, { id: "b", title: "B", entry: "b.wasm", permissions: [] }] }, refused('tabs[1].entry: a native tab needs "schema": 2'), { "a.html": "", "a.wasm": stub, "b.wasm": stub });

// a_kit_without_a_plugin_folder_brings_none
add("no plugin folder", minimal(), "ok");
add("a named plugin folder", withFields({ plugin: "claude/" }), "ok", { "claude/.claude-plugin/plugin.json": '{"name":"roblox"}' });

// missing_fields_are_each_named
add("missing fields", { id: "roblox", name: "  " }, { contains: ["schema: is missing", "name: is empty", "version: is missing", "description: is missing"] });
add("not an object", [1], { contains: ["JSON object"] });
cases.push({ name: "not JSON", raw: "{ nope", expect: { contains: ["not valid JSON"] }, files: {} });

// a_bad_id_or_version_is_refused
for (const id of ["R", "Roblox", "rob_lox", "a", "x".repeat(41), "kit.v2"]) add(`bad id ${id}`, withFields({ id }), { startsWith: "id: " });
for (const id of ["ro", "roblox-studio", "k2", "x".repeat(40)]) add(`good id ${id}`, withFields({ id }), "ok");
add("bad version", withFields({ version: "1.0" }), { contains: ["semver"] });
add("newer schema", withFields({ schema: 3 }), refused("schema: 3 needs a newer Hangar (this one reads 2)"));
add("schema 0", withFields({ schema: 0 }), refused("schema: must be 1 or 2"));
add("bad requirement", withFields({ hangar: "soon" }), { contains: ["hangar"] });
add("bad homepage", withFields({ homepage: "javascript:alert(1)" }), { contains: ["homepage"] });

// an_unknown_permission_is_an_error
add("unknown permission", permissionsTab(["panes.read", "files.delete"]), refused('tabs[0].permissions: unknown permission "files.delete"'), { "tab.html": "" });
add("null permissions", permissionsTab(null), { contains: ["permissions"] }, { "tab.html": "" });
add("no permission", permissionsTab([]), "ok", { "tab.html": "" });
for (const permission of ["workspace.read", "panes.read", "panes.send", "files.read", "files.write", "data.read", "data.write", "preview.show", "notify"]) {
  add(`permission ${permission}`, permissionsTab([permission]), "ok", { "tab.html": "" });
}

// data_and_a_local_server_can_be_asked_for
add("data and ports", permissionsTab(["data.read", "data.write", "loopback:8765", "loopback:1024", "loopback:65535", "loopback:8765"]), "ok", { "tab.html": "" });
for (const bad of ["loopback:80", "loopback:1023", "loopback:0", "loopback:abc", "loopback:65536", "loopback:99999", "loopback:", "loopback:08765", "loopback:+8765", "loopback:-8765", "loopback: 8765", "loopback:8765 ", "loopback:8765:1"]) {
  add(`bad port ${JSON.stringify(bad)}`, permissionsTab([bad]), { contains: ["port from 1024 to 65535"] }, { "tab.html": "" });
}
for (const bad of ["hooks:0123456789abcdef", "loopback", "Loopback:8765", "data"]) {
  add(`not a permission ${bad}`, permissionsTab([bad]), { contains: ["unknown permission"] }, { "tab.html": "" });
}

// a_declared_command_reads_whole
add("a declared command", commandKit(["command:ci-status", "command:ci-status", "notify"]), "ok", { "tab.html": "" });

// a_command_may_differ_per_os_and_times_out_after_30_seconds_by_default
add("a command per OS", withCommands({ tail: { description: "The log.", run: { windows: ["logview.exe", "log"], linux: ["tail", "log"] } } }), "ok");
for (const seconds of [1, 120]) add(`timeout ${seconds}`, withCommands({ t: { description: "d", run: ["x"], timeoutSeconds: seconds } }), "ok");

// a_kit_without_commands_has_none
add("null commands", withFields({ commands: null }), "ok");

// a_placeholder_must_be_declared_and_an_arg_must_have_a_pattern
add("undeclared placeholder", withCommands({ view: { description: "d", run: ["gh", "run", "view", "{run}", "--repo={repo}"], args: { run: { pattern: "[0-9]+" } } } }), refused("commands.view.run[4]: the placeholder {repo} is not declared in args"));
add("undeclared placeholder, per OS", withCommands({ view: { description: "d", run: { linux: ["gh", "{run}"] } } }), refused("commands.view.run.linux[1]: the placeholder {run} is not declared in args"));
add("an arg without a pattern", withCommands({ view: { description: "d", run: ["gh", "{run}"], args: { run: { description: "The run" } } } }), refused("commands.view.args.run.pattern: is missing"));
for (const arg of ["[0-9]+", { pattern: "  " }, { pattern: 3 }]) {
  add(`bad arg ${JSON.stringify(arg)}`, withCommands({ view: { description: "d", run: ["gh", "{run}"], args: { run: arg } } }), { startsWith: "commands.view.args.run" });
}
add("a bad arg name", withCommands({ view: { description: "d", run: ["gh"], args: { "a b": { pattern: "x" } } } }), { contains: ["commands.view.args.a b: must be named"] });

// kit_dir_is_filled_in_by_hangar_and_needs_no_arg
add(
  "{kitDir} needs no arg",
  withCommands({
    audit: { description: "d", run: ["node", "{kitDir}/tools/audit.js", "--root={kitDir}", "{id}"], args: { id: { pattern: "[0-9]+" } } },
    plain: { description: "d", run: { windows: ["node", "{kitDir}\\x.js"], linux: ["node", "{kitDir}/x.js"] } },
  }),
  "ok",
);

// kit_dir_is_never_the_program
for (const program of ["{kitDir}", "{kitDir}/tools/audit.exe", "x{kitDir}"]) {
  add(`program ${program}`, withCommands({ view: { description: "d", run: [program, "x"] } }), refused("commands.view.run[0]: must not hold a placeholder: the program is fixed"));
}

// kit_dir_cannot_be_declared_as_an_arg
for (const arg of [{ pattern: ".*" }, { pattern: "x", description: "d" }, "x"]) {
  add(`kitDir as an arg ${JSON.stringify(arg)}`, withCommands({ view: { description: "d", run: ["node", "{kitDir}/x.js"], args: { kitDir: arg } } }), refused("commands.view.args.kitDir: is reserved: Hangar fills {kitDir} in with the kit's folder"));
}
add("kitdir is another name", withCommands({ view: { description: "d", run: ["node", "{kitdir}/x.js"] } }), refused("commands.view.run[1]: the placeholder {kitdir} is not declared in args"));

// a_pattern_that_is_no_rule_or_escapes_its_anchors_is_refused
for (const pattern of ["(", "a)|(?:b", "(?<=a)b", "[", "\\"]) {
  add(`pattern ${JSON.stringify(pattern)}`, withCommands({ view: { description: "d", run: ["gh", "{x}"], args: { x: { pattern } } } }), refused("commands.view.args.x.pattern: is not a valid regular expression"));
}

// the_program_is_a_fixed_name_on_the_path
add("a placeholder as the program", withCommands({ view: { description: "d", run: ["{tool}", "x"], args: { tool: { pattern: "gh|glab" } } } }), refused("commands.view.run[0]: must not hold a placeholder: the program is fixed"));
add("a placeholder in the program", withCommands({ view: { description: "d", run: ["g{tool}"], args: { tool: { pattern: "h" } } } }), { contains: ["must not hold a placeholder"] });
for (const program of ["./gh", "bin/gh", "bin\\gh.exe", "/usr/bin/gh", "C:\\gh.exe", "gh.exe:stream", "gh.cmd.", "gh.cmd ", ".."]) {
  add(`program path ${JSON.stringify(program)}`, withCommands({ view: { description: "d", run: [program] } }), refused("commands.view.run[0]: must be a program's name, found on the PATH, not a path"));
}
for (const empty of ["", "  "]) add(`empty program ${JSON.stringify(empty)}`, withCommands({ view: { description: "d", run: [empty] } }), { contains: ["the program comes first"] });
for (const program of ["gh", "gh.exe", "git-lfs", "python3.12"]) add(`program ${program}`, withCommands({ view: { description: "d", run: [program] } }), "ok");

// a_bad_name_is_refused
for (const name of ["Run", "run_it", "1run", "-run", "ci status", "ci.status", "é"]) {
  add(`bad command name ${name}`, withCommands({ [name]: { description: "d", run: ["gh"] } }), refused(`commands.${name}: must be named with a-z first, then a-z, 0-9 and -`));
}
for (const name of ["run", "r", "ci-status", "ci-2", "a-"]) add(`good command name ${name}`, withCommands({ [name]: { description: "d", run: ["gh"] } }), "ok");

// a_timeout_above_the_maximum_is_refused
for (const seconds of [121, 0, -1, 1.5, "30"]) {
  add(`bad timeout ${JSON.stringify(seconds)}`, withCommands({ t: { description: "d", run: ["x"], timeoutSeconds: seconds } }), refused("commands.t.timeoutSeconds: must be a whole number of seconds from 1 to 120"));
}

// a_run_is_an_argv_and_never_a_command_line
add("run as a line", withCommands({ t: { description: "d", run: "gh run view" } }), refused("commands.t.run: must be an argv array, or one per OS: never a shell command line"));
add("run as a line, per OS", withCommands({ t: { description: "d", run: { linux: "gh run view" } } }), refused("commands.t.run.linux: must be an argv array"));
for (const [run, exact] of [
  [[], "commands.t.run: needs at least the program"],
  [["gh", 3], "commands.t.run[1]: must be a string"],
  [["gh", "a\0b"], "commands.t.run[1]: holds a NUL character"],
  [{ freebsd: ["gh"] }, "commands.t.run: needs an argv for windows, macos or linux"],
  [{}, "commands.t.run: needs an argv for windows, macos or linux"],
]) {
  add(`run ${JSON.stringify(run)}`, withCommands({ t: { description: "d", run } }), refused(exact));
}
add("a blank command", withCommands({ t: { description: " " } }), { contains: ["commands.t.description: is empty", "commands.t.run: is missing"] });
add("commands as a list", withCommands(["x"]), refused("commands: must be an object of commands by name"));
add("a command as a string", withCommands({ t: "gh" }), refused("commands.t: must be an object"));

// a_tab_may_only_name_a_command_its_kit_declares
add("a command not declared", commandKit(["command:ci-status", "command:deploy"]), refused('tabs[0].permissions: "command:deploy" names a command this kit does not declare'), { "tab.html": "" });
for (const bad of ["command:", "command:CI-STATUS", "command:ci-status ", "command:ci status"]) {
  add(`bad command permission ${JSON.stringify(bad)}`, commandKit([bad]), { contains: ["does not declare"] }, { "tab.html": "" });
}
add("no command at all", permissionsTab(["command:ci-status"]), { contains: ["does not declare"] }, { "tab.html": "" });
add("a stored grant is no permission", commandKit(["commands:0123456789abcdef"]), { contains: ["unknown permission"] }, { "tab.html": "" });
add(
  "a wrong command is told about once",
  withFields({ commands: { wrong: { description: "d", run: "gh" } }, tabs: [{ id: "t", title: "T", entry: "tab.html", permissions: ["command:wrong"] }] }),
  refused("commands.wrong.run: must be an argv array, or one per OS: never a shell command line"),
  { "tab.html": "" },
);

// paths_that_leave_the_kit_are_refused
for (const entry of ["../outside.html", "web/../../outside.html", "/etc/x.html", "\\\\server\\share\\x.html", "C:\\x.html", "C:x.html"]) {
  add(`entry ${entry}`, withFields({ tabs: [{ id: "t", title: "T", entry, permissions: [] }] }), { startsWith: "tabs[0].entry" }, { "ok.html": "" });
}
add("plugin climbs", withFields({ plugin: ".." }), { startsWith: "plugin" }, { "ok.html": "" });
add("a missing icon", withFields({ icon: "missing.svg" }), { contains: ["not found"] }, { "ok.html": "" });
add("an icon that is no image", withFields({ icon: "ok.html" }), { contains: [".svg or .png"] }, { "ok.html": "" });

// setup_commands_are_kept_per_os
add(
  "setup per OS",
  withFields({
    setup: [
      { id: "unix-only", title: "Unix", run: { macos: "brew install x", linux: "apt install x" } },
      { id: "everywhere", title: "All", run: { windows: "winget install x", macos: "m", linux: "l", freebsd: "ignored" } },
    ],
  }),
  "ok",
);
add(
  "setup refused",
  withFields({
    setup: [
      { id: "none", title: "Nothing", run: { freebsd: "x" } },
      { id: "blank", title: "Blank", run: { linux: "  " } },
      { id: "none", title: "Twice", run: { linux: "x" } },
      { id: "norun", title: "No run" },
    ],
  }),
  { contains: ["setup[0].run: needs a command", "setup[1].run.linux: is empty", 'setup[2].id: "none" is used twice', "setup[3].run: is missing"] },
);

// the_hangar_requirement_is_checked_against_this_version
add("a good requirement", withFields({ hangar: ">=1.6.0" }), "ok");

// Not in the Rust tests: forms the rules allow or refuse, added so the comparison with the
// real Rust covers them too.
for (const hangar of ["^1.9", "~1.9.0", "1.x", "*", ">=1.9.0, <2.0.0", ">=1.9.0-beta.1", "=1.9.0", "1"]) add(`requirement ${hangar}`, withFields({ hangar }), "ok");
for (const hangar of [">=1.9.0 <2.0.0", ">=1.9.0 || <1", "", "v1.9.0", ">=01.9.0"]) add(`requirement refused ${JSON.stringify(hangar)}`, withFields({ hangar }), { startsWith: "hangar: " });
for (const version of ["0.3.0-beta.1", "1.2.3+build.5", "1.2.3-rc.1+x"]) add(`version ${version}`, withFields({ version }), "ok");
for (const version of ["01.2.3", "1.2", "v1.2.3", "1.2.3-", "1.2.3-01"]) add(`version refused ${version}`, withFields({ version }), { startsWith: "version: " });
add("schema as text", withFields({ schema: "1" }), refused("schema: must be 1 or 2"));
add("schema null", withFields({ schema: null }), refused("schema: must be 1 or 2"));
add("schema -1", withFields({ schema: -1 }), refused("schema: must be 1 or 2"));
add("schema 2.5", withFields({ schema: 2.5 }), refused("schema: must be 1 or 2"));
add("schema 2 is read", withFields({ schema: 2 }), "ok");
add("tabs as an object", withFields({ tabs: {} }), refused("tabs: must be a list"));
add("setup as text", withFields({ setup: "x" }), refused("setup: must be a list"));
add("a tab as text", withFields({ tabs: ["x"] }), refused("tabs[0]: must be an object"));
add("a tab without an id", withFields({ tabs: [{ title: "T" }] }), refused("tabs[0].id: is missing"));
add("a tab id too long", tabWith({ id: "x".repeat(41) }), refused("tabs[0].id: must be 1 to 40 characters among a-z, 0-9 and -"), tabHtml);
add("a folder as an entry", withFields({ tabs: [{ id: "t", title: "T", entry: "a.html", permissions: [] }] }), refused("tabs[0].entry: is not a file"), { "a.html/x": "" });
add("a plugin folder without its file", withFields({ plugin: "claude" }), refused("plugin: holds no .claude-plugin/plugin.json"), { "claude/x": "" });
add("author as a number", withFields({ author: 3 }), refused("author: must be a string"));
add("setup run as text", withFields({ setup: [{ id: "a", title: "A", run: "x" }] }), refused("setup[0].run: must be an object of commands by OS"));
add("setup command as a number", withFields({ setup: [{ id: "a", title: "A", run: { linux: 3 } }] }), { contains: ["setup[0].run.linux: must be a string"] });
add("an unknown field is ignored", withFields({ gallery: { tags: ["x"] } }), "ok");
add("a BOM is dropped", withFields({}), "ok", {});
cases[cases.length - 1].bom = true;

export { cases };

/** Whether the joined problems are what the case expects; the reason otherwise. */
export function judge(expect, problems) {
  if (expect === "ok") return problems === "" ? null : `should pass, and says: ${problems}`;
  if (problems === "") return "should have been refused, and passes";
  if (expect.exact !== undefined && problems !== expect.exact) return `expected «${expect.exact}», got «${problems}»`;
  if (expect.startsWith !== undefined && !problems.startsWith(expect.startsWith)) return `expected to start with «${expect.startsWith}», got «${problems}»`;
  for (const part of expect.contains ?? []) if (!problems.includes(part)) return `expected «${part}» in «${problems}»`;
  for (const part of expect.excludes ?? []) if (problems.includes(part)) return `expected no «${part}» in «${problems}»`;
  return null;
}
