# Quickstart verification

End-to-end verification of the README quickstart against a real model (sahara
provider, `qwen3.6-35b-a3b`, Pi SDK 1.2.0 / CLI 1.0.3).

## Command

```bash
pi -e . --gimme 'gimme(reply: string)' -p 'Reply with "testing 123" only, using the gimme tool.'
```

## Observed output

```
{"_tool":"gimme","reply":"testing 123"}
```

Exactly one line, followed by a newline. Verified byte-for-byte with `od -c`.

## How the output is produced

`-p` mode prints the final assistant message's text, not the tool result. The
extension therefore substitutes the tool's JSON output for the model's final
plain-text message via the `message_end` boundary event (the replacement keeps
the assistant role and mutates the message in place, so agent state, the
persisted transcript, and `-p` output all agree). Messages that carry further
tool calls are left untouched.

## Exhaustion path

```bash
pi -e . --gimme-max-attempts 1 \
  --gimme 'gimme(reply: string) { throw new Error("rejected: testing 123"); }' \
  -p 'Reply with "testing 123" only, using the gimme tool.'
```

Observed output:

```
{"_tool":"_error","_error":"exhaustion","message":"rejected: testing 123"}
```

## Multi-tool path

```bash
pi -e . --gimme 'gimme(reply: string)' --gimme 'submit_pr_comment(body: string)' \
  -p 'Reply with "testing 123" only, using the gimme tool.'
```

Observed output (the `_tool` field names the tool that produced it):

```
{"_tool":"gimme","reply":"testing 123"}
```