# gimme-tool Specification

## Purpose

Defines the `pi-gimme` package's core behavior: extracting structured data from a Pi session by giving the model a `gimme()` tool whose shape, validation, and output the caller controls from the command line.

## Requirements

### Requirement: `--gimme` flag

The package SHALL register a `--gimme` CLI flag that accepts a tool signature string. The flag MAY be passed multiple times; each occurrence SHALL register an additional tool. The package SHALL also register a `--gimme-max-attempts` CLI flag that accepts a positive integer.

#### Scenario: Single flag registers one tool
- **WHEN** the user runs `pi --gimme 'gimme(title: string)' -p '...'` with the package loaded
- **THEN** a tool named `gimme` is registered with a single `title` string parameter

#### Scenario: Repeated flags register multiple tools
- **WHEN** the user passes `--gimme 'gimme(title: string)' --gimme 'submit_pr_comment(body: string)'`
- **THEN** two tools are registered: `gimme` with a `title` string parameter and `submit_pr_comment` with a `body` string parameter

#### Scenario: Flag with no value
- **WHEN** `--gimme` is passed without a value
- **THEN** startup fails with a clear error stating that `--gimme` requires a value

#### Scenario: Invalid max-attempts value
- **WHEN** `--gimme-max-attempts` is not a positive integer
- **THEN** startup fails with a clear error stating the expected format

### Requirement: Signature grammar

A signature SHALL have the form `name(param: type, ...)` optionally followed by a `{ ... }` validation block. Supported parameter types SHALL be `string`, `number`, `boolean`, and `T[]` (an array of any supported scalar type). Nested objects and optional parameters SHALL NOT be supported. The tool name `_error` SHALL be reserved and rejected.

#### Scenario: Scalar parameter types
- **WHEN** the signature is `gimme(title: string, count: number, done: boolean)`
- **THEN** the tool is registered with `title` as a string, `count` as a number, and `done` as a boolean parameter

#### Scenario: Array parameter type
- **WHEN** the signature is `gimme(tags: string[])`
- **THEN** the tool is registered with a `tags` parameter that is an array of strings

#### Scenario: Zero-parameter tool
- **WHEN** the signature is `gimme()`
- **THEN** the tool is registered with no parameters

#### Scenario: Validation block attached
- **WHEN** the signature is `submit_pr_comment(body: string) { ... }`
- **THEN** the tool is registered with the validation block attached to it

#### Scenario: Nested object type rejected
- **WHEN** the signature contains a nested object type such as `gimme(user: { name: string })`
- **THEN** startup fails with a clear error stating that nested objects are not supported

#### Scenario: Optional parameter rejected
- **WHEN** the signature contains an optional parameter such as `gimme(title?: string)`
- **THEN** startup fails with a clear error stating that optional parameters are not supported

#### Scenario: Malformed signature rejected
- **WHEN** the signature does not parse (for example `gimme(title string)`)
- **THEN** startup fails with a clear error identifying the malformed part

#### Scenario: Reserved tool name rejected
- **WHEN** the signature names the tool `_error` (for example `_error(message: string)`)
- **THEN** startup fails with a clear error stating that `_error` is a reserved tool name

### Requirement: Dynamic tool registration

Each parsed signature SHALL register a tool whose name matches the signature name, whose parameter schema matches the declared shape, and whose description instructs the model to call the tool as its final action rather than replying with text.

#### Scenario: Tool schema matches signature
- **WHEN** a signature declares `gimme(title: string, body: string)`
- **THEN** the registered tool accepts a JSON object with `title` and `body` string properties and rejects other shapes

#### Scenario: Tool description guides final-action call
- **WHEN** a tool is registered
- **THEN** its description and prompt guidance tell the model to call the tool as its final action and not to prefix the response with conversational text

#### Scenario: Conflicting tool name rejected
- **WHEN** a signature names a tool that conflicts with a built-in tool or another signature in the same invocation
- **THEN** startup fails with a clear error naming the conflicting tool

### Requirement: Validation execution

When a signature includes a validation block, the block SHALL run synchronously each time the tool is called, with the parsed arguments in scope as variables. A thrown error SHALL be returned to the model as a tool error so the model can retry with corrected arguments. The number of tool calls SHALL be capped by `--gimme-max-attempts`, defaulting to 3.

#### Scenario: Validation passes
- **WHEN** the tool is called with arguments that satisfy the validation block
- **THEN** the arguments are returned as the tool result

#### Scenario: Validation throws
- **WHEN** the tool is called with arguments that cause the validation block to throw
- **THEN** the error message is returned to the model as a tool error and the model is given another attempt

#### Scenario: Attempt cap reached
- **WHEN** the tool has been called `--gimme-max-attempts` times and validation failed on every call
- **THEN** no further retries occur and the last validation error becomes the output

#### Scenario: Validation block syntax error
- **WHEN** the validation block contains invalid JavaScript
- **THEN** startup fails with a clear error stating that the validation block is not valid JavaScript

### Requirement: Prod mechanism

When at least one gimme tool is registered, the package SHALL instruct the model to call the tool as its final action. If the agent settles without calling any gimme tool, the package SHALL send one prod message and request one additional model request, unless the attempt cap is exhausted.

#### Scenario: Model calls the tool
- **WHEN** the model calls a gimme tool during the run
- **THEN** no prod message is sent

#### Scenario: Model settles without calling the tool
- **WHEN** the agent settles and no gimme tool was called and the attempt cap is not exhausted
- **THEN** the package sends one prod message asking the model to call the tool and requests one more model request

#### Scenario: Prodding is bounded
- **WHEN** the model repeatedly settles without calling a gimme tool
- **THEN** the package stops prodding once the attempt cap is exhausted

### Requirement: Print-mode output

In `-p` mode, when a gimme tool call succeeds, the user SHALL see only the tool result: a single-line JSON object followed by a newline. The JSON object SHALL include a `_tool` field whose value is the tool's name, followed by the tool's arguments. When validation is exhausted, the output SHALL be a single-line JSON object with `_tool` set to `"_error"`, `_error` set to `"exhaustion"`, and the last validation error message.

#### Scenario: Successful call output
- **WHEN** the tool is called with `{ "title": "x", "body": "y" }` in `-p` mode
- **THEN** the user sees exactly `{"_tool":"gimme","title":"x","body":"y"}` followed by a newline

#### Scenario: Multiple tools distinguishable
- **WHEN** two tools are registered (for example `gimme` and `submit_pr_comment`) and each is called in `-p` mode
- **THEN** each output includes its own tool name in the `_tool` field

#### Scenario: Validation exhaustion output
- **WHEN** validation fails on every attempt up to the cap in `-p` mode
- **THEN** the user sees a single-line JSON object with `_tool` set to `"_error"`, `_error` set to `"exhaustion"`, and the last validation error message, followed by a newline

### Requirement: No-op without flag

When `--gimme` is not passed, the package SHALL register no gimme tools, inject no system-prompt guidance, and prod nothing.

#### Scenario: Package loaded without the flag
- **WHEN** the package is loaded and `--gimme` is absent
- **THEN** no gimme tools are registered and the session behaves as if the package were not loaded